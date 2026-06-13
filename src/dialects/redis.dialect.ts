// Redis Dialect — implements IDialect (NoSQL documentaire, façon Mongo) sur Redis Stack.
// Stockage : RedisJSON (JSON.SET/GET/NUMINCRBY) ; requêtes : RediSearch (FT.CREATE/FT.SEARCH).
//   - chaque entité = document JSON à la clé `<prefix><collection>:<id>` ;
//   - un index FT par entité (créé à initSchema) → filtre/tri/count côté serveur (O(log n)) ;
//   - relations M2O par lookup (JSON.GET), façon populate Mongo/Firestore.
// Driver : npm install ioredis (Redis Stack : redis-stack-server, modules search + ReJSON).
// Cf. docs/EXTENSIONS-REDIS-ELASTICSEARCH-EMBARQUE.md
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  EntitySchema,
  FieldDef,
  FilterQuery as DALFilter,
  QueryOptions,
  AggregateStage,
  TxHandle,
} from '../core/types.js';

interface RedisClient {
  call(cmd: string, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

// FieldType @mostajs → type d'index RediSearch
type FtType = 'TAG' | 'NUMERIC' | 'TEXT';
function ftTypeOf(field: FieldDef): FtType {
  switch (field.type) {
    case 'number': return 'NUMERIC';
    case 'text': return 'TEXT';
    case 'boolean':
    case 'string':
    case 'date':
    default: return 'TAG';
  }
}

// Échappe les caractères spéciaux RediSearch dans une valeur TAG (UUID `-`, etc.).
function escTag(v: unknown): string {
  return String(v).replace(/[ ,.<>{}\[\]"':;!@#$%^&*()\-+=~/\\]/g, '\\$&');
}

export class RedisDialect implements IDialect {
  readonly dialectType: DialectType = 'redis';
  private config: ConnectionConfig | null = null;
  private db: RedisClient | null = null;
  /** Cache des types de champs par collection (pour traduire les filtres en FT). */
  private fieldTypes = new Map<string, Record<string, FtType>>();

  // --- Helpers ---

  private prefix(): string { return this.config?.tablePrefix ?? ''; }
  private keyOf(schema: EntitySchema, id: string): string { return `${this.prefix()}${schema.collection}:${id}`; }
  private keyPrefix(collection: string): string { return `${this.prefix()}${collection}:`; }
  private indexOf(collection: string): string { return `idx:${this.prefix()}${collection}`; }
  private client(): RedisClient {
    if (!this.db) throw new Error('Redis not connected. Call connect() first.');
    return this.db;
  }
  private genId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.floor(this.rnd() * 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  private _seed = 987654321;
  private rnd(): number { this._seed = (this._seed * 1103515245 + 12345 + Date.now()) % 2147483648; return this._seed / 2147483648; }

  private withTimestamps(data: Record<string, unknown>, schema: EntitySchema, isCreate: boolean): Record<string, unknown> {
    if (!schema.timestamps) return data;
    const now = new Date().toISOString();
    return isCreate ? { createdAt: now, updatedAt: now, ...data } : { ...data, updatedAt: now };
  }

  private typesFor(schema: EntitySchema): Record<string, FtType> {
    let t = this.fieldTypes.get(schema.collection);
    if (t) return t;
    t = {};
    for (const [name, f] of Object.entries(schema.fields || {})) {
      if (f.type === 'json' || f.type === 'array') continue; // non indexés
      t[name] = ftTypeOf(f);
    }
    for (const [name, rel] of Object.entries(schema.relations || {})) {
      if (rel.type === 'many-to-many' || rel.type === 'one-to-many') continue;
      t[rel.joinColumn || name] = 'TAG';
    }
    if (schema.timestamps) { t.createdAt = 'TAG'; t.updatedAt = 'TAG'; }
    if (schema.softDelete) t._deleted = 'NUMERIC';
    this.fieldTypes.set(schema.collection, t);
    return t;
  }

  // --- Traduction filtre @mostajs → requête RediSearch ---

  private clauseFor(field: string, ftType: FtType, cond: unknown): string {
    const tag = (v: unknown) => `@${field}:{${escTag(v)}}`;
    const num = (lo: string, hi: string) => `@${field}:[${lo} ${hi}]`;
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      const parts: string[] = [];
      for (const [op, val] of Object.entries(cond as Record<string, unknown>)) {
        switch (op) {
          case '$eq': parts.push(ftType === 'NUMERIC' ? num(String(val), String(val)) : tag(val)); break;
          case '$ne': parts.push(`-(${ftType === 'NUMERIC' ? num(String(val), String(val)) : tag(val)})`); break;
          case '$gt': parts.push(num(`(${Number(val)}`, '+inf')); break;
          case '$gte': parts.push(num(`${Number(val)}`, '+inf')); break;
          case '$lt': parts.push(num('-inf', `(${Number(val)}`)); break;
          case '$lte': parts.push(num('-inf', `${Number(val)}`)); break;
          case '$in': parts.push(`@${field}:{${(val as unknown[]).map(escTag).join('|')}}`); break;
          case '$nin': parts.push(`-@${field}:{${(val as unknown[]).map(escTag).join('|')}}`); break;
          case '$exists': parts.push(val ? `@${field}:*` : `-@${field}:*`); break;
          case '$regex': parts.push(`@${field}:*${escTag(val)}*`); break;
          default: throw new Error(`Redis: opérateur de filtre inconnu "${op}".`);
        }
      }
      return parts.join(' ');
    }
    return ftType === 'NUMERIC' ? num(String(cond), String(cond)) : tag(cond);
  }

  private buildQuery(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): string {
    const types = this.typesFor(schema);
    const parts: string[] = [];
    for (const [field, cond] of Object.entries(filter as Record<string, unknown>)) {
      if (field === '$or') {
        const cls = (cond as DALFilter[]).map(c => `(${this.buildQuery(schema, c)})`);
        parts.push(`(${cls.join(' | ')})`);
        continue;
      }
      const ft = types[field] ?? 'TAG';
      parts.push(this.clauseFor(field, ft, cond));
    }
    // soft-delete : exclure les supprimés sauf includeDeleted
    if (schema.softDelete && !(options as { includeDeleted?: boolean } | undefined)?.includeDeleted && !('_deleted' in (filter as object))) {
      parts.push('@_deleted:[0 0]');
    }
    return parts.length ? parts.join(' ') : '*';
  }

  /** Exécute FT.SEARCH et renvoie les documents JSON. */
  private async ftSearch<T>(schema: EntitySchema, query: string, options?: QueryOptions, countOnly = false): Promise<{ total: number; rows: T[] }> {
    const args: (string | number)[] = [this.indexOf(schema.collection), query, 'DIALECT', 2];
    if (countOnly) { args.push('LIMIT', 0, 0); }
    else {
      if (options?.sort) {
        const [f, dir] = Object.entries(options.sort)[0];
        args.push('SORTBY', f, (String(dir) === 'desc' || String(dir) === '-1') ? 'DESC' : 'ASC');
      }
      args.push('LIMIT', options?.skip ?? 0, options?.limit ?? 10000);
      // RETURN <count> : count = nombre TOTAL de tokens suivants ($, AS, __doc = 3).
      args.push('RETURN', 3, '$', 'AS', '__doc');
    }
    const reply = await this.client().call('FT.SEARCH', ...args) as unknown[];
    const total = Number(reply[0]);
    const rows: T[] = [];
    if (!countOnly) {
      // reply = [total, key1, [ '__doc', '<json>' ], key2, [...], ...]
      for (let i = 1; i < reply.length; i += 2) {
        const fields = reply[i + 1] as string[];
        const idx = fields.indexOf('__doc');
        if (idx !== -1) {
          let doc = JSON.parse(fields[idx + 1]);
          if (options?.select?.length) {
            const sel = new Set(['id', ...options.select]);
            doc = Object.fromEntries(Object.entries(doc).filter(([k]) => sel.has(k)));
          }
          rows.push(doc as T);
        }
      }
    }
    return { total, rows };
  }

  // --- Lifecycle ---

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config;
    let Redis: new (uri: string) => RedisClient;
    try {
      const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ 'ioredis' as string);
      Redis = ((mod as { default?: unknown }).default ?? mod) as never;
    } catch (e) {
      throw new Error(`Redis driver not found. Install it: npm install ioredis\nOriginal error: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.db = new Redis(config.uri);
  }

  async disconnect(): Promise<void> {
    try { await this.db?.quit(); } catch { /* ignore */ }
    this.db = null;
  }

  async testConnection(): Promise<boolean> {
    try { return (await this.db?.ping()) === 'PONG'; }
    catch { return false; } // scan-ignore: testConnection retourne explicitement boolean
  }

  // --- Schema : crée un index RediSearch par entité ---

  async initSchema(schemas: EntitySchema[]): Promise<void> {
    const strategy = this.config?.schemaStrategy ?? 'none';
    for (const schema of schemas) {
      if (strategy === 'create' || strategy === 'create-drop') {
        try { await this.client().call('FT.DROPINDEX', this.indexOf(schema.collection)); } catch { /* pas d'index */ }
        await this.truncateTable(schema.collection);
      }
      if (strategy === 'none' || strategy === 'validate') continue;
      await this.ensureIndex(schema);
    }
  }

  private async ensureIndex(schema: EntitySchema): Promise<void> {
    const types = this.typesFor(schema);
    const schemaArgs: string[] = [];
    for (const [field, ft] of Object.entries(types)) {
      schemaArgs.push(`$.${field}`, 'AS', field, ft);
      if (ft !== 'TEXT') schemaArgs.push('SORTABLE');
    }
    try {
      await this.client().call('FT.CREATE', this.indexOf(schema.collection),
        'ON', 'JSON', 'PREFIX', 1, this.keyPrefix(schema.collection), 'SCHEMA', ...schemaArgs);
    } catch (e) {
      if (!/already exists/i.test((e as Error).message)) throw e;
    }
  }

  // --- CRUD ---

  async find<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T[]> {
    const { rows } = await this.ftSearch<T>(schema, this.buildQuery(schema, filter, options), options);
    return rows;
  }
  async findOne<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T | null> {
    const rows = await this.find<T>(schema, filter, { ...options, limit: 1 });
    return rows[0] ?? null;
  }
  async findById<T>(schema: EntitySchema, id: string, options?: QueryOptions): Promise<T | null> {
    const raw = await this.client().call('JSON.GET', this.keyOf(schema, id)) as string | null;
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (schema.softDelete && !(options as { includeDeleted?: boolean } | undefined)?.includeDeleted && doc.deletedAt != null) return null;
    return doc as T;
  }

  async create<T>(schema: EntitySchema, data: Record<string, unknown>): Promise<T> {
    const id = (data.id as string) ?? this.genId();
    const payload = this.withTimestamps({ ...data, id }, schema, true);
    if (schema.softDelete) { payload.deletedAt = payload.deletedAt ?? null; payload._deleted = 0; }
    await this.client().call('JSON.SET', this.keyOf(schema, id), '$', JSON.stringify(payload));
    return payload as T;
  }

  async update<T>(schema: EntitySchema, id: string, data: Record<string, unknown>): Promise<T | null> {
    const raw = await this.client().call('JSON.GET', this.keyOf(schema, id)) as string | null;
    if (!raw) return null;
    const cur = JSON.parse(raw);
    const { id: _ig, ...rest } = data; void _ig;
    const next = this.withTimestamps({ ...cur, ...rest }, schema, false);
    await this.client().call('JSON.SET', this.keyOf(schema, id), '$', JSON.stringify(next));
    return next as T;
  }
  async updateMany(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<number> {
    const rows = await this.find<{ id: string }>(schema, filter);
    let n = 0; for (const r of rows) if (await this.update(schema, r.id, data)) n++; return n;
  }

  async delete(schema: EntitySchema, id: string): Promise<boolean> {
    if (schema.softDelete) {
      return (await this.update(schema, id, { deletedAt: new Date().toISOString(), _deleted: 1 })) != null;
    }
    return (await this.client().del(this.keyOf(schema, id))) > 0;
  }
  async deleteMany(schema: EntitySchema, filter: DALFilter): Promise<number> {
    const rows = await this.find<{ id: string }>(schema, filter);
    let n = 0; for (const r of rows) if (await this.delete(schema, r.id)) n++; return n;
  }

  // --- Queries ---

  async count(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<number> {
    const { total } = await this.ftSearch(schema, this.buildQuery(schema, filter, options), options, true);
    return total;
  }
  async distinct(schema: EntitySchema, field: string, filter: DALFilter, options?: QueryOptions): Promise<unknown[]> {
    const rows = await this.find<Record<string, unknown>>(schema, filter, options);
    return [...new Set(rows.map(r => r[field]))];
  }
  async aggregate<T>(_schema: EntitySchema, _stages: AggregateStage[], _options?: QueryOptions): Promise<T[]> {
    throw new Error('Redis: aggregate() non implémenté (utiliser FT.AGGREGATE — évolution).');
  }

  // --- Relations (lookup M2O) ---

  private async populate<T extends Record<string, unknown>>(schema: EntitySchema, doc: T, relations: string[]): Promise<T> {
    for (const relName of relations) {
      const rel = schema.relations?.[relName];
      if (!rel || rel.type === 'one-to-many' || rel.type === 'many-to-many') continue;
      const fk = rel.joinColumn ?? relName;
      const refId = doc[fk] ?? doc[relName];
      if (typeof refId === 'string') {
        const raw = await this.client().call('JSON.GET', `${this.prefix()}${rel.target.toLowerCase()}s:${refId}`) as string | null;
        if (raw) (doc as Record<string, unknown>)[relName] = JSON.parse(raw);
      }
    }
    return doc;
  }
  async findWithRelations<T>(schema: EntitySchema, filter: DALFilter, relations: string[], options?: QueryOptions): Promise<T[]> {
    const rows = await this.find<Record<string, unknown>>(schema, filter, options);
    return Promise.all(rows.map(r => this.populate(schema, r, relations))) as Promise<T[]>;
  }
  async findByIdWithRelations<T>(schema: EntitySchema, id: string, relations: string[], options?: QueryOptions): Promise<T | null> {
    const doc = await this.findById<Record<string, unknown>>(schema, id, options);
    return doc ? (this.populate(schema, doc, relations) as Promise<T>) : null;
  }

  // --- Upsert ---

  async upsert<T>(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<T> {
    const existing = await this.findOne<{ id: string }>(schema, filter);
    if (existing) return (await this.update<T>(schema, existing.id, data))!;
    return this.create<T>(schema, data);
  }

  // --- Atomic / array ops (RedisJSON) ---

  async increment(schema: EntitySchema, id: string, field: string, amount: number): Promise<Record<string, unknown>> {
    await this.client().call('JSON.NUMINCRBY', this.keyOf(schema, id), `$.${field}`, amount);
    if (schema.timestamps) await this.client().call('JSON.SET', this.keyOf(schema, id), '$.updatedAt', JSON.stringify(new Date().toISOString()));
    return (await this.findById<Record<string, unknown>>(schema, id))!;
  }
  async addToSet(schema: EntitySchema, id: string, field: string, value: unknown): Promise<Record<string, unknown> | null> {
    const doc = await this.findById<Record<string, unknown>>(schema, id);
    if (!doc) return null;
    const arr = Array.isArray(doc[field]) ? (doc[field] as unknown[]) : [];
    if (!arr.includes(value)) arr.push(value);
    return this.update(schema, id, { [field]: arr });
  }
  async pull(schema: EntitySchema, id: string, field: string, value: unknown): Promise<Record<string, unknown> | null> {
    const doc = await this.findById<Record<string, unknown>>(schema, id);
    if (!doc) return null;
    const arr = Array.isArray(doc[field]) ? (doc[field] as unknown[]) : [];
    return this.update(schema, id, { [field]: arr.filter(x => x !== value) });
  }

  // --- Text search : RediSearch full-text sur les champs TEXT ---

  async search<T>(schema: EntitySchema, query: string, fields: string[], options?: QueryOptions): Promise<T[]> {
    const types = this.typesFor(schema);
    const textFields = fields.filter(f => types[f]); // indexés
    const q = textFields.length
      ? textFields.map(f => `@${f}:*${escTag(query)}*`).join(' | ')
      : `*${escTag(query)}*`;
    const { rows } = await this.ftSearch<T>(schema, q, options);
    return rows;
  }

  // --- Transactions : pass-through (multi-clés non atomique ici) ---

  async $transaction<T>(cb: (tx: IDialect) => Promise<T>): Promise<T> { return cb(this); }
  async beginTx(): Promise<TxHandle> {
    throw new Error('Redis: API tx manuelle non supportée — utiliser $transaction(cb).');
  }

  // --- Drops / truncate ---

  async dropTable(tableName: string): Promise<void> { await this.truncateTable(tableName); }
  async truncateTable(tableName: string): Promise<void> {
    const c = this.client();
    let cursor = '0';
    do {
      const [next, batch] = await c.call('SCAN', cursor, 'MATCH', `${this.keyPrefix(tableName)}*`, 'COUNT', 200) as [string, string[]];
      if (batch.length) await c.del(...batch);
      cursor = next;
    } while (cursor !== '0');
  }
  async dropSchema(schemas: EntitySchema[]): Promise<string[]> {
    const dropped: string[] = [];
    for (const s of schemas) {
      try { await this.client().call('FT.DROPINDEX', this.indexOf(s.collection)); } catch { /* pas d'index */ }
      await this.truncateTable(s.collection); dropped.push(s.collection);
    }
    return dropped;
  }
  async truncateAll(schemas: EntitySchema[]): Promise<string[]> { return this.dropSchema(schemas); }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new RedisDialect();
}

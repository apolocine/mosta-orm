// Firestore Dialect — implements IDialect (NoSQL documentaire, façon MongoDB).
// Base NoSQL MANAGÉE Google Cloud : accès TOUJOURS distant (gRPC/TLS) ou émulateur local.
// Driver : npm install @google-cloud/firestore  (pur-JS ; mode preferRest = edge/WebContainer-safe).
// NB : Firestore n'a pas de JOIN/SQL/full-text → relations par lookup (N+1), recherche déléguée
//      au module storage Elasticsearch/OpenSearch (cf. EXTENSIONS-REDIS-ELASTICSEARCH-EMBARQUE.md §2).
// Étude : docs/DIALECTE-FIRESTORE.md · Gabarit : src/dialects/mongo.dialect.ts
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  EntitySchema,
  FilterQuery as DALFilter,
  QueryOptions,
  AggregateStage,
  TxHandle,
} from '../core/types.js';

// ============================================================
// Types minimaux du driver @google-cloud/firestore (typé lâche : peer optional)
// ============================================================

type FsValue = unknown;
interface FsDocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined; }
interface FsQuerySnap { docs: FsDocSnap[]; size: number; empty: boolean; }
interface FsDocRef {
  id: string;
  get(): Promise<FsDocSnap>;
  set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
}
interface FsQuery {
  where(field: string, op: string, value: FsValue): FsQuery;
  orderBy(field: string, dir?: 'asc' | 'desc'): FsQuery;
  limit(n: number): FsQuery;
  offset(n: number): FsQuery;
  select(...fields: string[]): FsQuery;
  get(): Promise<FsQuerySnap>;
  count(): { get(): Promise<{ data(): { count: number } }> };
}
interface FsCollection extends FsQuery {
  doc(id?: string): FsDocRef;
}
interface FsClient {
  collection(path: string): FsCollection;
  batch(): { delete(ref: FsDocRef): void; update(ref: FsDocRef, d: Record<string, unknown>): void; set(ref: FsDocRef, d: Record<string, unknown>): void; commit(): Promise<unknown> };
  runTransaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T>;
  terminate?(): Promise<void>;
}

// Opérateurs de filtre @mostajs → Firestore where()
const OP_MAP: Record<string, string> = {
  $eq: '==', $ne: '!=', $gt: '>', $gte: '>=', $lt: '<', $lte: '<=',
  $in: 'in', $nin: 'not-in', $contains: 'array-contains',
};

// ============================================================
// FirestoreDialect
// ============================================================

class FirestoreDialect implements IDialect {
  readonly dialectType: DialectType = 'firestore';
  private config: ConnectionConfig | null = null;
  private db: FsClient | null = null;
  private static txWarned = false;

  // --- Helpers ---

  private collName(schema: EntitySchema): string {
    return `${this.config?.tablePrefix ?? ''}${schema.collection}`;
  }
  private coll(schema: EntitySchema): FsCollection {
    if (!this.db) throw new Error('Firestore not connected. Call connect() first.');
    return this.db.collection(this.collName(schema));
  }
  /** snapshot → { id, ...data } (équivalent normalize Mongo _id→id) */
  private normalize<T>(snap: FsDocSnap): T {
    return { id: snap.id, ...(snap.data() ?? {}) } as T;
  }
  private stripId(data: Record<string, unknown>): Record<string, unknown> {
    const { id, ...rest } = data; void id; return rest;
  }
  private withTimestamps(data: Record<string, unknown>, schema: EntitySchema, isCreate: boolean): Record<string, unknown> {
    if (!schema.timestamps) return data;
    const now = new Date();
    return isCreate ? { createdAt: now, updatedAt: now, ...data } : { ...data, updatedAt: now };
  }

  /** Applique les contraintes de filtre @mostajs à une FsQuery. Lève sur opérateur non supporté. */
  private applyFilter(q: FsQuery, schema: EntitySchema, filter: DALFilter, options?: QueryOptions): FsQuery {
    let query = q;
    // soft-delete : par défaut, exclure les documents supprimés
    if (schema.softDelete && !(options as { includeDeleted?: boolean } | undefined)?.includeDeleted && !('deletedAt' in (filter as object))) {
      query = query.where('deletedAt', '==', null);
    }
    for (const [field, cond] of Object.entries(filter as Record<string, unknown>)) {
      if (field === '$or') {
        // Firestore n'a pas de OR inter-champs (utiliser `in`/`array-contains-any`, ≤30).
        throw new Error('Firestore: `$or` inter-champs non supporté nativement (cf. DIALECTE-FIRESTORE.md §4).');
      }
      if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
        for (const [op, val] of Object.entries(cond as Record<string, unknown>)) {
          if (op === '$regex' || op === '$exists') {
            throw new Error(`Firestore: opérateur ${op} non supporté (pas de full-text/exists ; déléguer la recherche au module storage ES/OpenSearch).`);
          }
          const fsOp = OP_MAP[op];
          if (!fsOp) throw new Error(`Firestore: opérateur de filtre inconnu "${op}".`);
          query = query.where(field, fsOp, val);
        }
      } else {
        query = query.where(field, '==', cond);
      }
    }
    return query;
  }

  private applyOptions(q: FsQuery, options?: QueryOptions): FsQuery {
    let query = q;
    if (options?.sort) for (const [f, dir] of Object.entries(options.sort)) query = query.orderBy(f, (String(dir) === 'desc' || String(dir) === '-1') ? 'desc' : 'asc');
    if (options?.skip) query = query.offset(options.skip);
    if (options?.limit) query = query.limit(options.limit);
    if (options?.select?.length) query = query.select(...options.select);
    return query;
  }

  // --- Lifecycle ---

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config;
    let Firestore: new (opts: Record<string, unknown>) => FsClient;
    try {
      const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ '@google-cloud/firestore' as string);
      Firestore = ((mod as { Firestore?: unknown }).Firestore ?? (mod as { default?: unknown }).default) as never;
    } catch (e) {
      throw new Error(
        `Firestore driver not found. Install it: npm install @google-cloud/firestore\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    // URI : firestore://<projectId>?keyFile=/chemin/sa.json&rest=true
    const u = new URL(config.uri.replace(/^firestore:\/\//, 'http://'));
    const projectId = u.hostname || u.pathname.replace(/^\//, '') || process.env.GOOGLE_CLOUD_PROJECT;
    const keyFile = u.searchParams.get('keyFile') ?? undefined;
    const preferRest = u.searchParams.get('rest') === 'true';
    if (keyFile) process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;
    // Si FIRESTORE_EMULATOR_HOST est posé, le SDK route vers l'émulateur (aucune clé requise).
    const opts: Record<string, unknown> = { projectId };
    if (preferRest) opts.preferRest = true;
    this.db = new Firestore(opts);

    if (config.schemaStrategy === 'create' || config.schemaStrategy === 'create-drop') {
      // schemaless : rien à créer ; le drop éventuel se fait à initSchema/disconnect.
    }
  }

  async disconnect(): Promise<void> {
    await this.db?.terminate?.();
    this.db = null;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.db) return false;
      // NB : Firestore RÉSERVE tout identifiant au motif __…__ (double underscore) → un nom
      // de sonde comme "__ping__" lève INVALID_ARGUMENT. On utilise un nom non réservé.
      await this.db.collection('mostajs_health_check').limit(1).get();
      return true;
    } catch {
      return false; // scan-ignore: testConnection retourne explicitement boolean
    }
  }

  // --- Schema management (Firestore est schemaless : pas de DDL) ---

  async initSchema(schemas: EntitySchema[]): Promise<void> {
    const strategy = this.config?.schemaStrategy ?? 'none';
    if (strategy === 'create' || strategy === 'create-drop') {
      // create = repartir propre : vider les collections déclarées (coûteux — facturé par doc).
      for (const s of schemas) await this.truncateTable(this.collName(s));
    }
    // Pas d'index à créer ici : Firestore gère les index simples automatiquement ;
    // les index composites se déclarent côté GCP (firestore.indexes.json) — hors scaffold.
  }

  // --- CRUD ---

  async find<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T[]> {
    let q: FsQuery = this.coll(schema);
    q = this.applyFilter(q, schema, filter, options);
    q = this.applyOptions(q, options);
    const snap = await q.get();
    return snap.docs.map(d => this.normalize<T>(d));
  }

  async findOne<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T | null> {
    const rows = await this.find<T>(schema, filter, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  async findById<T>(schema: EntitySchema, id: string, options?: QueryOptions): Promise<T | null> {
    const snap = await this.coll(schema).doc(id).get();
    if (!snap.exists) return null;
    const doc = this.normalize<Record<string, unknown>>(snap);
    if (schema.softDelete && !(options as { includeDeleted?: boolean } | undefined)?.includeDeleted && doc.deletedAt != null) return null;
    return doc as T;
  }

  async create<T>(schema: EntitySchema, data: Record<string, unknown>): Promise<T> {
    const coll = this.coll(schema);
    const id = (data.id as string) ?? coll.doc().id;
    const payload = this.withTimestamps(this.stripId(data), schema, true);
    // soft-delete : poser explicitement deletedAt:null. Sinon le champ est ABSENT et la requête
    // de visibilité where('deletedAt','==',null) NE le matche PAS (Firestore ignore les champs
    // manquants sur == null) → le document serait invisible dès sa création.
    if (schema.softDelete && payload.deletedAt === undefined) payload.deletedAt = null;
    await coll.doc(id).set(payload);
    return { id, ...payload } as T;
  }

  async update<T>(schema: EntitySchema, id: string, data: Record<string, unknown>): Promise<T | null> {
    const ref = this.coll(schema).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const payload = this.withTimestamps(this.stripId(data), schema, false);
    await ref.update(payload);
    const after = await ref.get();
    return this.normalize<T>(after);
  }

  async updateMany(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<number> {
    const rows = await this.find<{ id: string }>(schema, filter);
    let n = 0;
    for (const r of rows) { if (await this.update(schema, r.id, data)) n++; }
    return n;
  }

  async delete(schema: EntitySchema, id: string): Promise<boolean> {
    const ref = this.coll(schema).doc(id);
    if (schema.softDelete) {
      const snap = await ref.get();
      if (!snap.exists) return false;
      await ref.update({ deletedAt: new Date() });
      return true;
    }
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }

  async deleteMany(schema: EntitySchema, filter: DALFilter): Promise<number> {
    const rows = await this.find<{ id: string }>(schema, filter);
    if (!this.db) return 0;
    // batch ≤ 500 writes
    let n = 0;
    for (let i = 0; i < rows.length; i += 450) {
      const batch = this.db.batch();
      for (const r of rows.slice(i, i + 450)) {
        // soft-delete : update() (merge) et NON set() qui écraserait tout le document.
        if (schema.softDelete) batch.update(this.coll(schema).doc(r.id), { deletedAt: new Date() });
        else batch.delete(this.coll(schema).doc(r.id));
        n++;
      }
      await batch.commit();
    }
    return n;
  }

  // --- Queries ---

  async count(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<number> {
    let q: FsQuery = this.coll(schema);
    q = this.applyFilter(q, schema, filter, options);
    const agg = await q.count().get();
    return agg.data().count;
  }

  async distinct(schema: EntitySchema, field: string, filter: DALFilter, options?: QueryOptions): Promise<unknown[]> {
    const rows = await this.find<Record<string, unknown>>(schema, filter, options);
    return [...new Set(rows.map(r => r[field]))];
  }

  async aggregate<T>(_schema: EntitySchema, _stages: AggregateStage[], _options?: QueryOptions): Promise<T[]> {
    // TODO scaffold : pipeline d'agrégation ($group/$match/$sort) non câblé.
    // Firestore n'a pas de pipeline serveur → agrégation côté client ou via API count/sum/avg.
    throw new Error('Firestore: aggregate() non implémenté (scaffold) — cf. DIALECTE-FIRESTORE.md §3.');
  }

  // --- Relations (lookup N+1, façon populate Mongo) ---

  private async populate<T extends Record<string, unknown>>(schema: EntitySchema, doc: T, relations: string[]): Promise<T> {
    for (const relName of relations) {
      const rel = schema.relations?.[relName];
      if (!rel) continue;
      const fk = rel.joinColumn ?? relName;
      const refId = doc[fk] ?? doc[relName];
      if (typeof refId === 'string') {
        // target collection = nom de collection de l'entité cible (convention : pluriel/role applicatif)
        const targetColl = `${this.config?.tablePrefix ?? ''}${rel.target.toLowerCase()}s`;
        if (!this.db) break;
        const snap = await this.db.collection(targetColl).doc(refId).get();
        if (snap.exists) (doc as Record<string, unknown>)[relName] = this.normalize(snap);
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

  // --- Atomic / array ops (FieldValue) ---

  async increment(schema: EntitySchema, id: string, field: string, amount: number): Promise<Record<string, unknown>> {
    const ref = this.coll(schema).doc(id);
    await ref.update({ [field]: await this.fieldValue('increment', amount) });
    return this.normalize(await ref.get());
  }
  async addToSet(schema: EntitySchema, id: string, field: string, value: unknown): Promise<Record<string, unknown> | null> {
    const ref = this.coll(schema).doc(id);
    await ref.update({ [field]: await this.fieldValue('arrayUnion', value) });
    return this.normalize(await ref.get());
  }
  async pull(schema: EntitySchema, id: string, field: string, value: unknown): Promise<Record<string, unknown> | null> {
    const ref = this.coll(schema).doc(id);
    await ref.update({ [field]: await this.fieldValue('arrayRemove', value) });
    return this.normalize(await ref.get());
  }
  private async fieldValue(kind: 'increment' | 'arrayUnion' | 'arrayRemove', v: unknown): Promise<unknown> {
    const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ '@google-cloud/firestore' as string);
    const FV = (mod as { FieldValue: Record<string, (x: unknown) => unknown> }).FieldValue;
    return FV[kind](v);
  }

  // --- Text search : DÉLÉGUÉ au module storage (Firestore n'a pas de full-text) ---

  async search<T>(_schema: EntitySchema, _query: string, _fields: string[], _options?: QueryOptions): Promise<T[]> {
    throw new Error(
      'Firestore: pas de recherche full-text native. Déléguer au module storage Elasticsearch/OpenSearch ' +
      '(EXTENSIONS-REDIS-ELASTICSEARCH-EMBARQUE.md §2), alimenté en CDC.'
    );
  }

  // --- Transactions : closure-scoped (runTransaction). Manuel non supporté. ---

  async $transaction<T>(cb: (tx: IDialect) => Promise<T>): Promise<T> {
    // Firestore = transactions par closure. Limite scaffold : les ops internes utilisent
    // this.db (pas l'objet tx Firestore) → pass-through non strictement atomique.
    if (!FirestoreDialect.txWarned) {
      FirestoreDialect.txWarned = true;
      console.warn('[firestore] $transaction(cb) : pass-through non atomique (scaffold). Voir DIALECTE-FIRESTORE.md §4.');
    }
    return cb(this);
  }
  async beginTx(): Promise<TxHandle> {
    throw new Error('Firestore: API tx manuelle (beginTx/commitTx/rollbackTx) non supportée — utiliser $transaction(cb).');
  }

  // --- Schema drops / truncate ---

  async dropTable(tableName: string): Promise<void> { await this.truncateTable(tableName); }
  async truncateTable(tableName: string): Promise<void> {
    if (!this.db) return;
    const snap = await this.db.collection(tableName).get();
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = this.db.batch();
      for (const d of snap.docs.slice(i, i + 450)) batch.delete(this.db.collection(tableName).doc(d.id));
      await batch.commit();
    }
  }
  async dropSchema(schemas: EntitySchema[]): Promise<string[]> {
    const dropped: string[] = [];
    for (const s of schemas) { await this.truncateTable(this.collName(s)); dropped.push(this.collName(s)); }
    return dropped;
  }
  async truncateAll(schemas: EntitySchema[]): Promise<string[]> { return this.dropSchema(schemas); }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new FirestoreDialect();
}

// ClickHouse Dialect — extends AbstractSqlDialect (scope « append/analytique »).
// OLAP colonnaire distribué (MergeTree), interface HTTP. Driver: npm install @clickhouse/client
//
// ⚠ PARADIGME NON-OLTP (cf. docs/NOUVEAUX-DIALECTES-…-FIREBIRD.md §2) :
//  - pas de contrainte PK / UNIQUE / FK (la « primary key » MergeTree = clé de tri) ;
//  - UPDATE/DELETE = MUTATIONS `ALTER TABLE … UPDATE/DELETE` (rendues SYNCHRONES via
//    le réglage mutations_sync) — coûteuses, à réserver à un usage append-mostly ;
//  - INSERT par batch privilégié ; unicité NON garantie.
//
// Spécificités driver gérées :
//  - paramètres TYPÉS `{pN:Type}` (pas de `?`) → conversion dans doExecuteQuery/Run ;
//  - `ENGINE = MergeTree() ORDER BY id` obligatoire au CREATE → generateCreateTable surchargé ;
//  - colonnes Nullable(T) (sauf id) ; dates au format 'YYYY-MM-DD HH:MM:SS'.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  EntitySchema,
  FieldDef,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

const CLICKHOUSE_TYPE_MAP: Record<string, string> = {
  string:  'String',
  text:    'String',
  number:  'Float64',
  boolean: 'UInt8',
  date:    'DateTime',
  json:    'String',
  array:   'String',
};

/** Forme minimale du client @clickhouse/client. */
interface ChClient {
  query(p: { query: string; query_params?: Record<string, unknown>; format?: string }): Promise<{ json<T>(): Promise<T> }>;
  command(p: { query: string; query_params?: Record<string, unknown> }): Promise<unknown>;
  ping(): Promise<{ success: boolean }>;
  close(): Promise<void>;
}

export class ClickHouseDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'clickhouse';
  db: ChClient | null = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;  // ClickHouse : backticks
  }
  getPlaceholder(_index: number): string { return '?'; }  // converti en {pN:Type} à l'exécution
  fieldToSqlType(field: FieldDef): string {
    return `Nullable(${CLICKHOUSE_TYPE_MAP[field.type] || 'String'})`;
  }
  getIdColumnType(): string { return 'String'; }            // non-nullable (clé de tri MergeTree)

  getTableListQuery(): string {
    return 'SELECT name FROM system.tables WHERE database = currentDatabase()';
  }
  protected async getExistingColumns(tableName: string): Promise<Set<string>> {
    try {
      const rows = await this.executeQuery<{ name: string }>(
        'SELECT name FROM system.columns WHERE database = currentDatabase() AND table = ?',
        [tableName],
      );
      return new Set(rows.map(r => r.name).filter(Boolean));
    } catch { return new Set(); }
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return true; }
  protected supportsReturning(): boolean { return false; }
  protected supportsAlterTableAddForeignKey(): boolean { return false; } // pas de FK
  protected supportsPartialIndex(): boolean { return false; }
  protected serializeBoolean(v: boolean): unknown { return v ? 1 : 0; }
  protected deserializeBoolean(v: unknown): boolean { return v === 1 || v === '1' || v === true; }

  /** ClickHouse DateTime : 'YYYY-MM-DD HH:MM:SS' (UTC). Gère les sentinels "now". */
  protected serializeDate(value: unknown): unknown {
    if (value === 'now' || value === '__MOSTA_NOW__') value = new Date();
    const d = value instanceof Date ? value : new Date(value as string);
    if (isNaN(d.getTime())) return value;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  /** insensible à la casse : ClickHouse a ILIKE. */
  protected buildRegexCondition(col: string, flags?: string): string {
    return `${col} ${flags?.includes('i') ? 'ILIKE' : 'LIKE'} ${this.nextPlaceholder()}`;
  }

  // ClickHouse n'a pas d'index « contrainte » SQL classique → pas de CREATE INDEX.
  protected generateIndexes(): string[] { return []; }

  // --- DDL : CREATE TABLE … ENGINE = MergeTree() ---

  protected generateCreateTable(schema: EntitySchema): string {
    const q = (n: string) => this.quoteIdentifier(n);
    const cols: string[] = [`  ${q('id')} ${this.getIdColumnType()}`];

    const fkCols = new Set<string>();
    for (const [rn, rel] of Object.entries(schema.relations || {})) {
      if (rel.type === 'many-to-many' || rel.type === 'one-to-many') continue;
      fkCols.add(rel.joinColumn || rn);
    }
    for (const [name, field] of Object.entries(schema.fields || {})) {
      if (name === 'id' || fkCols.has(name)) continue;
      let c = `  ${q(name)} ${this.fieldToSqlType(field)}`;
      const isNow = field.default === 'now' || field.default === '__MOSTA_NOW__';
      if (field.default !== undefined && !isNow && field.default !== null) {
        const dv = this.serializeValue(field.default, field);
        if (typeof dv === 'string') c += ` DEFAULT '${dv.replace(/'/g, "\\'")}'`;
        else if (typeof dv === 'number') c += ` DEFAULT ${dv}`;
      }
      cols.push(c);
    }
    for (const [name, rel] of Object.entries(schema.relations || {})) {
      if (rel.type === 'many-to-many' || rel.type === 'one-to-many') continue;
      cols.push(`  ${q(rel.joinColumn || name)} Nullable(${this.getIdColumnType()})`);
    }
    if (schema.timestamps) {
      cols.push(`  ${q('createdAt')} ${this.fieldToSqlType({ type: 'date' })}`);
      cols.push(`  ${q('updatedAt')} ${this.fieldToSqlType({ type: 'date' })}`);
    }
    if (schema.softDelete) cols.push(`  ${q('deletedAt')} ${this.fieldToSqlType({ type: 'date' })}`);

    const tbl = q(this.getPrefixedName(schema.collection));
    return `CREATE TABLE IF NOT EXISTS ${tbl} (\n${cols.join(',\n')}\n) ENGINE = MergeTree() ORDER BY ${q('id')}`;
  }

  // --- DROP : ClickHouse n'a pas CASCADE ---
  protected getDropTableSql(tableName: string): string {
    return `DROP TABLE IF EXISTS ${this.quoteIdentifier(this.getPrefixedName(tableName))}`;
  }

  // --- Conversion `?` positionnels → paramètres typés ClickHouse {pN:Type} ---

  private bind(sql: string, params: unknown[]): { query: string; query_params: Record<string, unknown> } {
    const query_params: Record<string, unknown> = {};
    let i = 0;
    const query = sql.replace(/\?/g, () => {
      const v = params[i++];
      if (v === null || v === undefined) return 'NULL';
      const name = `p${i - 1}`;
      let type: string, val: unknown = v;
      if (typeof v === 'boolean') { type = 'UInt8'; val = v ? 1 : 0; }
      else if (typeof v === 'number') { type = Number.isInteger(v) ? 'Int64' : 'Float64'; }
      else { type = 'String'; val = String(v); }
      query_params[name] = val;
      return `{${name}:${type}}`;
    });
    return { query, query_params };
  }

  /** Réécrit UPDATE/DELETE en mutations ClickHouse (ALTER TABLE … UPDATE/DELETE). */
  private toMutation(sql: string): string {
    let s = sql.trim();
    let m = s.match(/^UPDATE\s+(.+?)\s+SET\s+([\s\S]+)$/i);
    if (m) return `ALTER TABLE ${m[1]} UPDATE ${m[2]}`;
    m = s.match(/^DELETE\s+FROM\s+(\S+)\s+WHERE\s+([\s\S]+)$/i);
    if (m) return `ALTER TABLE ${m[1]} DELETE WHERE ${m[2]}`;
    m = s.match(/^DELETE\s+FROM\s+(\S+)\s*$/i);
    if (m) return `ALTER TABLE ${m[1]} DELETE WHERE 1 = 1`;
    return s;
  }

  // --- Connection lifecycle ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    let createClient: (cfg: Record<string, unknown>) => ChClient;
    try {
      const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ '@clickhouse/client' as string);
      createClient = (mod as { createClient: typeof createClient }).createClient;
    } catch (e: unknown) {
      throw new Error(
        `ClickHouse driver not found. Install it: npm install @clickhouse/client\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    // URI : http(s)://user:password@host:port/database
    const u = new URL(config.uri);
    const database = u.pathname.replace(/^\//, '') || 'default';
    this.db = createClient({
      url: `${u.protocol}//${u.hostname}:${u.port || 8123}`,
      username: decodeURIComponent(u.username) || 'default',
      password: decodeURIComponent(u.password) || '',
      database,
      // Mutations SYNCHRONES → update/delete visibles immédiatement (read-after-write).
      clickhouse_settings: { mutations_sync: '2' },
    });
  }

  async doDisconnect(): Promise<void> {
    const db = this.db; this.db = null;
    if (db) await db.close();
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.db) return false;
    try { return (await this.db.ping()).success; }
    catch (e) { this.log('TEST_CONNECTION', `down: ${(e as Error).message}`); return false; }
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.db) throw new Error('ClickHouse not connected. Call connect() first.');
    const { query, query_params } = this.bind(sql, params);
    const rs = await this.db.query({ query, query_params, format: 'JSONEachRow' });
    return await rs.json<T[]>();
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.db) throw new Error('ClickHouse not connected. Call connect() first.');
    const { query, query_params } = this.bind(this.toMutation(sql), params);
    await this.db.command({ query, query_params });
    // ClickHouse n'expose pas d'affected-rows fiable sur INSERT/mutation.
    return { changes: 1 };
  }
}

export function createDialect(): IDialect {
  return new ClickHouseDialect();
}

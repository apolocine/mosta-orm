// Cassandra Dialect — extends AbstractSqlDialect (CQL : SQL-like, placeholders `?`).
// NoSQL wide-column distribué. R&D / périmètre borné (cf. roadmap §A6, doc §3).
// Driver : npm install cassandra-driver (DataStax, officiel).
//
// ⚠ PARADIGME CQL (query-first) :
//  - pas de JOIN ; requêtes pilotées par la PARTITION KEY (ici `id`) ;
//  - WHERE sur colonne non-clé ⇒ `ALLOW FILTERING` (coûteux — OK petit volume) ;
//  - pas de UNIQUE/FK ; pas de DEFAULT/NOT NULL ; pas d'OFFSET ni d'ORDER BY arbitraire ;
//  - upsert natif (INSERT = upsert) ; pas de compteur d'affected-rows.
//
// ✅ STATUT : VALIDÉ LIVE sur amia (test-sgbd 20/20, 2026-06-12). NB : Cassandra 4.1 exige
//   Java 11 (option JVM CMS retirée en Java 14+ → ne démarre pas sous Java 17). CQL n'accepte
//   pas la tautologie `WHERE 1=1` des filtres vides → on la retire (stripTautology).
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  EntitySchema,
  FieldDef,
  QueryOptions,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

const CASSANDRA_TYPE_MAP: Record<string, string> = {
  string:  'text',
  text:    'text',
  number:  'double',
  boolean: 'boolean',
  date:    'timestamp',
  json:    'text',
  array:   'text',
};

interface CassClient {
  connect(): Promise<void>;
  execute(query: string, params?: unknown[], options?: Record<string, unknown>): Promise<{ rows: Record<string, unknown>[] }>;
  shutdown(): Promise<void>;
}

export class CassandraDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'cassandra';
  db: CassClient | null = null;
  private keyspace = 'mostajs_dev';

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string { return `"${name.replace(/"/g, '""')}"`; }
  getPlaceholder(_index: number): string { return '?'; }
  fieldToSqlType(field: FieldDef): string { return CASSANDRA_TYPE_MAP[field.type] || 'text'; }
  getIdColumnType(): string { return 'text'; }

  getTableListQuery(): string {
    return `SELECT table_name AS name FROM system_schema.tables WHERE keyspace_name = '${this.keyspace}'`;
  }
  protected async getExistingColumns(tableName: string): Promise<Set<string>> {
    try {
      const rows = await this.executeQuery<{ name: string }>(
        `SELECT column_name AS name FROM system_schema.columns WHERE keyspace_name = '${this.keyspace}' AND table_name = ? ALLOW FILTERING`,
        [tableName],
      );
      return new Set(rows.map(r => r.name).filter(Boolean));
    } catch { return new Set(); }
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return true; }
  protected supportsReturning(): boolean { return false; }
  protected supportsAlterTableAddForeignKey(): boolean { return false; }
  protected supportsPartialIndex(): boolean { return false; }
  protected serializeBoolean(v: boolean): unknown { return v; }            // boolean natif CQL
  protected deserializeBoolean(v: unknown): boolean { return v === true || v === 1 || v === '1'; }
  protected serializeDate(value: unknown): unknown {
    if (value === 'now' || value === '__MOSTA_NOW__') return new Date();
    if (value instanceof Date) return value;
    const d = new Date(value as string);
    return isNaN(d.getTime()) ? value : d;                                 // timestamp CQL = Date JS
  }

  /** CQL n'a pas d'ILIKE/regex serveur ; LIKE nécessite un index SASI. On reste sur LIKE. */
  protected buildRegexCondition(col: string, _flags?: string): string {
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  // CQL : LIMIT seulement (pas d'OFFSET) ; ORDER BY arbitraire non supporté.
  protected buildLimitOffset(options?: QueryOptions): string {
    return options?.limit ? ` LIMIT ${options.limit}` : '';
  }
  protected buildOrderBy(): string { return ''; }
  protected generateIndexes(): string[] { return []; }

  // --- DDL : CREATE TABLE (id PRIMARY KEY ; ni NOT NULL/UNIQUE/FK/DEFAULT) ---

  protected generateCreateTable(schema: EntitySchema): string {
    const q = (n: string) => this.quoteIdentifier(n);
    const cols: string[] = [`  ${q('id')} ${this.getIdColumnType()} PRIMARY KEY`];
    const fkCols = new Set<string>();
    for (const [rn, rel] of Object.entries(schema.relations || {})) {
      if (rel.type === 'many-to-many' || rel.type === 'one-to-many') continue;
      fkCols.add(rel.joinColumn || rn);
    }
    for (const [name, field] of Object.entries(schema.fields || {})) {
      if (name === 'id' || fkCols.has(name)) continue;
      cols.push(`  ${q(name)} ${this.fieldToSqlType(field)}`);
    }
    for (const [name, rel] of Object.entries(schema.relations || {})) {
      if (rel.type === 'many-to-many' || rel.type === 'one-to-many') continue;
      cols.push(`  ${q(rel.joinColumn || name)} ${this.getIdColumnType()}`);
    }
    if (schema.timestamps) {
      cols.push(`  ${q('createdAt')} timestamp`);
      cols.push(`  ${q('updatedAt')} timestamp`);
    }
    if (schema.softDelete) cols.push(`  ${q('deletedAt')} timestamp`);
    return `CREATE TABLE IF NOT EXISTS ${q(this.getPrefixedName(schema.collection))} (\n${cols.join(',\n')}\n)`;
  }

  protected getDropTableSql(tableName: string): string {
    return `DROP TABLE IF EXISTS ${this.quoteIdentifier(this.getPrefixedName(tableName))}`;
  }

  // --- Normalisation des valeurs renvoyées (Long → number) ---

  private normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v && typeof (v as { toNumber?: () => number }).toNumber === 'function'
          && (v as { constructor?: { name?: string } }).constructor?.name === 'Long') {
        out[k] = (v as { toNumber: () => number }).toNumber();
      } else out[k] = v;
    }
    return out;
  }

  // --- Connection lifecycle ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    let Client: new (opts: Record<string, unknown>) => CassClient;
    try {
      const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ 'cassandra-driver' as string);
      Client = (mod as { Client: unknown }).Client as never;
    } catch (e: unknown) {
      throw new Error(
        `Cassandra driver not found. Install it: npm install cassandra-driver\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    // URI : cassandra://host:port/keyspace[?dc=datacenter1]
    const u = new URL(config.uri.replace(/^cassandra:\/\//, 'http://'));
    this.keyspace = u.pathname.replace(/^\//, '') || 'mostajs_dev';
    const dc = u.searchParams.get('dc') || 'datacenter1';
    this.db = new Client({
      contactPoints: [u.hostname || '127.0.0.1'],
      protocolOptions: { port: u.port ? Number(u.port) : 9042 },
      localDataCenter: dc,
      keyspace: this.keyspace,
    });
    await this.db.connect();
  }

  async doDisconnect(): Promise<void> {
    const db = this.db; this.db = null;
    if (db) await db.shutdown();
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.db) return false;
    try { await this.db.execute('SELECT now() FROM system.local'); return true; }
    catch (e) { this.log('TEST_CONNECTION', `down: ${(e as Error).message}`); return false; }
  }

  // --- Query execution ---

  /** CQL n'accepte pas la tautologie `WHERE 1=1` émise pour les filtres vides. */
  private stripTautology(sql: string): string {
    return sql
      .replace(/\bWHERE\s+1\s*=\s*1\s+AND\s+/i, 'WHERE ')
      .replace(/\bWHERE\s+1\s*=\s*1\b/i, '');
  }
  /** Ajoute ALLOW FILTERING aux SELECT filtrés sur colonne non-clé. */
  private withAllowFiltering(sql: string): string {
    if (/^\s*SELECT/i.test(sql) && /\sWHERE\s/i.test(sql) && !/ALLOW\s+FILTERING/i.test(sql)) {
      return `${sql} ALLOW FILTERING`;
    }
    return sql;
  }

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.db) throw new Error('Cassandra not connected. Call connect() first.');
    const res = await this.db.execute(this.withAllowFiltering(this.stripTautology(sql)), params, { prepare: true });
    return res.rows.map(r => this.normalizeRow(r)) as T[];
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.db) throw new Error('Cassandra not connected. Call connect() first.');
    await this.db.execute(this.stripTautology(sql), params, { prepare: true });
    return { changes: 1 }; // CQL n'expose pas d'affected-rows
  }
}

export function createDialect(): IDialect {
  return new CassandraDialect();
}

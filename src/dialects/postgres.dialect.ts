// PostgreSQL Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.PostgreSQLDialect (Hibernate ORM 6.4)
// Driver: npm install pg
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → PostgreSQL column type
// ============================================================

const PG_TYPE_MAP: Record<string, string> = {
  string:  'TEXT',
  text:    'TEXT',
  number:  'DOUBLE PRECISION',
  boolean: 'BOOLEAN',
  date:    'TIMESTAMPTZ',
  json:    'JSONB',
  array:   'JSONB',
};

// ============================================================
// PostgresDialect
// ============================================================

export class PostgresDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'postgres';
  protected pool: unknown = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(index: number): string {
    return `$${index}`;
  }

  fieldToSqlType(field: FieldDef): string {
    return PG_TYPE_MAP[field.type] || 'TEXT';
  }

  getIdColumnType(): string {
    return 'TEXT';
  }

  getTableListQuery(): string {
    return "SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'";
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return true; }
  protected supportsReturning(): boolean { return true; }
  protected serializeBoolean(v: boolean): unknown { return v; }
  protected deserializeBoolean(v: unknown): boolean { return v === true || v === 't' || v === 'true'; }

  /** PostgreSQL LIKE is case-sensitive — use ILIKE when flags contain 'i' */
  protected buildRegexCondition(col: string, flags?: string): string {
    if (flags?.includes('i')) {
      return `${col} ILIKE ${this.nextPlaceholder()}`;
    }
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  // --- Connection ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pg = await import(/* webpackIgnore: true */ 'pg' as string);
      const Pool = pg.default?.Pool || pg.Pool;
      this.pool = new Pool({
        connectionString: config.uri,
        max: config.poolSize ?? 10,
      });
    } catch (e: unknown) {
      throw new Error(
        `PostgreSQL driver not found. Install it: npm install pg\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.pool) {
      await (this.pool as { end(): Promise<void> }).end();
      this.pool = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.pool) return false;
    const client = await (this.pool as { connect(): Promise<{ release(): void; query(sql: string): Promise<unknown> }> }).connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('PostgreSQL not connected. Call connect() first.');
    const result = await (this.pool as { query(sql: string, params: unknown[]): Promise<{ rows: T[] }> }).query(sql, params);
    return result.rows;
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('PostgreSQL not connected. Call connect() first.');
    const result = await (this.pool as { query(sql: string, params: unknown[]): Promise<{ rowCount: number | null }> }).query(sql, params);
    return { changes: result.rowCount ?? 0 };
  }

  protected getDialectLabel(): string { return 'PostgreSQL'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new PostgresDialect();
}

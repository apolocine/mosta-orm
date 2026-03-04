// Sybase ASE Dialect — extends MSSQLDialect
// Equivalent to org.hibernate.dialect.SybaseASEDialect (Hibernate ORM 6.4)
// Sybase ASE shares T-SQL heritage with SQL Server
// Driver: npm install sybase
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
  QueryOptions,
} from '../core/types.js';
import { MSSQLDialect } from './mssql.dialect.js';

// ============================================================
// Sybase Type Mapping overrides
// ============================================================

const SYBASE_TYPE_MAP: Record<string, string> = {
  string:  'NVARCHAR(MAX)',
  number:  'FLOAT',
  boolean: 'TINYINT',
  date:    'DATETIME',
  json:    'TEXT',
  array:   'TEXT',
};

// ============================================================
// SybaseDialect
// ============================================================

class SybaseDialect extends MSSQLDialect {
  readonly dialectType: DialectType = 'sybase';

  // Sybase ASE does NOT support RETURNING/OUTPUT
  protected supportsReturning(): boolean { return false; }

  // Sybase uses TINYINT for boolean (not BIT)
  protected serializeBoolean(v: boolean): unknown { return v ? 1 : 0; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === 1 || v === true || v === '1';
  }

  // Override type mapping for Sybase-specific types
  fieldToSqlType(field: FieldDef): string {
    return SYBASE_TYPE_MAP[field.type] || 'NVARCHAR(MAX)';
  }

  getTableListQuery(): string {
    return "SELECT name FROM sysobjects WHERE type = 'U'";
  }

  // Sybase uses TOP n instead of OFFSET/FETCH
  protected buildLimitOffset(options?: QueryOptions): string {
    // Sybase doesn't support OFFSET/FETCH
    // TOP is applied in the SELECT clause — handled differently
    // For now return empty; TOP is handled via query rewrite
    return '';
  }

  // Override connection to use sybase driver
  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const sybase = await import(/* webpackIgnore: true */ 'sybase' as string);
      const SybaseDriver = sybase.default || sybase;
      const parsed = this.parseSybaseUri(config.uri);
      this.pool = new SybaseDriver(parsed);
      await (this.pool as { connect(): Promise<void> }).connect();
    } catch (e: unknown) {
      throw new Error(
        `Sybase driver not found. Install it: npm install sybase\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.pool) {
      await (this.pool as { disconnect(): Promise<void> }).disconnect();
      this.pool = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.pool) return false;
    await (this.pool as { query(sql: string): Promise<unknown> }).query('SELECT 1');
    return true;
  }

  async executeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('Sybase not connected. Call connect() first.');
    // Sybase driver doesn't support named params — replace @pN with values
    const resolvedSql = this.resolveParams(sql, params);
    const result = await (this.pool as { query(sql: string): Promise<T[]> }).query(resolvedSql);
    return Array.isArray(result) ? result : [];
  }

  async executeRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('Sybase not connected. Call connect() first.');
    const resolvedSql = this.resolveParams(sql, params);
    const result = await (this.pool as { query(sql: string): Promise<{ rowsAffected?: number }> }).query(resolvedSql);
    return { changes: (result as { rowsAffected?: number })?.rowsAffected ?? 0 };
  }

  /** Inline parameters into SQL (Sybase driver limitation) */
  private resolveParams(sql: string, params: unknown[]): string {
    let result = sql;
    for (let i = params.length; i >= 1; i--) {
      const val = params[i - 1];
      const replacement = val === null ? 'NULL'
        : typeof val === 'number' ? String(val)
        : `'${String(val).replace(/'/g, "''")}'`;
      result = result.replace(`@p${i}`, replacement);
    }
    return result;
  }

  private parseSybaseUri(uri: string): Record<string, unknown> {
    try {
      const url = new URL(uri.replace(/^sybase:/, 'http:'));
      return {
        host: url.hostname || 'localhost',
        port: url.port ? parseInt(url.port) : 5000,
        user: url.username || 'sa',
        password: url.password || '',
        database: url.pathname.replace(/^\//, '') || 'master',
      };
    } catch {
      return { host: 'localhost', port: 5000, database: 'master' };
    }
  }

  protected getDialectLabel(): string { return 'Sybase'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new SybaseDialect();
}

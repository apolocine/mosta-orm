// Microsoft SQL Server Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.SQLServerDialect (Hibernate ORM 6.4)
// Driver: npm install mssql
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
  QueryOptions,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → SQL Server column type
// ============================================================

const MSSQL_TYPE_MAP: Record<string, string> = {
  string:  'NVARCHAR(MAX)',
  number:  'FLOAT',
  boolean: 'BIT',
  date:    'DATETIME2',
  json:    'NVARCHAR(MAX)',
  array:   'NVARCHAR(MAX)',
};

// ============================================================
// MSSQLDialect
// ============================================================

export class MSSQLDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'mssql';
  protected pool: unknown = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `[${name}]`;
  }

  getPlaceholder(index: number): string {
    return `@p${index}`;
  }

  fieldToSqlType(field: FieldDef): string {
    return MSSQL_TYPE_MAP[field.type] || 'NVARCHAR(MAX)';
  }

  getIdColumnType(): string {
    return 'NVARCHAR(36)';
  }

  getTableListQuery(): string {
    return "SELECT name FROM sys.tables WHERE type = 'U'";
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return false; }

  // SQL Server supports OUTPUT clause (similar to RETURNING)
  protected supportsReturning(): boolean { return true; }

  // SQL Server BIT: 1 = true, 0 = false
  protected serializeBoolean(v: boolean): unknown { return v ? 1 : 0; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === 1 || v === true || v === '1';
  }

  // SQL Server uses OFFSET/FETCH instead of LIMIT/OFFSET
  protected buildLimitOffset(options?: QueryOptions): string {
    if (!options?.limit && !options?.skip) return '';

    // SQL Server requires ORDER BY for OFFSET/FETCH
    // If no ORDER BY was specified, use (SELECT NULL) as a workaround
    const offset = options.skip ?? 0;
    const limit = options.limit;

    let sql = ` OFFSET ${offset} ROWS`;
    if (limit) sql += ` FETCH NEXT ${limit} ROWS ONLY`;
    return sql;
  }

  // Override: SQL Server needs ORDER BY before OFFSET/FETCH
  protected getCreateTablePrefix(tableName: string): string {
    const q = this.quoteIdentifier(tableName);
    // SQL Server 2016+ supports IF NOT EXISTS via a different pattern
    return `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${tableName}') CREATE TABLE ${q}`;
  }

  protected getCreateIndexPrefix(indexName: string, unique: boolean): string {
    const u = unique ? 'UNIQUE ' : '';
    const q = this.quoteIdentifier(indexName);
    // SQL Server: check if index exists before creating
    return `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${indexName}') CREATE ${u}INDEX ${q}`;
  }

  // --- Connection ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const mssql = await import(/* webpackIgnore: true */ 'mssql' as string);
      const connect = mssql.default?.connect || mssql.connect;
      this.pool = await connect(config.uri);
    } catch (e: unknown) {
      throw new Error(
        `SQL Server driver not found. Install it: npm install mssql\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.pool) {
      await (this.pool as { close(): Promise<void> }).close();
      this.pool = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.pool) return false;
    const request = (this.pool as { request(): { query(sql: string): Promise<unknown> } }).request();
    await request.query('SELECT 1');
    return true;
  }

  // --- Query execution ---

  async executeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('SQL Server not connected. Call connect() first.');
    const request = (this.pool as {
      request(): {
        input(name: string, value: unknown): unknown;
        query(sql: string): Promise<{ recordset: T[] }>;
      };
    }).request();

    // Bind named parameters @p1, @p2, ...
    for (let i = 0; i < params.length; i++) {
      request.input(`p${i + 1}`, params[i]);
    }

    const result = await request.query(sql);
    return result.recordset;
  }

  async executeRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('SQL Server not connected. Call connect() first.');
    const request = (this.pool as {
      request(): {
        input(name: string, value: unknown): unknown;
        query(sql: string): Promise<{ rowsAffected: number[] }>;
      };
    }).request();

    for (let i = 0; i < params.length; i++) {
      request.input(`p${i + 1}`, params[i]);
    }

    const result = await request.query(sql);
    return { changes: result.rowsAffected?.[0] ?? 0 };
  }

  protected getDialectLabel(): string { return 'MSSQL'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new MSSQLDialect();
}

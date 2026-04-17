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
  text:    'NVARCHAR(MAX)',
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

  // --- Transaction syntax specific to SQL Server ---
  // T-SQL : bare BEGIN is a control-flow block start, NOT a transaction start.
  // Real transactions require BEGIN TRANSACTION (or BEGIN TRAN).
  // COMMIT / ROLLBACK unqualified are accepted as shorthand for COMMIT/ROLLBACK
  // TRANSACTION — so those don't need overriding.
  // Isolation level must be set BEFORE BEGIN TRANSACTION on SQL Server.
  protected beginSql(opts?: { isolation?: string }): string | null {
    if (opts?.isolation) {
      return `SET TRANSACTION ISOLATION LEVEL ${opts.isolation}; BEGIN TRANSACTION`;
    }
    return 'BEGIN TRANSACTION';
  }

  // --- Savepoint syntax specific to SQL Server ---
  // MSSQL uses SAVE TRANSACTION / ROLLBACK TRANSACTION — no RELEASE equivalent
  // (sub-tx is auto-released when outer COMMIT fires). Return null for release.
  protected savepointBeginSql(name: string): string | null {
    return `SAVE TRANSACTION ${name}`;
  }
  protected savepointReleaseSql(_name: string): string | null {
    return null;
  }
  protected savepointRollbackSql(name: string): string | null {
    return `ROLLBACK TRANSACTION ${name}`;
  }

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

    // SQL Server REQUIRES ORDER BY before OFFSET/FETCH
    // If no sort was specified, inject ORDER BY (SELECT NULL) as a no-op sort
    const needsOrderBy = !options.sort || Object.keys(options.sort).length === 0;
    const offset = options.skip ?? 0;
    const limit = options.limit;

    let sql = needsOrderBy ? ' ORDER BY (SELECT NULL)' : '';
    sql += ` OFFSET ${offset} ROWS`;
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

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('SQL Server not connected. Call connect() first.');
    const request = (this.pool as {
      request(): {
        input(name: string, value: unknown): unknown;
        query(sql: string): Promise<{ recordset: T[] }>;
        batch(sql: string): Promise<{ recordset: T[] }>;
      };
    }).request();

    // Parameterless → use batch() to avoid sp_executesql wrapping
    // (tedious rejects statements that change @@TRANCOUNT inside a proc).
    if (params.length === 0) {
      const result = await request.batch(sql);
      return result.recordset ?? [];
    }

    for (let i = 0; i < params.length; i++) {
      request.input(`p${i + 1}`, params[i]);
    }
    const result = await request.query(sql);
    return result.recordset;
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('SQL Server not connected. Call connect() first.');
    const request = (this.pool as {
      request(): {
        input(name: string, value: unknown): unknown;
        query(sql: string): Promise<{ rowsAffected: number[] }>;
        batch(sql: string): Promise<{ rowsAffected: number[] }>;
      };
    }).request();

    // Parameterless → batch(). BEGIN/COMMIT/ROLLBACK/SAVE TRANSACTION must
    // NOT go through sp_executesql (which rejects any @@TRANCOUNT delta).
    if (params.length === 0) {
      const result = await request.batch(sql);
      return { changes: result.rowsAffected?.[0] ?? 0 };
    }

    for (let i = 0; i < params.length; i++) {
      request.input(`p${i + 1}`, params[i]);
    }
    const result = await request.query(sql);
    return { changes: result.rowsAffected?.[0] ?? 0 };
  }

  // SQL Server does not support DROP TABLE IF EXISTS ... CASCADE
  // Must drop FK constraints first, then tables
  async dropAllTables(): Promise<void> {
    try {
      // 1. Drop all foreign key constraints
      const fks = await this.doExecuteQuery<Record<string, unknown>>(
        `SELECT t.name AS tableName, fk.name AS fkName
         FROM sys.foreign_keys fk
         JOIN sys.tables t ON fk.parent_object_id = t.object_id`, []
      );
      for (const fk of fks) {
        try {
          await this.doExecuteRun(
            `ALTER TABLE ${this.quoteIdentifier(fk.tableName as string)} DROP CONSTRAINT ${this.quoteIdentifier(fk.fkName as string)}`, []
          );
        } catch { /* ignore */ }
      }
      // 2. Drop all user tables
      const rows = await this.doExecuteQuery<Record<string, unknown>>(this.getTableListQuery(), []);
      for (const row of rows) {
        const name = (row.name || Object.values(row)[0]) as string;
        if (name) {
          try {
            await this.doExecuteRun(`DROP TABLE ${this.quoteIdentifier(name)}`, []);
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  protected getDialectLabel(): string { return 'MSSQL'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new MSSQLDialect();
}

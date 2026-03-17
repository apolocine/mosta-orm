// MySQL Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.MySQLDialect (Hibernate ORM 6.4)
// Driver: npm install mysql2
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → MySQL column type
// ============================================================

const MYSQL_TYPE_MAP: Record<string, string> = {
  string:  'VARCHAR(255)',
  number:  'DOUBLE',
  boolean: 'TINYINT(1)',
  date:    'DATETIME',
  json:    'JSON',
  array:   'JSON',
};

// ============================================================
// MySQLDialect
// ============================================================

export class MySQLDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'mysql';
  protected pool: unknown = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `\`${name}\``;
  }

  getPlaceholder(_index: number): string {
    return '?';
  }

  fieldToSqlType(field: FieldDef): string {
    return MYSQL_TYPE_MAP[field.type] || 'VARCHAR(255)';
  }

  getIdColumnType(): string {
    return 'VARCHAR(36)';
  }

  getTableListQuery(): string {
    return "SELECT table_name as name FROM information_schema.tables WHERE table_schema = DATABASE()";
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return true; }
  protected supportsReturning(): boolean { return false; }

  // MySQL 5.x doesn't support CREATE INDEX IF NOT EXISTS (MySQL 8+ does)
  protected getCreateIndexPrefix(indexName: string, unique: boolean): string {
    const u = unique ? 'UNIQUE ' : '';
    return `CREATE ${u}INDEX ${this.quoteIdentifier(indexName)}`;
  }

  // MySQL 5.x: try/catch car pas de IF NOT EXISTS sur CREATE INDEX
  protected async executeIndexStatement(stmt: string): Promise<void> {
    try {
      await this.executeRun(stmt, []);
    } catch {
      // Index already exists — ignore (MySQL 5.x compat)
    }
  }

  // MySQL/MariaDB DATETIME: use 'YYYY-MM-DD HH:MM:SS' format (no T, no Z)
  protected serializeDate(value: unknown): unknown {
    let d: Date | null = null;
    if (value === 'now') d = new Date();
    else if (value instanceof Date) d = value;
    else if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) d = parsed;
      else return value;
    }
    if (!d) return null;
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0');
  }

  // MySQL uses TINYINT(1) for boolean: 1 = true, 0 = false
  protected serializeBoolean(v: boolean): unknown { return v ? 1 : 0; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === 1 || v === true || v === '1';
  }

  // --- Connection ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const mysql2 = await import(/* webpackIgnore: true */ 'mysql2/promise' as string);
      const createPool = mysql2.default?.createPool || mysql2.createPool;
      this.pool = createPool({
        uri: config.uri,
        connectionLimit: config.poolSize ?? 10,
        waitForConnections: true,
      });
    } catch (e: unknown) {
      throw new Error(
        `MySQL driver not found. Install it: npm install mysql2\n` +
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
    const conn = await (this.pool as { getConnection(): Promise<{ release(): void; query(sql: string): Promise<unknown> }> }).getConnection();
    try {
      await conn.query('SELECT 1');
      return true;
    } finally {
      conn.release();
    }
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('MySQL not connected. Call connect() first.');
    const [rows] = await (this.pool as { execute(sql: string, params: unknown[]): Promise<[T[], unknown]> }).execute(sql, params);
    return rows as T[];
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('MySQL not connected. Call connect() first.');
    const [result] = await (this.pool as { execute(sql: string, params: unknown[]): Promise<[{ affectedRows?: number }, unknown]> }).execute(sql, params);
    return { changes: (result as { affectedRows?: number }).affectedRows ?? 0 };
  }

  protected getDialectLabel(): string { return 'MySQL'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new MySQLDialect();
}

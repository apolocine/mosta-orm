// HyperSQL (HSQLDB) Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.HSQLDialect (Hibernate ORM 6.4)
// HSQLDB is a Java database — accessed via HTTP/JDBC bridge or REST API
// Driver: HTTP fetch (no npm driver — uses Java HTTP API bridge)
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → HSQLDB column type
// ============================================================

const HSQL_TYPE_MAP: Record<string, string> = {
  string:  'VARCHAR(4000)',
  number:  'DOUBLE',
  boolean: 'BOOLEAN',
  date:    'TIMESTAMP',
  json:    'CLOB',
  array:   'CLOB',
};

// ============================================================
// HSQLDialect
// ============================================================

class HSQLDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'hsqldb';
  private baseUrl: string = '';
  private connected = false;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(_index: number): string {
    return '?';
  }

  fieldToSqlType(field: FieldDef): string {
    return HSQL_TYPE_MAP[field.type] || 'VARCHAR(4000)';
  }

  getIdColumnType(): string {
    return 'VARCHAR(36)';
  }

  getTableListQuery(): string {
    return "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'PUBLIC'";
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return true; }
  protected supportsReturning(): boolean { return false; }

  protected serializeBoolean(v: boolean): unknown { return v; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === true || v === 1 || v === '1' || v === 'TRUE' || v === 'true';
  }

  // HSQLDB supports LIMIT/OFFSET natively
  // (default buildLimitOffset from AbstractSqlDialect works)

  // --- Connection (HTTP bridge to HSQLDB server) ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    // URI format: http://host:port/dbname or hsqldb://host:port/dbname
    this.baseUrl = config.uri
      .replace(/^hsqldb:\/\//, 'http://')
      .replace(/\/$/, '');

    // Test connectivity
    try {
      await this.httpPost('SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS', []);
      this.connected = true;
    } catch (e: unknown) {
      throw new Error(
        `HSQLDB HTTP bridge not reachable at ${this.baseUrl}.\n` +
        `Ensure the HSQLDB server is running with HTTP API enabled.\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    this.connected = false;
    this.baseUrl = '';
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.connected) return false;
    try {
      await this.httpPost('SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS', []);
      return true;
    } catch {
      return false;
    }
  }

  // --- Query execution via HTTP bridge ---

  async executeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.connected) throw new Error('HSQLDB not connected. Call connect() first.');
    return this.httpPost<T[]>(sql, params);
  }

  async executeRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.connected) throw new Error('HSQLDB not connected. Call connect() first.');
    const result = await this.httpPost<{ changes?: number }>(sql, params);
    return { changes: (result as { changes?: number })?.changes ?? 0 };
  }

  /** Send SQL to HSQLDB HTTP bridge */
  private async httpPost<T>(sql: string, params: unknown[]): Promise<T> {
    const response = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HSQLDB query failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  protected getDialectLabel(): string { return 'HSQLDB'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new HSQLDialect();
}

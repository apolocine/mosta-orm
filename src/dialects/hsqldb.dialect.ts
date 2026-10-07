// HyperSQL (HSQLDB) Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.HSQLDialect (Hibernate ORM 6.4)
// Driver: JDBC bridge (no npm driver — Java database)
// Connection handled transparently by AbstractSqlDialect JDBC bridge interception
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
  text:    'LONGVARCHAR',
  number:  'DOUBLE',
  boolean: 'BOOLEAN',
  date:    'TIMESTAMP',
  json:    'CLOB',
  array:   'CLOB',
};

// ============================================================
// HSQLDialect — SQL definition only (like Hibernate HSQLDialect)
// Connection is handled by AbstractSqlDialect via JDBC bridge
// ============================================================

class HSQLDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'hsqldb';

  // --- Abstract implementations (SQL definition) ---

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

  // --- Connection (native driver fallback) ---
  // HSQLDB is a Java database — no npm driver exists.
  // Normal path: AbstractSqlDialect detects hsqldb*.jar and uses JDBC bridge.
  // These methods are only called if no JAR is found (fallback impossible).

  async doConnect(_config: ConnectionConfig): Promise<void> {
    throw new Error(
      'HSQLDB requires a JDBC bridge.\n' +
      'Place hsqldb*.jar in the jar_files/ directory.\n' +
      'No npm driver exists for HSQLDB.'
    );
  }

  async doDisconnect(): Promise<void> {
    // Nothing to clean up — bridge is managed by AbstractSqlDialect
  }

  async doTestConnection(): Promise<boolean> {
    // Bridge test is handled by AbstractSqlDialect.testConnection()
    return false;
  }

  // --- Query execution (native driver fallback) ---
  // Only called when JDBC bridge is NOT active (impossible for HSQLDB).

  async doExecuteQuery<T>(_sql: string, _params: unknown[]): Promise<T[]> {
    throw new Error(
      'HSQLDB requires a JDBC bridge. Place hsqldb*.jar in jar_files/.'
    );
  }

  async doExecuteRun(_sql: string, _params: unknown[]): Promise<{ changes: number }> {
    throw new Error(
      'HSQLDB requires a JDBC bridge. Place hsqldb*.jar in jar_files/.'
    );
  }

  protected getDialectLabel(): string { return 'HSQLDB'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new HSQLDialect();
}

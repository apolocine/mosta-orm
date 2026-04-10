// SQLite Dialect — extends AbstractSqlDialect (normalized sync → async)
// Equivalent to org.hibernate.dialect.SQLiteDialect
// Author: Dr Hamid MADANI drmdh@msn.com
import type Database from 'better-sqlite3';
let _Database: typeof Database | null = null;
async function loadDatabase(): Promise<typeof Database> {
  if (!_Database) {
    const pkg = 'better-sqlite' + '3';
    const mod = await import(/* webpackIgnore: true */ pkg);
    _Database = mod.default;
  }
  return _Database!;
}

import { resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → SQLite column type
// ============================================================

const SQLITE_TYPE_MAP: Record<string, string> = {
  string:  'TEXT',
  text:    'TEXT',
  number:  'REAL',
  boolean: 'INTEGER',
  date:    'TEXT',
  json:    'TEXT',
  array:   'TEXT',
};

// ============================================================
// SQLiteDialect — normalizer sync → async
// ============================================================

class SQLiteDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'sqlite';
  /** Exposed for raw access in tests (same pattern as before refactoring) */
  db: Database.Database | null = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(_index: number): string {
    return '?';
  }

  fieldToSqlType(field: FieldDef): string {
    return SQLITE_TYPE_MAP[field.type] || 'TEXT';
  }

  getIdColumnType(): string {
    return 'TEXT';
  }

  getTableListQuery(): string {
    return "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return true; }
  protected supportsReturning(): boolean { return false; }
  protected serializeBoolean(v: boolean): unknown { return v ? 1 : 0; }
  protected deserializeBoolean(v: unknown): boolean { return v === 1 || v === true || v === '1'; }

  // --- Connection lifecycle (sync → async normalizer) ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    const Db = await loadDatabase();
    if (config.uri !== ':memory:') {
      const dbPath = resolve(config.uri);
      const dbDir = dirname(dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }
      this.db = new Db(dbPath);
    } else {
      this.db = new Db(':memory:');
    }
    // WAL mode for better concurrency + referential integrity
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async doDisconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  // --- Query execution (sync → async normalizer) ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.db) throw new Error('SQLite not connected. Call connect() first.');
    return this.db.prepare(sql).all(...params) as T[];
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.db) throw new Error('SQLite not connected. Call connect() first.');
    const result = this.db.prepare(sql).run(...params);
    return { changes: result.changes };
  }

  // --- dropAllTables override (needs foreign_keys OFF for SQLite) ---

  async dropAllTables(): Promise<void> {
    if (!this.db) return;
    const tables = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[];
    this.db.pragma('foreign_keys = OFF');
    for (const t of tables) {
      this.db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    }
    this.db.pragma('foreign_keys = ON');
  }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new SQLiteDialect();
}

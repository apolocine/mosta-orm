// sql.js Dialect — SQLite compiled to WebAssembly (zero native binary).
// Extends SQLiteDialect : identical SQL generation (type map, quoting,
// placeholders, PRAGMA, FK, soft-delete) — only the connection lifecycle and
// query execution differ (sql.js WASM API instead of the native better-sqlite3
// addon).
//
// Target runtimes : the browser, StackBlitz / Bolt.new WebContainers, Cloudflare
// Workers / Vercel Edge, and any environment where a native `.node` addon cannot
// load. In Node it works too, with optional file persistence.
//
// In-memory by default (the WASM database lives in RAM). When `uri` points to a
// file AND a filesystem is available (Node / WebContainer), the database is
// loaded from that file on connect and flushed back after every write and on
// disconnect (sql.js has no incremental persistence — the whole image is
// exported). In a pure browser bundle (no `fs`), the dialect stays in-memory.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type { IDialect, DialectType, ConnectionConfig } from '../core/types.js';
import { SQLiteDialect } from './sqlite.dialect.js';

// ============================================================
// Minimal sql.js typings (the package ships none we depend on)
// ============================================================

interface SqlJsStatement {
  bind(params?: unknown[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): boolean;
}
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): SqlJsDatabase;
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  prepare(sql: string): SqlJsStatement;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
}
interface SqlJsStatic {
  Database: new (data?: Uint8Array | null) => SqlJsDatabase;
}
type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;

// ============================================================
// Lazy WASM module loader (specifier hidden from bundler static analysis,
// same belt-and-braces pattern as the native SQLite dialect)
// ============================================================

let _initSqlJs: InitSqlJs | null = null;
async function loadInitSqlJs(): Promise<InitSqlJs> {
  if (!_initSqlJs) {
    const pkg = 'sql' + '.js';
    const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ pkg);
    _initSqlJs = (mod.default ?? mod) as InitSqlJs;
  }
  return _initSqlJs;
}

// ============================================================
// SqljsDialect — sql.js (WASM) execution over SQLite SQL
// ============================================================

class SqljsDialect extends SQLiteDialect {
  override readonly dialectType: DialectType = 'sqljs';

  /** The in-memory WASM database. Exposed for raw access in tests. */
  sqljs: SqlJsDatabase | null = null;

  /** Resolved file path for persistence, or null for pure in-memory. */
  private _filePath: string | null = null;

  // --- Connection lifecycle (WASM, in-memory ± file snapshot) ---

  override async doConnect(config: ConnectionConfig): Promise<void> {
    const initSqlJs = await loadInitSqlJs();
    const locateFile = (config.options as { locateFile?: (f: string) => string } | undefined)?.locateFile;
    const SQL = await initSqlJs(locateFile ? { locateFile } : undefined);

    // Decide persistence target. ':memory:' / empty → pure in-memory.
    this._filePath =
      config.uri && config.uri !== ':memory:' ? await this.resolvePath(config.uri) : null;

    // Try to hydrate from an existing file snapshot (Node / WebContainer only).
    let initialBytes: Uint8Array | null = null;
    if (this._filePath) {
      try {
        const fs = await import('fs');
        if (fs.existsSync(this._filePath)) {
          initialBytes = new Uint8Array(fs.readFileSync(this._filePath));
        }
      } catch {
        // No filesystem (pure browser) — fall back to in-memory.
        this._filePath = null;
      }
    }

    this.sqljs = new SQL.Database(initialBytes);
    // Referential integrity. No WAL : sql.js is a single in-memory image.
    this.sqljs.run('PRAGMA foreign_keys = ON');
  }

  override async doDisconnect(): Promise<void> {
    if (this.sqljs) {
      await this.flush();
      this.sqljs.close();
      this.sqljs = null;
    }
  }

  override async doTestConnection(): Promise<boolean> {
    if (!this.sqljs) return false;
    try {
      this.sqljs.exec('SELECT 1');
      return true;
    } catch (e) {
      // scan-ignore: testConnection retourne explicitement boolean — false=down
      this.log('TEST_CONNECTION', `down: ${(e as Error).message}`);
      return false;
    }
  }

  // --- Query execution (sql.js prepare/step → rows) ---

  override async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.sqljs) throw new Error('sql.js not connected. Call connect() first.');
    const stmt = this.sqljs.prepare(sql);
    try {
      if (params.length) stmt.bind(params);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows as T[];
    } finally {
      stmt.free();
    }
  }

  override async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.sqljs) throw new Error('sql.js not connected. Call connect() first.');
    this.sqljs.run(sql, params);
    const changes = this.sqljs.getRowsModified();
    await this.flush();
    return { changes };
  }

  // --- dropAllTables override (sql.js API, foreign_keys OFF while dropping) ---

  override async dropAllTables(): Promise<void> {
    if (!this.sqljs) return;
    const res = this.sqljs.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const names = res[0]?.values.map(row => String(row[0])) ?? [];
    this.sqljs.run('PRAGMA foreign_keys = OFF');
    for (const name of names) {
      this.sqljs.run(`DROP TABLE IF EXISTS "${name}"`);
    }
    this.sqljs.run('PRAGMA foreign_keys = ON');
    await this.flush();
  }

  // --- Persistence helpers ---

  /** Export the WASM image and write it to disk. No-op when in-memory. */
  private async flush(): Promise<void> {
    if (!this._filePath || !this.sqljs) return;
    try {
      const fs = await import('fs');
      const { dirname } = await import('path');
      const dir = dirname(this._filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._filePath, Buffer.from(this.sqljs.export()));
    } catch {
      // No filesystem — pure in-memory, nothing to persist. Disable further flushes.
      this._filePath = null;
    }
  }

  private async resolvePath(uri: string): Promise<string> {
    try {
      const { resolve } = await import('path');
      return resolve(uri);
    } catch {
      return uri; // no path module (browser) — keep as-is
    }
  }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new SqljsDialect();
}

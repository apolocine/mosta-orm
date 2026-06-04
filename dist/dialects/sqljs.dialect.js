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
import { SQLiteDialect } from './sqlite.dialect.js';
// ============================================================
// Lazy WASM module loader (specifier hidden from bundler static analysis,
// same belt-and-braces pattern as the native SQLite dialect)
// ============================================================
let _initSqlJs = null;
async function loadInitSqlJs() {
    if (!_initSqlJs) {
        const pkg = 'sql' + '.js';
        const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ pkg);
        _initSqlJs = (mod.default ?? mod);
    }
    return _initSqlJs;
}
// ============================================================
// SqljsDialect — sql.js (WASM) execution over SQLite SQL
// ============================================================
class SqljsDialect extends SQLiteDialect {
    dialectType = 'sqljs';
    /** The in-memory WASM database. Exposed for raw access in tests. */
    sqljs = null;
    /** Resolved file path for persistence, or null for pure in-memory. */
    _filePath = null;
    // --- Connection lifecycle (WASM, in-memory ± file snapshot) ---
    async doConnect(config) {
        const initSqlJs = await loadInitSqlJs();
        const locateFile = config.options?.locateFile;
        const SQL = await initSqlJs(locateFile ? { locateFile } : undefined);
        // Decide persistence target. ':memory:' / empty → pure in-memory.
        this._filePath =
            config.uri && config.uri !== ':memory:' ? await this.resolvePath(config.uri) : null;
        // Try to hydrate from an existing file snapshot (Node / WebContainer only).
        let initialBytes = null;
        if (this._filePath) {
            try {
                const fs = await import('fs');
                if (fs.existsSync(this._filePath)) {
                    initialBytes = new Uint8Array(fs.readFileSync(this._filePath));
                }
            }
            catch {
                // No filesystem (pure browser) — fall back to in-memory.
                this._filePath = null;
            }
        }
        this.sqljs = new SQL.Database(initialBytes);
        // Referential integrity. No WAL : sql.js is a single in-memory image.
        this.sqljs.run('PRAGMA foreign_keys = ON');
    }
    async doDisconnect() {
        if (this.sqljs) {
            await this.flush();
            this.sqljs.close();
            this.sqljs = null;
        }
    }
    async doTestConnection() {
        if (!this.sqljs)
            return false;
        try {
            this.sqljs.exec('SELECT 1');
            return true;
        }
        catch (e) {
            // scan-ignore: testConnection retourne explicitement boolean — false=down
            this.log('TEST_CONNECTION', `down: ${e.message}`);
            return false;
        }
    }
    // --- Query execution (sql.js prepare/step → rows) ---
    async doExecuteQuery(sql, params) {
        if (!this.sqljs)
            throw new Error('sql.js not connected. Call connect() first.');
        const stmt = this.sqljs.prepare(sql);
        try {
            if (params.length)
                stmt.bind(params);
            const rows = [];
            while (stmt.step())
                rows.push(stmt.getAsObject());
            return rows;
        }
        finally {
            stmt.free();
        }
    }
    async doExecuteRun(sql, params) {
        if (!this.sqljs)
            throw new Error('sql.js not connected. Call connect() first.');
        this.sqljs.run(sql, params);
        const changes = this.sqljs.getRowsModified();
        await this.flush();
        return { changes };
    }
    // --- dropAllTables override (sql.js API, foreign_keys OFF while dropping) ---
    async dropAllTables() {
        if (!this.sqljs)
            return;
        const res = this.sqljs.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
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
    async flush() {
        if (!this._filePath || !this.sqljs)
            return;
        try {
            const fs = await import('fs');
            const { dirname } = await import('path');
            const dir = dirname(this._filePath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this._filePath, Buffer.from(this.sqljs.export()));
        }
        catch {
            // No filesystem — pure in-memory, nothing to persist. Disable further flushes.
            this._filePath = null;
        }
    }
    async resolvePath(uri) {
        try {
            const { resolve } = await import('path');
            return resolve(uri);
        }
        catch {
            return uri; // no path module (browser) — keep as-is
        }
    }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new SqljsDialect();
}

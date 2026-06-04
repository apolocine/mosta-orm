// PGlite Dialect — PostgreSQL compiled to WebAssembly (zero native binary, no server).
// Extends PostgresDialect : identical SQL generation ($n placeholders, ILIKE,
// RETURNING, JSONB, TIMESTAMPTZ, CASCADE…) — only the connection lifecycle and
// query execution differ (embedded PGlite WASM instead of the `pg` network pool).
//
// Target runtimes : the browser, StackBlitz / Bolt.new WebContainers, Cloudflare
// Workers / Vercel Edge, and Node. PGlite is a single embedded connection (no
// pool) — which is actually IDEAL for transaction correctness.
//
// Persistence (via `uri`, mapped to PGlite's dataDir):
//   ':memory:' / '' / 'memory://'  → in-memory (browser, demos, edge)
//   'idb://<name>'                 → IndexedDB (durable IN THE BROWSER — no fs needed)
//   'file://<path>' / '<path>'     → filesystem directory (Node / WebContainer)
//
// Note : unlike sqljs, PGlite ships first-class `idb://` persistence — durable
// in-browser storage with no extra code.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { PostgresDialect } from './postgres.dialect.js';
// ============================================================
// Lazy WASM module loader (specifier hidden from bundler static analysis)
// ============================================================
let _PGlite = null;
async function loadPGlite() {
    if (!_PGlite) {
        const pkg = '@electric-sql/' + 'pglite';
        const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ pkg);
        _PGlite = (mod.PGlite ?? mod.default?.PGlite ?? mod.default);
    }
    return _PGlite;
}
/** Map a @mostajs/orm `uri` to a PGlite dataDir. */
function pgliteDataDir(uri) {
    if (!uri || uri === ':memory:' || uri === 'memory://')
        return 'memory://';
    return uri; // 'idb://name' | 'file://path' | plain fs path
}
// ============================================================
// PgliteDialect — PGlite (WASM) execution over PostgreSQL SQL
// ============================================================
class PgliteDialect extends PostgresDialect {
    dialectType = 'pglite';
    /** The embedded WASM database. Exposed for raw access in tests. */
    pglite = null;
    // --- Connection lifecycle (embedded WASM, no pool) ---
    async doConnect(config) {
        try {
            const PGlite = await loadPGlite();
            const dataDir = pgliteDataDir(config.uri);
            const options = config.options;
            this.pglite = PGlite.create
                ? await PGlite.create(dataDir, options)
                : new PGlite(dataDir, options);
            if (this.pglite.waitReady)
                await this.pglite.waitReady;
        }
        catch (e) {
            throw new Error(`PGlite driver not found. Install it: npm install @electric-sql/pglite\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async doDisconnect() {
        if (this.pglite) {
            await this.pglite.close();
            this.pglite = null;
        }
    }
    async doTestConnection() {
        if (!this.pglite)
            return false;
        try {
            await this.pglite.query('SELECT 1');
            return true;
        }
        catch (e) {
            // scan-ignore: testConnection retourne explicitement boolean — false=down
            this.log('TEST_CONNECTION', `down: ${e.message}`);
            return false;
        }
    }
    // --- Query execution (PGlite returns { rows, affectedRows }) ---
    async doExecuteQuery(sql, params) {
        if (!this.pglite)
            throw new Error('PGlite not connected. Call connect() first.');
        const result = await this.pglite.query(sql, params);
        return result.rows;
    }
    async doExecuteRun(sql, params) {
        if (!this.pglite)
            throw new Error('PGlite not connected. Call connect() first.');
        // PGlite exposes `affectedRows` (the `pg` driver uses `rowCount`).
        const result = await this.pglite.query(sql, params);
        return { changes: result.affectedRows ?? 0 };
    }
    getDialectLabel() { return 'PGlite'; }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new PgliteDialect();
}

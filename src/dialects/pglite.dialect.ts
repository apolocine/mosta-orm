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

import type { IDialect, DialectType, ConnectionConfig } from '../core/types.js';
import { PostgresDialect } from './postgres.dialect.js';

// ============================================================
// Minimal PGlite typings (we depend only on what we call)
// ============================================================

interface PGliteInstance {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; affectedRows?: number }>;
  close(): Promise<void>;
  readonly waitReady?: Promise<unknown>;
}
interface PGliteStatic {
  create?(dataDir?: string, options?: unknown): Promise<PGliteInstance>;
  new (dataDir?: string, options?: unknown): PGliteInstance;
}

// ============================================================
// Lazy WASM module loader (specifier hidden from bundler static analysis)
// ============================================================

let _PGlite: PGliteStatic | null = null;
async function loadPGlite(): Promise<PGliteStatic> {
  if (!_PGlite) {
    const pkg = '@electric-sql/' + 'pglite';
    const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ pkg);
    _PGlite = (mod.PGlite ?? mod.default?.PGlite ?? mod.default) as PGliteStatic;
  }
  return _PGlite;
}

/** Map a @mostajs/orm `uri` to a PGlite dataDir. */
function pgliteDataDir(uri?: string): string {
  if (!uri || uri === ':memory:' || uri === 'memory://') return 'memory://';
  return uri; // 'idb://name' | 'file://path' | plain fs path
}

// ============================================================
// PgliteDialect — PGlite (WASM) execution over PostgreSQL SQL
// ============================================================

class PgliteDialect extends PostgresDialect {
  override readonly dialectType: DialectType = 'pglite';

  /** The embedded WASM database. Exposed for raw access in tests. */
  pglite: PGliteInstance | null = null;

  // --- Connection lifecycle (embedded WASM, no pool) ---

  override async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const PGlite = await loadPGlite();
      const dataDir = pgliteDataDir(config.uri);
      const options = (config.options as Record<string, unknown> | undefined);
      this.pglite = PGlite.create
        ? await PGlite.create(dataDir, options)
        : new PGlite(dataDir, options);
      if (this.pglite.waitReady) await this.pglite.waitReady;
    } catch (e: unknown) {
      throw new Error(
        `PGlite driver not found. Install it: npm install @electric-sql/pglite\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  override async doDisconnect(): Promise<void> {
    if (this.pglite) {
      await this.pglite.close();
      this.pglite = null;
    }
  }

  override async doTestConnection(): Promise<boolean> {
    if (!this.pglite) return false;
    try {
      await this.pglite.query('SELECT 1');
      return true;
    } catch (e) {
      // scan-ignore: testConnection retourne explicitement boolean — false=down
      this.log('TEST_CONNECTION', `down: ${(e as Error).message}`);
      return false;
    }
  }

  // --- Query execution (PGlite returns { rows, affectedRows }) ---

  override async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pglite) throw new Error('PGlite not connected. Call connect() first.');
    const result = await this.pglite.query<T>(sql, params);
    return result.rows;
  }

  override async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pglite) throw new Error('PGlite not connected. Call connect() first.');
    // PGlite exposes `affectedRows` (the `pg` driver uses `rowCount`).
    const result = await this.pglite.query(sql, params);
    return { changes: result.affectedRows ?? 0 };
  }

  protected override getDialectLabel(): string { return 'PGlite'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new PgliteDialect();
}

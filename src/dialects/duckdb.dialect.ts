// DuckDB Dialect — extends AbstractSqlDialect
// Moteur OLAP colonnaire in-process (fichier ou :memory:), SQL compatible PostgreSQL.
// Equivalent d'esprit à une "SQLite analytique". Driver: npm install duckdb
// NB: duckdb-wasm permet aussi l'exécution navigateur (cf. docs ORM-py / micro-moteur).
// Author: Dr Hamid MADANI <drmdh@msn.com>

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
// Type Mapping — DAL FieldType → DuckDB column type (proche PostgreSQL)
// ============================================================

const DUCKDB_TYPE_MAP: Record<string, string> = {
  string:  'VARCHAR',
  text:    'VARCHAR',
  number:  'DOUBLE',
  boolean: 'BOOLEAN',
  date:    'TIMESTAMP',
  json:    'JSON',
  array:   'JSON',
};

/** Forme minimale du driver classique `duckdb` (callback-based). */
interface DuckDbDatabase {
  all(sql: string, ...args: unknown[]): void;
  close(cb: (err: Error | null) => void): void;
}

// ============================================================
// DuckDBDialect — driver callback → async normalizer
// ============================================================

export class DuckDBDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'duckdb';
  /** Exposé pour accès brut en test. */
  db: DuckDbDatabase | null = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(_index: number): string {
    return '?';
  }

  fieldToSqlType(field: FieldDef): string {
    return DUCKDB_TYPE_MAP[field.type] || 'VARCHAR';
  }

  getIdColumnType(): string {
    return 'VARCHAR';
  }

  getTableListQuery(): string {
    return "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'main'";
  }

  /** DuckDB expose `information_schema.columns` (ANSI). */
  protected async getExistingColumns(tableName: string): Promise<Set<string>> {
    try {
      const rows = await this.executeQuery<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = ?`,
        [tableName],
      );
      return new Set(rows.map(r => r.column_name).filter(Boolean));
    } catch { return new Set(); }
  }

  // --- Hooks ---

  protected supportsIfNotExists(): boolean { return true; }
  // Chemin sûr (INSERT puis SELECT) comme SQLite — évite de dépendre de RETURNING.
  protected supportsReturning(): boolean { return false; }
  protected serializeBoolean(v: boolean): unknown { return v; }            // BOOLEAN natif
  protected deserializeBoolean(v: unknown): boolean { return v === true || v === 1 || v === 'true'; }

  /** DuckDB supporte ILIKE (comme PostgreSQL) pour le insensible à la casse. */
  protected buildRegexCondition(col: string, flags?: string): string {
    if (flags?.includes('i')) return `${col} ILIKE ${this.nextPlaceholder()}`;
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  // --- callback → promise (driver classique `duckdb`) ---

  private allAsync(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    return new Promise((res, rej) => {
      if (!this.db) { rej(new Error('DuckDB not connected. Call connect() first.')); return; }
      this.db.all(sql, ...params, (err: Error | null, rows: Record<string, unknown>[]) =>
        err ? rej(err) : res(rows ?? []));
    });
  }

  // --- Connection lifecycle ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ 'duckdb' as string);
      const duckdb = (mod as { default?: unknown }).default ?? mod;
      const Database = (duckdb as { Database: new (p: string) => DuckDbDatabase }).Database;
      const uri = config.uri;
      if (uri && uri !== ':memory:') {
        const dbPath = resolve(uri);
        const dir = dirname(dbPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        this.db = new Database(dbPath);
      } else {
        this.db = new Database(':memory:');
      }
    } catch (e: unknown) {
      throw new Error(
        `DuckDB driver not found. Install it: npm install duckdb\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (!this.db) return;
    const db = this.db;
    this.db = null;
    await new Promise<void>((res) => db.close(() => res()));
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.db) return false;
    try {
      await this.allAsync('SELECT 1', []);
      return true;
    } catch (e) {
      this.log('TEST_CONNECTION', `down: ${(e as Error).message}`);
      return false;
    }
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    return await this.allAsync(sql, params) as T[];
  }

  /**
   * Les instructions DML DuckDB renvoient une ligne unique avec une colonne
   * `Count` (BigInt) = nombre de lignes affectées — on la lit pour `{ changes }`.
   */
  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    const rows = await this.allAsync(sql, params);
    const c = rows?.[0]?.['Count'] ?? rows?.[0]?.['count'];
    const changes = typeof c === 'bigint' ? Number(c) : (typeof c === 'number' ? c : 0);
    return { changes };
  }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new DuckDBDialect();
}

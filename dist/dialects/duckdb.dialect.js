// DuckDB Dialect — extends AbstractSqlDialect
// Moteur OLAP colonnaire in-process (fichier ou :memory:), SQL compatible PostgreSQL.
// Equivalent d'esprit à une "SQLite analytique". Driver: npm install duckdb
// NB: duckdb-wasm permet aussi l'exécution navigateur (cf. docs ORM-py / micro-moteur).
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
// ============================================================
// Type Mapping — DAL FieldType → DuckDB column type (proche PostgreSQL)
// ============================================================
const DUCKDB_TYPE_MAP = {
    string: 'VARCHAR',
    text: 'VARCHAR',
    number: 'DOUBLE',
    boolean: 'BOOLEAN',
    date: 'TIMESTAMP',
    json: 'JSON',
    array: 'JSON',
};
// ============================================================
// DuckDBDialect — driver callback → async normalizer
// ============================================================
export class DuckDBDialect extends AbstractSqlDialect {
    dialectType = 'duckdb';
    /** Exposé pour accès brut en test. */
    db = null;
    // --- Abstract implementations ---
    quoteIdentifier(name) {
        return `"${name}"`;
    }
    getPlaceholder(_index) {
        return '?';
    }
    fieldToSqlType(field) {
        return DUCKDB_TYPE_MAP[field.type] || 'VARCHAR';
    }
    getIdColumnType() {
        return 'VARCHAR';
    }
    getTableListQuery() {
        return "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'main'";
    }
    /** DuckDB expose `information_schema.columns` (ANSI). */
    async getExistingColumns(tableName) {
        try {
            const rows = await this.executeQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = ?`, [tableName]);
            return new Set(rows.map(r => r.column_name).filter(Boolean));
        }
        catch {
            return new Set();
        }
    }
    // --- Hooks ---
    supportsIfNotExists() { return true; }
    // Chemin sûr (INSERT puis SELECT) comme SQLite — évite de dépendre de RETURNING.
    supportsReturning() { return false; }
    serializeBoolean(v) { return v; } // BOOLEAN natif
    deserializeBoolean(v) { return v === true || v === 1 || v === 'true'; }
    /** DuckDB supporte ILIKE (comme PostgreSQL) pour le insensible à la casse. */
    buildRegexCondition(col, flags) {
        if (flags?.includes('i'))
            return `${col} ILIKE ${this.nextPlaceholder()}`;
        return `${col} LIKE ${this.nextPlaceholder()}`;
    }
    // --- callback → promise (driver classique `duckdb`) ---
    allAsync(sql, params) {
        return new Promise((res, rej) => {
            if (!this.db) {
                rej(new Error('DuckDB not connected. Call connect() first.'));
                return;
            }
            this.db.all(sql, ...params, (err, rows) => err ? rej(err) : res(rows ?? []));
        });
    }
    // --- Connection lifecycle ---
    async doConnect(config) {
        try {
            const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ 'duckdb');
            const duckdb = mod.default ?? mod;
            const Database = duckdb.Database;
            const uri = config.uri;
            if (uri && uri !== ':memory:') {
                const dbPath = resolve(uri);
                const dir = dirname(dbPath);
                if (!existsSync(dir))
                    mkdirSync(dir, { recursive: true });
                this.db = new Database(dbPath);
            }
            else {
                this.db = new Database(':memory:');
            }
        }
        catch (e) {
            throw new Error(`DuckDB driver not found. Install it: npm install duckdb\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async doDisconnect() {
        if (!this.db)
            return;
        const db = this.db;
        this.db = null;
        await new Promise((res) => db.close(() => res()));
    }
    async doTestConnection() {
        if (!this.db)
            return false;
        try {
            await this.allAsync('SELECT 1', []);
            return true;
        }
        catch (e) {
            this.log('TEST_CONNECTION', `down: ${e.message}`);
            return false;
        }
    }
    // --- Query execution ---
    async doExecuteQuery(sql, params) {
        return await this.allAsync(sql, params);
    }
    /**
     * Les instructions DML DuckDB renvoient une ligne unique avec une colonne
     * `Count` (BigInt) = nombre de lignes affectées — on la lit pour `{ changes }`.
     */
    async doExecuteRun(sql, params) {
        const rows = await this.allAsync(sql, params);
        const c = rows?.[0]?.['Count'] ?? rows?.[0]?.['count'];
        const changes = typeof c === 'bigint' ? Number(c) : (typeof c === 'number' ? c : 0);
        return { changes };
    }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new DuckDBDialect();
}

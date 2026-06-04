// MySQL Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.MySQLDialect (Hibernate ORM 6.4)
// Driver: npm install mysql2
// Author: Dr Hamid MADANI drmdh@msn.com
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
// ============================================================
// Type Mapping — DAL FieldType → MySQL column type
// ============================================================
const MYSQL_TYPE_MAP = {
    string: 'VARCHAR(255)',
    text: 'LONGTEXT',
    number: 'DOUBLE',
    boolean: 'TINYINT(1)',
    date: 'DATETIME',
    json: 'JSON',
    array: 'JSON',
};
// ============================================================
// MySQLDialect
// ============================================================
export class MySQLDialect extends AbstractSqlDialect {
    dialectType = 'mysql';
    pool = null;
    // --- Abstract implementations ---
    quoteIdentifier(name) {
        return `\`${name}\``;
    }
    getPlaceholder(_index) {
        return '?';
    }
    fieldToSqlType(field) {
        return MYSQL_TYPE_MAP[field.type] || 'VARCHAR(255)';
    }
    getIdColumnType() {
        return 'VARCHAR(36)';
    }
    getTableListQuery() {
        return "SELECT table_name as name FROM information_schema.tables WHERE table_schema = DATABASE()";
    }
    // --- Hooks ---
    supportsIfNotExists() { return true; }
    supportsReturning() { return false; }
    /**
     * MySQL/MariaDB ne supportent pas `CREATE UNIQUE INDEX … WHERE …`
     * (partial unique index). Sur ces dialects, `sparse: true` est
     * loggé en warning et la contrainte unique reste globale (réinsertion
     * après soft-delete bloquée par la contrainte).
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §10.
     */
    supportsPartialIndex() { return false; }
    /**
     * MySQL/MariaDB : `SET SESSION TRANSACTION ISOLATION LEVEL` doit précéder
     * `START TRANSACTION` (ou `BEGIN`). La syntaxe ANSI par défaut
     * `BEGIN; SET TRANSACTION ISOLATION LEVEL X` produit un ordre invalide
     * (l'isolation set après BEGIN affecte la transaction suivante, pas
     * la transaction en cours).
     *
     * Les 4 niveaux ANSI sont supportés nativement par MySQL/MariaDB.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §5.
     * Audit live amia recommandé pour confirmation.
     */
    beginSql(opts) {
        if (!opts?.isolation)
            return 'START TRANSACTION';
        return `SET SESSION TRANSACTION ISOLATION LEVEL ${opts.isolation}; START TRANSACTION`;
    }
    // MySQL 5.x doesn't support CREATE INDEX IF NOT EXISTS (MySQL 8+ does)
    getCreateIndexPrefix(indexName, unique) {
        const u = unique ? 'UNIQUE ' : '';
        return `CREATE ${u}INDEX ${this.quoteIdentifier(indexName)}`;
    }
    // MySQL 5.x: try/catch car pas de IF NOT EXISTS sur CREATE INDEX
    async executeIndexStatement(stmt) {
        try {
            await this.executeRun(stmt, []);
        }
        catch (e) {
            // Index already exists — log au lieu de swallow silencieux (MySQL 5.x compat)
            this.log('CREATE_INDEX', `skipped (may already exist): ${e.message}`);
        }
    }
    // MySQL/MariaDB DATETIME: use 'YYYY-MM-DD HH:MM:SS' format (no T, no Z)
    serializeDate(value) {
        let d = null;
        if (value === 'now' || value === '__MOSTA_NOW__')
            d = new Date();
        else if (value instanceof Date)
            d = value;
        else if (typeof value === 'string') {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime()))
                d = parsed;
            else
                return value;
        }
        if (!d)
            return null;
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
    }
    // MySQL uses TINYINT(1) for boolean: 1 = true, 0 = false
    serializeBoolean(v) { return v ? 1 : 0; }
    deserializeBoolean(v) {
        return v === 1 || v === true || v === '1';
    }
    // --- Connection ---
    async doConnect(config) {
        try {
            const mysql2 = await import(/* webpackIgnore: true */ 'mysql2/promise');
            const createPool = mysql2.default?.createPool || mysql2.createPool;
            this.pool = createPool({
                uri: config.uri,
                connectionLimit: config.poolSize ?? 10,
                waitForConnections: true,
            });
        }
        catch (e) {
            throw new Error(`MySQL driver not found. Install it: npm install mysql2\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async doDisconnect() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
    async doTestConnection() {
        if (!this.pool)
            return false;
        const conn = await this.pool.getConnection();
        try {
            await conn.query('SELECT 1');
            return true;
        }
        finally {
            conn.release();
        }
    }
    // --- Query execution ---
    async doExecuteQuery(sql, params) {
        if (!this.pool)
            throw new Error('MySQL not connected. Call connect() first.');
        const [rows] = await this.pool.execute(sql, params);
        return rows;
    }
    async doExecuteRun(sql, params) {
        if (!this.pool)
            throw new Error('MySQL not connected. Call connect() first.');
        const [result] = await this.pool.execute(sql, params);
        return { changes: result.affectedRows ?? 0 };
    }
    getDialectLabel() { return 'MySQL'; }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new MySQLDialect();
}

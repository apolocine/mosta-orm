// PostgreSQL Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.PostgreSQLDialect (Hibernate ORM 6.4)
// Driver: npm install pg
// Author: Dr Hamid MADANI drmdh@msn.com
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
// ============================================================
// Type Mapping — DAL FieldType → PostgreSQL column type
// ============================================================
const PG_TYPE_MAP = {
    string: 'TEXT',
    text: 'TEXT',
    number: 'DOUBLE PRECISION',
    boolean: 'BOOLEAN',
    date: 'TIMESTAMPTZ',
    json: 'JSONB',
    array: 'JSONB',
};
// ============================================================
// PostgresDialect
// ============================================================
export class PostgresDialect extends AbstractSqlDialect {
    dialectType = 'postgres';
    pool = null;
    // --- Abstract implementations ---
    quoteIdentifier(name) {
        return `"${name}"`;
    }
    getPlaceholder(index) {
        return `$${index}`;
    }
    fieldToSqlType(field) {
        return PG_TYPE_MAP[field.type] || 'TEXT';
    }
    getIdColumnType() {
        return 'TEXT';
    }
    getTableListQuery() {
        return "SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'";
    }
    // --- Hooks ---
    supportsIfNotExists() { return true; }
    supportsReturning() { return true; }
    serializeBoolean(v) { return v; }
    deserializeBoolean(v) { return v === true || v === 't' || v === 'true'; }
    /** PostgreSQL LIKE is case-sensitive — use ILIKE when flags contain 'i' */
    buildRegexCondition(col, flags) {
        if (flags?.includes('i')) {
            return `${col} ILIKE ${this.nextPlaceholder()}`;
        }
        return `${col} LIKE ${this.nextPlaceholder()}`;
    }
    // --- Connection ---
    async doConnect(config) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pg = await import(/* webpackIgnore: true */ 'pg');
            const Pool = pg.default?.Pool || pg.Pool;
            this.pool = new Pool({
                connectionString: config.uri,
                max: config.poolSize ?? 10,
            });
        }
        catch (e) {
            throw new Error(`PostgreSQL driver not found. Install it: npm install pg\n` +
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
        const client = await this.pool.connect();
        try {
            await client.query('SELECT 1');
            return true;
        }
        finally {
            client.release();
        }
    }
    // --- Query execution ---
    async doExecuteQuery(sql, params) {
        if (!this.pool)
            throw new Error('PostgreSQL not connected. Call connect() first.');
        const result = await this.pool.query(sql, params);
        return result.rows;
    }
    async doExecuteRun(sql, params) {
        if (!this.pool)
            throw new Error('PostgreSQL not connected. Call connect() first.');
        const result = await this.pool.query(sql, params);
        return { changes: result.rowCount ?? 0 };
    }
    getDialectLabel() { return 'PostgreSQL'; }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new PostgresDialect();
}

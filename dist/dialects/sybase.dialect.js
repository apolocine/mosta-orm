// Sybase ASE Dialect — extends MSSQLDialect
// Equivalent to org.hibernate.dialect.SybaseASEDialect (Hibernate ORM 6.4)
// Sybase ASE shares T-SQL heritage with SQL Server
// Driver: npm install sybase
// Author: Dr Hamid MADANI drmdh@msn.com
import { MSSQLDialect } from './mssql.dialect.js';
// ============================================================
// Sybase Type Mapping overrides
// ============================================================
const SYBASE_TYPE_MAP = {
    string: 'NVARCHAR(MAX)',
    text: 'TEXT',
    number: 'FLOAT',
    boolean: 'TINYINT',
    date: 'DATETIME',
    json: 'TEXT',
    array: 'TEXT',
};
// ============================================================
// SybaseDialect
// ============================================================
class SybaseDialect extends MSSQLDialect {
    dialectType = 'sybase';
    // Sybase ASE does NOT support RETURNING/OUTPUT
    supportsReturning() { return false; }
    // Sybase uses TINYINT for boolean (not BIT)
    serializeBoolean(v) { return v ? 1 : 0; }
    deserializeBoolean(v) {
        return v === 1 || v === true || v === '1';
    }
    // Override type mapping for Sybase-specific types
    fieldToSqlType(field) {
        return SYBASE_TYPE_MAP[field.type] || 'NVARCHAR(MAX)';
    }
    getTableListQuery() {
        return "SELECT name FROM sysobjects WHERE type = 'U'";
    }
    // Sybase uses TOP n instead of OFFSET/FETCH
    buildLimitOffset(options) {
        // Sybase doesn't support OFFSET/FETCH
        // TOP is applied in the SELECT clause — handled differently
        // For now return empty; TOP is handled via query rewrite
        return '';
    }
    // Override connection to use sybase driver
    async doConnect(config) {
        try {
            const sybase = await import(/* webpackIgnore: true */ 'sybase');
            const SybaseDriver = sybase.default || sybase;
            const parsed = this.parseSybaseUri(config.uri);
            this.pool = new SybaseDriver(parsed);
            await this.pool.connect();
        }
        catch (e) {
            throw new Error(`Sybase driver not found. Install it: npm install sybase\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async doDisconnect() {
        if (this.pool) {
            await this.pool.disconnect();
            this.pool = null;
        }
    }
    async doTestConnection() {
        if (!this.pool)
            return false;
        await this.pool.query('SELECT 1');
        return true;
    }
    async doExecuteQuery(sql, params) {
        if (!this.pool)
            throw new Error('Sybase not connected. Call connect() first.');
        // Sybase driver doesn't support named params — replace @pN with values
        const resolvedSql = this.resolveParams(sql, params);
        const result = await this.pool.query(resolvedSql);
        return Array.isArray(result) ? result : [];
    }
    async doExecuteRun(sql, params) {
        if (!this.pool)
            throw new Error('Sybase not connected. Call connect() first.');
        const resolvedSql = this.resolveParams(sql, params);
        const result = await this.pool.query(resolvedSql);
        return { changes: result?.rowsAffected ?? 0 };
    }
    /** Inline parameters into SQL (Sybase driver limitation) */
    resolveParams(sql, params) {
        let result = sql;
        for (let i = params.length; i >= 1; i--) {
            const val = params[i - 1];
            const replacement = val === null ? 'NULL'
                : typeof val === 'number' ? String(val)
                    : `'${String(val).replace(/'/g, "''")}'`;
            result = result.replace(`@p${i}`, replacement);
        }
        return result;
    }
    parseSybaseUri(uri) {
        try {
            const url = new URL(uri.replace(/^sybase:/, 'http:'));
            return {
                host: url.hostname || 'localhost',
                port: url.port ? parseInt(url.port) : 5000,
                user: url.username || 'sa',
                password: url.password || '',
                database: url.pathname.replace(/^\//, '') || 'master',
            };
        }
        catch {
            return { host: 'localhost', port: 5000, database: 'master' };
        }
    }
    getDialectLabel() { return 'Sybase'; }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new SybaseDialect();
}

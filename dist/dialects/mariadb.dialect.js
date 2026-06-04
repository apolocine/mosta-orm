// MariaDB Dialect — extends MySQLDialect
// Equivalent to org.hibernate.dialect.MariaDBDialect (Hibernate ORM 6.4)
// MariaDB extends MySQLDialect — MySQL-compatible with some differences
// Driver: npm install mariadb (native MariaDB driver, better performance than mysql2)
// Author: Dr Hamid MADANI drmdh@msn.com
import { MySQLDialect } from './mysql.dialect.js';
// ============================================================
// MariaDBDialect
// ============================================================
class MariaDBDialect extends MySQLDialect {
    dialectType = 'mariadb';
    // MariaDB supports RETURNING since 10.5
    supportsReturning() { return true; }
    // Override connection to use native mariadb driver
    async doConnect(config) {
        try {
            const mariadb = await import(/* webpackIgnore: true */ 'mariadb');
            const createPool = mariadb.default?.createPool || mariadb.createPool;
            this.pool = createPool({
                ...this.parseUri(config.uri),
                connectionLimit: config.poolSize ?? 10,
            });
        }
        catch {
            // Fallback to mysql2 driver (cross-compatible)
            try {
                await super.doConnect(config);
            }
            catch (e) {
                throw new Error(`MariaDB driver not found. Install it: npm install mariadb\n` +
                    `Or use MySQL-compatible driver: npm install mysql2\n` +
                    `Original error: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    // Override executeQuery to handle mariadb driver's different API
    async doExecuteQuery(sql, params) {
        if (!this.pool)
            throw new Error('MariaDB not connected. Call connect() first.');
        try {
            const rows = await this.pool.query(sql, params);
            // mariadb driver returns rows directly (may include meta at the end)
            if (Array.isArray(rows)) {
                return rows.filter((r) => typeof r === 'object' && r !== null && !('affectedRows' in r));
            }
            return rows;
        }
        catch (err) {
            // Rethrow mariadb errors instead of silently falling back
            throw err;
        }
    }
    async doExecuteRun(sql, params) {
        if (!this.pool)
            throw new Error('MariaDB not connected. Call connect() first.');
        try {
            const result = await this.pool.query(sql, params);
            return { changes: result.affectedRows ?? 0 };
        }
        catch (err) {
            throw err;
        }
    }
    /** Parse a MySQL/MariaDB URI into connection options */
    parseUri(uri) {
        try {
            const url = new URL(uri.replace(/^mariadb:/, 'http:').replace(/^mysql:/, 'http:'));
            return {
                host: (url.hostname || 'localhost').replace(/^\[|\]$/g, ''),
                port: url.port ? parseInt(url.port) : 3306,
                user: url.username || undefined,
                password: url.password || undefined,
                database: url.pathname.replace(/^\//, '') || undefined,
            };
        }
        catch {
            return { host: 'localhost', port: 3306 };
        }
    }
    getDialectLabel() { return 'MariaDB'; }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new MariaDBDialect();
}

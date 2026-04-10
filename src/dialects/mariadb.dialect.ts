// MariaDB Dialect — extends MySQLDialect
// Equivalent to org.hibernate.dialect.MariaDBDialect (Hibernate ORM 6.4)
// MariaDB extends MySQLDialect — MySQL-compatible with some differences
// Driver: npm install mariadb (native MariaDB driver, better performance than mysql2)
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
} from '../core/types.js';
import { MySQLDialect } from './mysql.dialect.js';

// ============================================================
// MariaDBDialect
// ============================================================

class MariaDBDialect extends MySQLDialect {
  readonly dialectType: DialectType = 'mariadb';

  // MariaDB supports RETURNING since 10.5
  protected supportsReturning(): boolean { return true; }

  // Override connection to use native mariadb driver
  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const mariadb = await import(/* webpackIgnore: true */ 'mariadb' as string);
      const createPool = mariadb.default?.createPool || mariadb.createPool;
      this.pool = createPool({
        ...this.parseUri(config.uri),
        connectionLimit: config.poolSize ?? 10,
      });
    } catch {
      // Fallback to mysql2 driver (cross-compatible)
      try {
        await super.doConnect(config);
      } catch (e: unknown) {
        throw new Error(
          `MariaDB driver not found. Install it: npm install mariadb\n` +
          `Or use MySQL-compatible driver: npm install mysql2\n` +
          `Original error: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  // Override executeQuery to handle mariadb driver's different API
  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('MariaDB not connected. Call connect() first.');
    try {
      const rows = await (this.pool as { query(sql: string, params: unknown[]): Promise<T[]> }).query(sql, params);
      // mariadb driver returns rows directly (may include meta at the end)
      if (Array.isArray(rows)) {
        return rows.filter((r: unknown) =>
          typeof r === 'object' && r !== null && !('affectedRows' in (r as Record<string, unknown>))
        );
      }
      return rows;
    } catch (err: unknown) {
      // Rethrow mariadb errors instead of silently falling back
      throw err;
    }
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('MariaDB not connected. Call connect() first.');
    try {
      const result = await (this.pool as { query(sql: string, params: unknown[]): Promise<{ affectedRows?: number }> }).query(sql, params);
      return { changes: (result as { affectedRows?: number }).affectedRows ?? 0 };
    } catch (err: unknown) {
      throw err;
    }
  }

  /** Parse a MySQL/MariaDB URI into connection options */
  private parseUri(uri: string): Record<string, unknown> {
    try {
      const url = new URL(uri.replace(/^mariadb:/, 'http:').replace(/^mysql:/, 'http:'));
      return {
        host: (url.hostname || 'localhost').replace(/^\[|\]$/g, ''),
        port: url.port ? parseInt(url.port) : 3306,
        user: url.username || undefined,
        password: url.password || undefined,
        database: url.pathname.replace(/^\//, '') || undefined,
      };
    } catch {
      return { host: 'localhost', port: 3306 };
    }
  }

  protected getDialectLabel(): string { return 'MariaDB'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new MariaDBDialect();
}

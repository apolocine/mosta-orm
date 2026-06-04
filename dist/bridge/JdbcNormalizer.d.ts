import type { DialectType } from '../core/types.js';
export interface JdbcBridgeConfig {
    dialect: DialectType;
    host: string;
    port?: number;
    database: string;
    user?: string;
    password?: string;
    bridgePort?: number;
    jarDir?: string;
    bridgeJavaFile?: string;
}
/**
 * Parse a SGBD_URI into host/port/database/user/password components.
 * Handles formats like:
 *   hsqldb:hsql://localhost:9001/mydb
 *   oracle://user:pass@host:1521/service
 *   db2://user:pass@host:50000/mydb
 */
export declare function parseUri(dialect: DialectType, uri: string): Omit<JdbcBridgeConfig, 'dialect'>;
export declare class JdbcNormalizer {
    private process;
    private bridgeUrl;
    private _active;
    /**
     * Try to find a JAR for the given dialect.
     * Returns the full path to the JAR, or null if not found.
     */
    static findJar(dialect: DialectType, jarDir?: string): string | null;
    /**
     * Check if a JDBC bridge is available for this dialect (JAR exists).
     */
    static isAvailable(dialect: DialectType, jarDir?: string): boolean;
    /**
     * Compose the JDBC URL from parsed URI components.
     */
    static composeJdbcUrl(dialect: DialectType, config: Omit<JdbcBridgeConfig, 'dialect'>): string;
    /**
     * Start the JDBC bridge for a given dialect and URI.
     * Returns the HTTP base URL (e.g. http://localhost:8765).
     */
    start(dialect: DialectType, uri: string, options?: {
        bridgePort?: number;
        jarDir?: string;
        bridgeJavaFile?: string;
    }): Promise<string>;
    /**
     * Wait for the bridge health endpoint to respond.
     */
    private waitForReady;
    /**
     * Execute a query via the bridge HTTP endpoint.
     */
    query<T>(sql: string, params: unknown[]): Promise<T>;
    /**
     * Stop the bridge process.
     */
    stop(): void;
    /** Whether the bridge is currently active */
    get active(): boolean;
    /** The HTTP base URL of the running bridge */
    get url(): string;
}

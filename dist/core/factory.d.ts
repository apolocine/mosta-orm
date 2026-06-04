import type { IDialect, DialectType, ConnectionConfig, EntitySchema } from './types.js';
/**
 * Read the database configuration from environment variables.
 *
 * Resolution cascade : if `MOSTA_ENV` is set (e.g. `TEST`, `DEV`, `PROD`),
 * profile-prefixed variables override their plain counterparts.
 *
 *   MOSTA_ENV=TEST
 *   TEST_DB_DIALECT=sqlite   ← used
 *   DB_DIALECT=postgres      ← ignored when profile override exists
 *
 * Missing profile overrides silently fall back to the plain variables.
 *
 * Required (after cascade) :
 *   DB_DIALECT  = mongodb | sqlite | postgres | mysql | mariadb | oracle |
 *                 mssql | cockroachdb | db2 | hana | hsqldb | spanner | sybase
 *   SGBD_URI    = connection string
 *
 * Throws if DB_DIALECT or SGBD_URI is missing (both profiled and plain).
 */
export declare function getConfigFromEnv(): ConnectionConfig;
/**
 * Initialize and connect the dialect.
 * Returns a singleton — subsequent calls return the same instance.
 */
export declare function getDialect(config?: ConnectionConfig): Promise<IDialect>;
/**
 * Get the current dialect type without connecting.
 * Respects MOSTA_ENV profile cascade.
 */
export declare function getCurrentDialectType(): DialectType;
/**
 * Disconnect the current dialect and reset the singleton.
 */
export declare function disconnectDialect(): Promise<void>;
/**
 * Test the connection with a given config without changing the active dialect.
 * Used by the setup wizard to validate before committing.
 */
export declare function testConnection(config: ConnectionConfig): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * Simplified high-level API: connect to a database and optionally register schemas.
 * Returns the connected dialect instance.
 *
 * Example:
 *   const dialect = await createConnection({
 *     dialect: 'sqlite',
 *     uri: './my.db',
 *     schemaStrategy: 'update',
 *   }, [ContactSchema, OrderSchema]);
 */
export declare function createConnection(config: ConnectionConfig, schemas?: EntitySchema[]): Promise<IDialect>;
/**
 * Create an isolated dialect instance — NOT stored as singleton.
 * Each call returns a new, independent connection to the database.
 * Schemas are initialized on this instance only, not in the global registry.
 *
 * Use this when you need multiple simultaneous database connections
 * (e.g., multi-project / multi-tenant scenarios).
 *
 * Example:
 *   const pgDialect = await createIsolatedDialect({
 *     dialect: 'postgres',
 *     uri: 'postgresql://user:pass@localhost:5432/mydb',
 *   }, [UsersSchema, OrdersSchema]);
 *
 *   const oracleDialect = await createIsolatedDialect({
 *     dialect: 'oracle',
 *     uri: 'oracle://user:pass@localhost:1521/XE',
 *   }, [UsersSchema]);
 *
 *   // Each dialect is independent — no shared state
 */
export declare function createIsolatedDialect(config: ConnectionConfig, schemas?: EntitySchema[]): Promise<IDialect>;
/**
 * Drop a database.
 *
 * - **mongodb**: drops the database (all collections deleted)
 * - **sqlite**: deletes the file
 * - **spanner**: not supported (use gcloud CLI)
 * - **SQL dialects**: connects to the system DB, runs DROP DATABASE
 *
 * ⚠️ This is IRREVERSIBLE — all data in the database will be lost.
 *
 * @param dialect  - target dialect
 * @param uri      - full connection URI to the TARGET database
 * @param dbName   - name of the database to drop
 */
export declare function dropDatabase(dialect: DialectType, uri: string, dbName: string): Promise<{
    ok: boolean;
    detail?: string;
    error?: string;
}>;
/**
 * Create a database if it does not exist.
 *
 * - **mongodb**: no-op (auto-created on first write)
 * - **sqlite**: no-op (file auto-created)
 * - **spanner**: not supported (use gcloud CLI)
 * - **SQL dialects**: connects to the system DB, runs CREATE DATABASE
 *
 * @param dialect  - target dialect
 * @param uri      - full connection URI to the TARGET database (used to extract credentials)
 * @param dbName   - name of the database to create
 */
export declare function createDatabase(dialect: DialectType, uri: string, dbName: string): Promise<{
    ok: boolean;
    detail?: string;
    error?: string;
}>;
/**
 * Register a named connection for later retrieval.
 * @param name    - Unique name (e.g., 'portal', 'analytics', 'tenant-42')
 * @param dialect - Connected dialect instance
 */
export declare function registerNamedConnection(name: string, dialect: IDialect): void;
/**
 * Retrieve a previously registered named connection.
 * Returns null if not found. Does NOT create a new connection.
 * @param name - Connection name
 */
export declare function getNamedConnection(name: string): IDialect | null;
/**
 * Remove a named connection from the registry.
 * Does NOT disconnect — call dialect.disconnect() separately.
 * @param name - Connection name to remove
 */
export declare function removeNamedConnection(name: string): void;
/** List all registered connection names. */
export declare function listNamedConnections(): string[];
/** Remove all named connections (for testing or shutdown). */
export declare function clearNamedConnections(): void;

// Adapter Factory - Reads DB_DIALECT + SGBD_URI from env or config
// Equivalent to Hibernate's SessionFactory / persistence.xml
// Author: Dr Hamid MADANI drmdh@msn.com
import type { IDialect, DialectType, ConnectionConfig, EntitySchema } from './types.js';
import { getDialectConfig, getSupportedDialects } from './config.js';
import { getAllSchemas, registerSchemas } from './registry.js';

/** Singleton dialect instance */
let currentDialect: IDialect | null = null;
let currentConfig: ConnectionConfig | null = null;

/**
 * Dynamically load a dialect adapter module.
 * Only the selected dialect is loaded — no unused drivers in memory.
 */
async function loadDialectModule(dialect: DialectType): Promise<{ createDialect: () => IDialect }> {
  switch (dialect) {
    case 'mongodb':      return import('../dialects/mongo.dialect.js');
    case 'sqlite':       return import('../dialects/sqlite.dialect.js');
    case 'postgres':     return import('../dialects/postgres.dialect.js');
    case 'mysql':        return import('../dialects/mysql.dialect.js');
    case 'mariadb':      return import('../dialects/mariadb.dialect.js');
    case 'oracle':       return import('../dialects/oracle.dialect.js');
    case 'mssql':        return import('../dialects/mssql.dialect.js');
    case 'cockroachdb':  return import('../dialects/cockroachdb.dialect.js');
    case 'db2':          return import('../dialects/db2.dialect.js');
    case 'hana':         return import('../dialects/hana.dialect.js');
    case 'hsqldb':       return import('../dialects/hsqldb.dialect.js');
    case 'spanner':      return import('../dialects/spanner.dialect.js');
    case 'sybase':       return import('../dialects/sybase.dialect.js');
    default:
      throw new Error(
        `No loader for dialect "${dialect}". Supported: ${getSupportedDialects().join(', ')}`
      );
  }
}

/**
 * Read the database configuration from environment variables.
 *
 * Required env vars:
 *   DB_DIALECT  = mongodb | sqlite | postgres | mysql | mariadb | oracle | mssql | cockroachdb | db2 | hana | hsqldb | spanner | sybase
 *   SGBD_URI    = connection string
 *
 * Throws if DB_DIALECT or SGBD_URI is missing.
 */
export function getConfigFromEnv(): ConnectionConfig {
  const dialect = process.env.DB_DIALECT as DialectType | undefined;
  const uri = process.env.SGBD_URI;

  if (!dialect) {
    throw new Error(
      'DB_DIALECT is not defined in environment\n' +
      `Supported: ${getSupportedDialects().join(', ')}`
    );
  }

  // Validate dialect name
  getDialectConfig(dialect);

  if (!uri) {
    throw new Error(
      `SGBD_URI is not defined in environment\n` +
      `DB_DIALECT=${dialect} requires a connection string in SGBD_URI`
    );
  }

  return {
    dialect,
    uri,
    // Hibernate-inspired properties from env
    showSql:        process.env.DB_SHOW_SQL === 'true',
    formatSql:      process.env.DB_FORMAT_SQL === 'true',
    highlightSql:   process.env.DB_HIGHLIGHT_SQL === 'true',
    schemaStrategy: (process.env.DB_SCHEMA_STRATEGY as ConnectionConfig['schemaStrategy']) || 'none',
    poolSize:       process.env.DB_POOL_SIZE ? Number(process.env.DB_POOL_SIZE) : undefined,
    cacheEnabled:   process.env.DB_CACHE_ENABLED === 'true',
    cacheTtlSeconds: process.env.DB_CACHE_TTL ? Number(process.env.DB_CACHE_TTL) : undefined,
    batchSize:      process.env.DB_BATCH_SIZE ? Number(process.env.DB_BATCH_SIZE) : undefined,
  };
}

/**
 * Initialize and connect the dialect.
 * Returns a singleton — subsequent calls return the same instance.
 */
export async function getDialect(config?: ConnectionConfig): Promise<IDialect> {
  if (currentDialect) {
    return currentDialect;
  }

  const cfg = config || getConfigFromEnv();
  const dialectCfg = getDialectConfig(cfg.dialect);

  try {
    const mod = await loadDialectModule(cfg.dialect);
    currentDialect = mod.createDialect();
    await currentDialect.connect(cfg);
    currentConfig = cfg;

    // Hibernate SessionFactory — register all entity models on first connection
    await currentDialect.initSchema(getAllSchemas());

    return currentDialect;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('Cannot find module') || message.includes('MODULE_NOT_FOUND')) {
      throw new Error(
        `Dialect "${dialectCfg.label}" requires a driver. Install it:\n  ${dialectCfg.installHint}`
      );
    }

    throw err;
  }
}

/**
 * Get the current dialect type without connecting.
 */
export function getCurrentDialectType(): DialectType {
  if (currentConfig) return currentConfig.dialect;
  return process.env.DB_DIALECT as DialectType || 'mongodb';
}

/**
 * Disconnect the current dialect and reset the singleton.
 */
export async function disconnectDialect(): Promise<void> {
  if (currentDialect) {
    await currentDialect.disconnect();
    currentDialect = null;
    currentConfig = null;
  }
}

/**
 * Test the connection with a given config without changing the active dialect.
 * Used by the setup wizard to validate before committing.
 */
export async function testConnection(config: ConnectionConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const mod = await loadDialectModule(config.dialect);
    const dialect = mod.createDialect();
    await dialect.connect(config);
    const ok = await dialect.testConnection();
    await dialect.disconnect();
    if (!ok) {
      return { ok: false, error: 'Connection test returned false (SELECT 1 failed or driver test failed)' };
    }
    return { ok: true };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}

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
export async function createConnection(
  config: ConnectionConfig,
  schemas?: EntitySchema[],
): Promise<IDialect> {
  if (schemas) {
    registerSchemas(schemas);
  }
  return getDialect(config);
}

// ============================================================
// Isolated dialect — no singleton, no global registry
// Used by @mostajs/mproject for multi-project support
// ============================================================

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
export async function createIsolatedDialect(
  config: ConnectionConfig,
  schemas?: EntitySchema[],
): Promise<IDialect> {
  const dialectCfg = getDialectConfig(config.dialect);

  // Normalize schemas — ensure required fields exist to avoid null references
  const safeSchemas = schemas?.map(s => ({
    ...s,
    fields: s.fields || {},
    relations: s.relations || {},
    indexes: s.indexes || [],
  })) || [];

  try {
    const mod = await loadDialectModule(config.dialect);
    const dialect = mod.createDialect();
    await dialect.connect(config);

    // Initialize schemas on this instance only (not in global registry)
    if (safeSchemas.length > 0) {
      await dialect.initSchema(safeSchemas);
    }

    return dialect;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Cannot find module') || message.includes('MODULE_NOT_FOUND')) {
      throw new Error(
        `Dialect "${dialectCfg.label}" requires a driver. Install it:\n  ${dialectCfg.installHint}`
      );
    }
    throw err;
  }
}

// ============================================================
// Database creation
// ============================================================

/** System/default database used to connect before CREATE DATABASE */
const SYSTEM_DB: Partial<Record<DialectType, string>> = {
  postgres: 'postgres',
  cockroachdb: 'postgres',
  mysql: 'mysql',
  mariadb: 'mysql',
  mssql: 'master',
  oracle: 'XEPDB1',
  db2: 'SAMPLE',
  hana: 'SYSTEM',
  hsqldb: 'xdb',
  sybase: 'master',
};

/** DDL to create a database, per dialect family */
function getCreateDDL(dialect: DialectType, dbName: string): string {
  switch (dialect) {
    case 'mysql':
    case 'mariadb':
      return `CREATE DATABASE IF NOT EXISTS \`${dbName}\``;
    case 'mssql':
      return `IF NOT EXISTS (SELECT * FROM sys.databases WHERE name='${dbName}') CREATE DATABASE [${dbName}]`;
    default:
      // postgres, cockroachdb, db2, hana, hsqldb, sybase, oracle
      return `CREATE DATABASE "${dbName}"`;
  }
}

/** Error codes that mean "database already exists" */
function isAlreadyExistsError(dialect: DialectType, err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  const code = err?.code || '';
  return (
    code === '42P04' ||                          // PostgreSQL
    msg.includes('already exists') ||
    msg.includes('database exists') ||
    msg.includes('existe déjà') ||
    (dialect === 'mysql' && code === 'ER_DB_CREATE_EXISTS') ||
    (dialect === 'mssql' && msg.includes('already exists'))
  );
}

/** DDL to drop a database, per dialect family */
function getDropDDL(dialect: DialectType, dbName: string): string {
  switch (dialect) {
    case 'mysql':
    case 'mariadb':
      return `DROP DATABASE IF EXISTS \`${dbName}\``;
    case 'mssql':
      return `IF EXISTS (SELECT * FROM sys.databases WHERE name='${dbName}') DROP DATABASE [${dbName}]`;
    case 'postgres':
    case 'cockroachdb':
      return `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`;
    default:
      return `DROP DATABASE "${dbName}"`;
  }
}

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
export async function dropDatabase(
  dialect: DialectType,
  uri: string,
  dbName: string,
): Promise<{ ok: boolean; detail?: string; error?: string }> {
  if (dialect === 'sqlite') {
    if (uri === ':memory:') return { ok: true, detail: 'SQLite :memory: — nothing to drop' };
    try {
      const { unlinkSync, existsSync } = await import('fs');
      // SQLite WAL files
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        const f = uri + suffix;
        if (existsSync(f)) unlinkSync(f);
      }
      return { ok: true, detail: `SQLite file "${uri}" deleted` };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
  if (dialect === 'mongodb') {
    try {
      const mod = await loadDialectModule(dialect);
      const d = mod.createDialect();
      await d.connect({ dialect, uri, schemaStrategy: 'none' });
      // MongoDB dropDatabase is on the connection
      await (d as any).dropDatabase?.();
      await d.disconnect();
      return { ok: true, detail: `MongoDB database dropped` };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
  if (dialect === 'oracle') {
    return { ok: false, error: 'Oracle: drop user/schema via DBA, not via ORM' };
  }
  if (dialect === 'spanner') {
    return { ok: false, error: 'Cloud Spanner: drop via gcloud CLI' };
  }

  // SQL dialects — connect to system DB, run DROP DATABASE
  const systemDbName = SYSTEM_DB[dialect] || 'postgres';
  const systemUri = uri.replace(
    /\/([^/?]+)(\?|$)/,
    `/${systemDbName}$2`,
  );

  try {
    const mod = await loadDialectModule(dialect);
    const d = mod.createDialect();
    await d.connect({ dialect, uri: systemUri, schemaStrategy: 'none' });

    // For PostgreSQL: terminate active connections first
    if (dialect === 'postgres' || dialect === 'cockroachdb') {
      try {
        await (d as any).executeRun(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}' AND pid<>pg_backend_pid()`, []
        );
      } catch {}
    }

    const ddl = getDropDDL(dialect, dbName);
    try {
      await (d as any).executeRun(ddl, []);
      await d.disconnect();
      return { ok: true, detail: `Database "${dbName}" dropped` };
    } catch (err: any) {
      await d.disconnect();
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('n\'existe pas') || msg.includes('not exist')) {
        return { ok: true, detail: `Database "${dbName}" does not exist (already dropped)` };
      }
      return { ok: false, error: err.message };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

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
export async function createDatabase(
  dialect: DialectType,
  uri: string,
  dbName: string,
): Promise<{ ok: boolean; detail?: string; error?: string }> {
  // Auto-created dialects
  if (dialect === 'mongodb') {
    return { ok: true, detail: 'MongoDB: auto-created on first write' };
  }
  if (dialect === 'sqlite') {
    return { ok: true, detail: 'SQLite: file auto-created' };
  }
  if (dialect === 'oracle') {
    return { ok: true, detail: 'Oracle: tables are created in the connected user schema (PDB service)' };
  }
  if (dialect === 'spanner') {
    return { ok: false, error: 'Cloud Spanner: create via gcloud CLI' };
  }

  // Build a URI pointing to the system DB (same host/credentials, different DB name)
  const systemDbName = SYSTEM_DB[dialect] || 'postgres';
  const systemUri = uri.replace(
    /\/([^/?]+)(\?|$)/,
    `/${systemDbName}$2`,
  );

  try {
    // Load dialect, connect to system DB
    const mod = await loadDialectModule(dialect);
    const d = mod.createDialect();

    await d.connect({
      dialect,
      uri: systemUri,
      schemaStrategy: 'none',
    });

    // Run CREATE DATABASE
    const ddl = getCreateDDL(dialect, dbName);
    try {
      await (d as any).executeRun(ddl, []);
      await d.disconnect();
      return { ok: true, detail: `Database "${dbName}" created` };
    } catch (err: any) {
      await d.disconnect();
      if (isAlreadyExistsError(dialect, err)) {
        return { ok: true, detail: `Database "${dbName}" already exists` };
      }
      return { ok: false, error: err.message };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

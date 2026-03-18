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

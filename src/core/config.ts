// DAL Configuration - Dialect metadata registry
// All connection config (DB_DIALECT, SGBD_URI) is read from .env.local
// Author: Dr Hamid MADANI drmdh@msn.com
import type { DialectType } from './types.js';

export interface DialectConfig {
  /** npm install command for the driver */
  installHint: string;
  /** Human-readable label */
  label: string;
}

/**
 * Dialect metadata registry.
 * Connection config (dialect + URI) comes from .env.local, NOT from here.
 *
 * .env.local format (decommenter UN bloc) :
 *
 *   DB_DIALECT=mongodb
 *   SGBD_URI=mongodb://user:pass@localhost:27017/mydb
 *
 *   #DB_DIALECT=sqlite
 *   #SGBD_URI=./data/myapp.db
 *
 *   #DB_DIALECT=postgres
 *   #SGBD_URI=postgresql://user:pass@localhost:5432/mydb
 *
 *   #DB_DIALECT=mysql
 *   #SGBD_URI=mysql://user:pass@localhost:3306/mydb
 *
 *   #DB_DIALECT=mariadb
 *   #SGBD_URI=mariadb://user:pass@localhost:3306/mydb
 *
 *   #DB_DIALECT=oracle
 *   #SGBD_URI=oracle://user:pass@localhost:1521/mydb
 *
 *   #DB_DIALECT=mssql
 *   #SGBD_URI=mssql://user:pass@localhost:1433/mydb
 *
 *   #DB_DIALECT=cockroachdb
 *   #SGBD_URI=postgresql://user:pass@localhost:26257/mydb
 *
 *   #DB_DIALECT=db2
 *   #SGBD_URI=db2://user:pass@localhost:50000/mydb
 *
 *   #DB_DIALECT=hana
 *   #SGBD_URI=hana://user:pass@localhost:30015
 *
 *   #DB_DIALECT=hsqldb
 *   #SGBD_URI=hsqldb:hsql://localhost:9001/mydb
 *
 *   #DB_DIALECT=spanner
 *   #SGBD_URI=spanner://project/instance/mydb
 *
 *   #DB_DIALECT=sybase
 *   #SGBD_URI=sybase://user:pass@localhost:5000/mydb
 */
export const DIALECT_CONFIGS: Record<DialectType, DialectConfig> = {
  mongodb: {
    installHint: 'npm install mongoose',
    label: 'MongoDB',
  },
  sqlite: {
    installHint: 'npm install better-sqlite3',
    label: 'SQLite',
  },
  postgres: {
    installHint: 'npm install pg',
    label: 'PostgreSQL',
  },
  mysql: {
    installHint: 'npm install mysql2',
    label: 'MySQL',
  },
  mariadb: {
    installHint: 'npm install mariadb',
    label: 'MariaDB',
  },
  oracle: {
    installHint: 'npm install oracledb',
    label: 'Oracle Database',
  },
  mssql: {
    installHint: 'npm install mssql',
    label: 'SQL Server',
  },
  cockroachdb: {
    installHint: 'npm install pg',
    label: 'CockroachDB',
  },
  db2: {
    installHint: 'npm install ibm_db',
    label: 'IBM DB2',
  },
  hana: {
    installHint: 'npm install @sap/hana-client',
    label: 'SAP HANA',
  },
  hsqldb: {
    installHint: 'npm install hsqldb (Java driver)',
    label: 'HyperSQL',
  },
  spanner: {
    installHint: 'npm install @google-cloud/spanner',
    label: 'Google Cloud Spanner',
  },
  sybase: {
    installHint: 'npm install sybase',
    label: 'Sybase ASE',
  },
};

/**
 * Get the list of supported dialect types
 */
export function getSupportedDialects(): DialectType[] {
  return Object.keys(DIALECT_CONFIGS) as DialectType[];
}

/**
 * Get metadata for a specific dialect.
 * Throws if the dialect is not supported.
 */
export function getDialectConfig(dialect: DialectType): DialectConfig {
  const config = DIALECT_CONFIGS[dialect];
  if (!config) {
    throw new Error(
      `Unknown dialect "${dialect}". Supported: ${getSupportedDialects().join(', ')}`
    );
  }
  return config;
}

// JDBC Driver Registry — maps dialect → JAR pattern → JDBC URL template
// Used by JdbcNormalizer to auto-detect JARs and compose JDBC URLs
// Author: Dr Hamid MADANI drmdh@msn.com

import type { DialectType } from '../core/types.js';

export interface JdbcDriverInfo {
  /** Glob prefix to find the JAR in jar_files/ (e.g. 'hsqldb' matches hsqldb*.jar) */
  jarPrefix: string;

  /** JDBC URL template — {host}, {port}, {db} are replaced at runtime */
  jdbcUrlTemplate: string;

  /** Default SGBD port */
  defaultPort: number;

  /** Default JDBC user */
  defaultUser: string;

  /** Default JDBC password */
  defaultPassword: string;

  /** JDBC driver class name (for logging) */
  driverClass: string;

  /** Human-readable label */
  label: string;
}

/**
 * Registry of JDBC-bridge-eligible dialects.
 * Only dialects that benefit from the JDBC bridge are listed here.
 * Dialects with good npm drivers (pg, mysql2, mongoose...) are NOT listed.
 */
export const JDBC_REGISTRY: Partial<Record<DialectType, JdbcDriverInfo>> = {
  hsqldb: {
    jarPrefix:        'hsqldb',
    jdbcUrlTemplate:  'jdbc:hsqldb:hsql://{host}:{port}/{db}',
    defaultPort:      9001,
    defaultUser:      'SA',
    defaultPassword:  '',
    driverClass:      'org.hsqldb.jdbc.JDBCDriver',
    label:            'HyperSQL (HSQLDB)',
  },
  oracle: {
    jarPrefix:        'ojdbc',
    jdbcUrlTemplate:  'jdbc:oracle:thin:@//{host}:{port}/{db}',
    defaultPort:      1521,
    defaultUser:      'system',
    defaultPassword:  'oracle',
    driverClass:      'oracle.jdbc.OracleDriver',
    label:            'Oracle Database',
  },
  db2: {
    jarPrefix:        'db2jcc',
    jdbcUrlTemplate:  'jdbc:db2://{host}:{port}/{db}',
    defaultPort:      50000,
    defaultUser:      'db2inst1',
    defaultPassword:  'db2inst1',
    driverClass:      'com.ibm.db2.jcc.DB2Driver',
    label:            'IBM DB2',
  },
  sybase: {
    jarPrefix:        'jconn',
    jdbcUrlTemplate:  'jdbc:sybase:Tds:{host}:{port}/{db}',
    defaultPort:      5000,
    defaultUser:      'sa',
    defaultPassword:  '',
    driverClass:      'com.sybase.jdbc4.jdbc.SybDriver',
    label:            'Sybase ASE',
  },
  hana: {
    jarPrefix:        'ngdbc',
    jdbcUrlTemplate:  'jdbc:sap://{host}:{port}',
    defaultPort:      30015,
    defaultUser:      'SYSTEM',
    defaultPassword:  'manager',
    driverClass:      'com.sap.db.jdbc.Driver',
    label:            'SAP HANA',
  },
};

/**
 * Check if a dialect has a JDBC bridge entry.
 */
export function hasJdbcDriver(dialect: DialectType): boolean {
  return dialect in JDBC_REGISTRY;
}

/**
 * Get JDBC driver info for a dialect. Returns undefined if not bridge-eligible.
 */
export function getJdbcDriverInfo(dialect: DialectType): JdbcDriverInfo | undefined {
  return JDBC_REGISTRY[dialect];
}

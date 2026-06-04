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
export declare const JDBC_REGISTRY: Partial<Record<DialectType, JdbcDriverInfo>>;
/**
 * Check if a dialect has a JDBC bridge entry.
 */
export declare function hasJdbcDriver(dialect: DialectType): boolean;
/**
 * Get JDBC driver info for a dialect. Returns undefined if not bridge-eligible.
 */
export declare function getJdbcDriverInfo(dialect: DialectType): JdbcDriverInfo | undefined;

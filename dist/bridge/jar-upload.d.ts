import { type JdbcDriverInfo } from './jdbc-registry.js';
import type { DialectType } from '../core/types.js';
export interface JarUploadResult {
    ok: boolean;
    fileName?: string;
    dialect?: string;
    jarDir?: string;
    replaced?: string;
    error?: string;
}
/**
 * Detect which dialect a JAR file belongs to based on its filename.
 */
export declare function detectDialectFromJar(fileName: string): {
    dialect: DialectType;
    info: JdbcDriverInfo;
} | null;
/**
 * List all JAR files currently in the jar_files directory.
 */
export declare function listJarFiles(): {
    fileName: string;
    dialect: string | null;
    label: string | null;
}[];
/**
 * Save an uploaded JAR file to the jar_files directory.
 * If a JAR for the same dialect already exists, it is replaced.
 *
 * @param fileName - Original filename (e.g. "hsqldb-2.7.2.jar")
 * @param data - File content as Buffer or Uint8Array
 */
export declare function saveJarFile(fileName: string, data: Buffer | Uint8Array): JarUploadResult;
/**
 * Delete a JAR file from the jar_files directory.
 */
export declare function deleteJarFile(fileName: string): JarUploadResult;
/**
 * Get the list of JDBC-eligible dialects with their JAR status.
 */
export declare function getJdbcDialectStatus(): {
    dialect: DialectType;
    label: string;
    jarPrefix: string;
    hasJar: boolean;
    jarFile: string | null;
}[];

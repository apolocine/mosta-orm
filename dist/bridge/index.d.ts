export { JdbcNormalizer, parseUri } from './JdbcNormalizer.js';
export { JDBC_REGISTRY, hasJdbcDriver, getJdbcDriverInfo } from './jdbc-registry.js';
export { BridgeManager } from './BridgeManager.js';
export { saveJarFile, deleteJarFile, listJarFiles, detectDialectFromJar, getJdbcDialectStatus, } from './jar-upload.js';
export type { BridgeInstance } from './BridgeManager.js';
export type { JarUploadResult } from './jar-upload.js';
export type { JdbcDriverInfo } from './jdbc-registry.js';
export type { JdbcBridgeConfig } from './JdbcNormalizer.js';

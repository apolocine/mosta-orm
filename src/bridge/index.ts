// @mostajs/orm/bridge — JDBC bridge public API
// Author: Dr Hamid MADANI drmdh@msn.com
//
// Imported via the `./bridge` subpath so these symbols (which pull in
// `child_process`, `fs`, and spawn Java) are NEVER traced by bundlers
// when an app imports only `@mostajs/orm`.
//
// Usage :
//   import { JdbcNormalizer, parseUri, BridgeManager } from '@mostajs/orm/bridge'

export { JdbcNormalizer, parseUri } from './JdbcNormalizer.js';
export { JDBC_REGISTRY, hasJdbcDriver, getJdbcDriverInfo } from './jdbc-registry.js';
export { BridgeManager } from './BridgeManager.js';
export {
  saveJarFile,
  deleteJarFile,
  listJarFiles,
  detectDialectFromJar,
  getJdbcDialectStatus,
} from './jar-upload.js';

export type { BridgeInstance } from './BridgeManager.js';
export type { JarUploadResult } from './jar-upload.js';
export type { JdbcDriverInfo } from './jdbc-registry.js';
export type { JdbcBridgeConfig } from './JdbcNormalizer.js';

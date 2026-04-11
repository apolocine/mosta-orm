// MostaORM — Hibernate-inspired multi-dialect ORM for Node.js/TypeScript
// Author: Dr Hamid MADANI drmdh@msn.com

// ============================================================
// Types
// ============================================================
export type {
  FieldType,
  FieldDef,
  EmbeddedSchemaDef,
  RelationType,
  RelationDef,
  CascadeType,
  FetchType,
  OnDeleteAction,
  IndexType,
  IndexDef,
  EntitySchema,
  FilterOperator,
  FilterValue,
  FilterQuery,
  SortDirection,
  QueryOptions,
  PaginatedResult,
  AggregateStage,
  AggregateGroupStage,
  AggregateMatchStage,
  AggregateSortStage,
  AggregateLimitStage,
  AggregateAccumulator,
  DialectType,
  SchemaStrategy,
  ConnectionConfig,
  IDialect,
  IRepository,
  IPlugin,
  HookContext,
  NormalizedDoc,
} from './core/types.js';

// ============================================================
// Config
// ============================================================
export {
  DIALECT_CONFIGS,
  getSupportedDialects,
  getDialectConfig,
} from './core/config.js';
export type { DialectConfig } from './core/config.js';

// ============================================================
// Registry
// ============================================================
export {
  registerSchema,
  registerSchemas,
  getSchema,
  getSchemaByCollection,
  getAllSchemas,
  getEntityNames,
  hasSchema,
  validateSchemas,
  clearRegistry,
} from './core/registry.js';

// ============================================================
// Factory
// ============================================================
export {
  getDialect,
  getConfigFromEnv,
  getCurrentDialectType,
  disconnectDialect,
  testConnection,
  createConnection,
  createIsolatedDialect,
  createDatabase,
  dropDatabase,
  // Named Connection Registry (for Next.js / webpack chunk sharing)
  registerNamedConnection,
  getNamedConnection,
  removeNamedConnection,
  listNamedConnections,
  clearNamedConnections,
} from './core/factory.js';

// ============================================================
// Base Repository
// ============================================================
export { BaseRepository } from './core/base-repository.js';

// ============================================================
// Utils
// ============================================================
export { normalizeDoc, normalizeDocs } from './core/normalizer.js';

// ============================================================
// JDBC Bridge
// ============================================================
export { JdbcNormalizer, parseUri } from './bridge/JdbcNormalizer.js';
export { JDBC_REGISTRY, hasJdbcDriver, getJdbcDriverInfo } from './bridge/jdbc-registry.js';
export { BridgeManager } from './bridge/BridgeManager.js';
export {
  saveJarFile,
  deleteJarFile,
  listJarFiles,
  detectDialectFromJar,
  getJdbcDialectStatus,
} from './bridge/jar-upload.js';
export type { BridgeInstance } from './bridge/BridgeManager.js';
export type { JarUploadResult } from './bridge/jar-upload.js';
export type { JdbcDriverInfo } from './bridge/jdbc-registry.js';
export type { JdbcBridgeConfig } from './bridge/JdbcNormalizer.js';

// ============================================================
// Entity Service (facade CRUD + EventEmitter for @mostajs/net)
// ============================================================
export { EntityService } from './core/entity-service.js';

// ============================================================
// OrmRequest / OrmResponse (canonical format for @mostajs/net)
// ============================================================
export type {
  OrmRequest,
  OrmResponse,
  OrmOperation,
} from './core/orm-request.js';

// ============================================================
// Schema Diff & Migrations
// ============================================================
export { diffSchemas, generateMigrationSQL } from './core/schema-diff.js';
export type { DiffOperation } from './core/schema-diff.js';

// ============================================================
// Errors
// ============================================================
export {
  MostaORMError,
  EntityNotFoundError,
  ConnectionError,
  ValidationError,
  DialectNotFoundError,
} from './core/errors.js';

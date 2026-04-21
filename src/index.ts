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
// Env loader with MOSTA_ENV profile cascade
// Re-exported from @mostajs/config for convenience (since v1.13.0).
// For new code, prefer importing directly from '@mostajs/config'.
// ============================================================
export {
  getEnv,
  getEnvBool,
  getEnvNumber,
  getCurrentProfile,
} from '@mostajs/config';

// ============================================================
// Base Repository
// ============================================================
export { BaseRepository } from './core/base-repository.js';

// ============================================================
// Utils
// ============================================================
export { normalizeDoc, normalizeDocs } from './core/normalizer.js';

// ============================================================
// JDBC Bridge — moved to subpath '@mostajs/orm/bridge' in v1.9.4
// ============================================================
//
// Reason : the JDBC bridge transitively imports `child_process`, `fs` and
// spawns a Java subprocess. Keeping those symbols on the package root
// dragged them into client bundles (Next.js RSC build, Vite SSR, etc.) —
// causing `Can't resolve 'child_process'` in the browser chunk even for
// apps that never touch JDBC.
//
// Migration : use the subpath export. Example :
//   import { JdbcNormalizer, parseUri } from '@mostajs/orm/bridge'
//
// Types are re-exported from the subpath too ; no runtime cost for
// consumers that don't use the bridge.

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

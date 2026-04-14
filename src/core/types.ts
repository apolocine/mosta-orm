// DAL Core Types - Database Abstraction Layer
// Inspired by Hibernate ORM Dialect pattern
// Zero dependency on any specific database driver
// Author: Dr Hamid MADANI drmdh@msn.com

// ============================================================
// Field & Schema Definitions (equivalent @Entity / @Column)
// ============================================================

export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json'
  | 'array';

export interface FieldDef {
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  sparse?: boolean;
  default?: unknown;
  enum?: string[];
  lowercase?: boolean;
  trim?: boolean;
  arrayOf?: FieldType | EmbeddedSchemaDef;
}

/** Embedded sub-document (e.g. Activity.schedule[], SubscriptionPlan.activities[]) */
export interface EmbeddedSchemaDef {
  kind: 'embedded';
  fields: Record<string, FieldDef>;
}

export type RelationType = 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';

/** Cascade operations — equivalent to JPA CascadeType */
export type CascadeType = 'persist' | 'merge' | 'remove' | 'all';

/** Fetch strategy — equivalent to JPA FetchType */
export type FetchType = 'lazy' | 'eager';

/** Referential action on delete — equivalent to SQL ON DELETE */
export type OnDeleteAction = 'cascade' | 'set-null' | 'restrict' | 'no-action';

export interface RelationDef {
  /** Target entity name (e.g. 'User', 'Client') */
  target: string;
  type: RelationType;
  required?: boolean;
  /** Default fields to select when populating/joining */
  select?: string[];
  /** Whether this relation can be null */
  nullable?: boolean;
  /** Junction table name (SQL dialects) — convention: "{source}_{target}" in snake_case */
  through?: string;

  // --- Hibernate-inspired relation options (P1-4) ---

  /**
   * Cascade operations to propagate to related entities.
   * Equivalent to JPA @OneToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
   * WARNING: never use 'remove' or 'all' on many-to-many (would delete the target entity!)
   */
  cascade?: CascadeType[];

  /**
   * Remove orphaned entities when detached from the collection.
   * Equivalent to JPA @OneToMany(orphanRemoval = true)
   * Only supported on one-to-one and one-to-many (not many-to-many, like Hibernate).
   */
  orphanRemoval?: boolean;

  /**
   * Fetch strategy: eager (load immediately) or lazy (load on demand).
   * Equivalent to JPA @ManyToOne(fetch = FetchType.LAZY)
   * Defaults: many-to-one/one-to-one = eager, one-to-many/many-to-many = lazy
   */
  fetch?: FetchType;

  /**
   * Inverse field name on the target entity (bidirectional relation).
   * Equivalent to JPA @OneToMany(mappedBy = "parent")
   * For one-to-many: specifies the FK column name on the child table.
   * Without mappedBy, O2M is unidirectional (Hibernate creates a junction table = anti-pattern).
   */
  mappedBy?: string;

  /**
   * Explicit FK column name on the owning side.
   * Equivalent to JPA @JoinColumn(name = "category_id")
   * Default: relation field name (e.g. 'category' → column 'category')
   */
  joinColumn?: string;

  /**
   * Explicit FK column name on the inverse side of a junction table (M2M only).
   * Equivalent to JPA @JoinTable(inverseJoinColumns = @JoinColumn(name = "course_id"))
   */
  inverseJoinColumn?: string;

  /**
   * Referential action when the referenced entity is deleted.
   * Equivalent to SQL ON DELETE CASCADE / SET NULL / RESTRICT
   * Default: nullable ? 'set-null' : 'restrict'
   */
  onDelete?: OnDeleteAction;
}

export type IndexType = 'asc' | 'desc' | 'text';

export interface IndexDef {
  fields: Record<string, IndexType>;
  unique?: boolean;
  sparse?: boolean;
}

export interface EntitySchema {
  /** Entity name (PascalCase, e.g. 'Client') */
  name: string;
  /** Collection/table name (e.g. 'clients') */
  collection: string;
  /** Field definitions */
  fields: Record<string, FieldDef>;
  /** Relations to other entities */
  relations: Record<string, RelationDef>;
  /** Database indexes */
  indexes: IndexDef[];
  /** Auto-manage createdAt/updatedAt */
  timestamps: boolean;

  // --- Discriminator (single-table inheritance, Drupal-style node._type) ---
  /** Discriminator field name (e.g. '_type'). If set, enables single-table mode. */
  discriminator?: string;
  /** Discriminator value for this entity (e.g. 'article'). Used to filter rows in a shared table. */
  discriminatorValue?: string;

  // --- Soft delete ---
  /** Enable soft delete (adds deletedAt field, auto-filters on find) */
  softDelete?: boolean;
}

// ============================================================
// Query Types (equivalent HQL / Criteria API)
// ============================================================

export interface FilterOperator {
  $eq?: unknown;
  $ne?: unknown;
  $gt?: unknown;
  $gte?: unknown;
  $lt?: unknown;
  $lte?: unknown;
  $in?: unknown[];
  $nin?: unknown[];
  $regex?: string;
  $regexFlags?: string;
  $exists?: boolean;
}

export type FilterValue = unknown | FilterOperator;

export interface FilterQuery {
  [field: string]: FilterValue;
  $or?: FilterQuery[];
  $and?: FilterQuery[];
}

export type SortDirection = 1 | -1;

export interface QueryOptions {
  sort?: Record<string, SortDirection>;
  skip?: number;
  limit?: number;
  /** Fields to include in result (projection) */
  select?: string[];
  /** Fields to exclude from result */
  exclude?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================
// Aggregate Types
// ============================================================

export interface AggregateGroupStage {
  $group: {
    _by: string | null;
    [field: string]: AggregateAccumulator | string | null;
  };
}

export interface AggregateAccumulator {
  $sum?: number | string;
  $count?: true;
  $avg?: string;
  $min?: string;
  $max?: string;
}

export interface AggregateMatchStage {
  $match: FilterQuery;
}

export interface AggregateSortStage {
  $sort: Record<string, SortDirection>;
}

export interface AggregateLimitStage {
  $limit: number;
}

export type AggregateStage =
  | AggregateMatchStage
  | AggregateGroupStage
  | AggregateSortStage
  | AggregateLimitStage;

// ============================================================
// Adapter Interface (equivalent Hibernate Dialect)
// ============================================================

export type DialectType =
  | 'mongodb'
  | 'sqlite'
  | 'postgres'
  | 'mysql'
  | 'mariadb'
  | 'oracle'
  | 'mssql'
  | 'cockroachdb'
  | 'db2'
  | 'hana'
  | 'hsqldb'
  | 'spanner'
  | 'sybase';

/**
 * Schema generation strategy (inspired by hibernate.hbm2ddl.auto)
 *
 *   validate     : validate schema, make no changes (production)
 *   update       : update schema to match entities (dev)
 *   create       : drop and recreate schema on startup
 *   create-drop  : drop schema on shutdown
 *   none         : do nothing
 */
export type SchemaStrategy = 'validate' | 'update' | 'create' | 'create-drop' | 'none';

/**
 * Connection configuration — inspired by Hibernate persistence.xml
 *
 * Equivalent persistence.xml properties :
 *   jakarta.persistence.jdbc.url     → uri
 *   hibernate.dialect                → dialect
 *   hibernate.show_sql               → showSql
 *   hibernate.format_sql             → formatSql
 *   hibernate.highlight_sql          → highlightSql
 *   hibernate.hbm2ddl.auto           → schemaStrategy
 *   hibernate.connection.pool_size   → poolSize
 *   hibernate.cache.use_second_level → cacheEnabled
 *   hibernate.default_batch_fetch_size → batchSize
 */
export interface ConnectionConfig {
  dialect: DialectType;
  uri: string;

  // --- Logging (hibernate.show_sql / hibernate.format_sql / hibernate.highlight_sql) ---
  /** Log generated queries to console (default: false) */
  showSql?: boolean;
  /** Pretty-print logged queries (default: false) */
  formatSql?: boolean;
  /** Colorize SQL keywords in terminal output (default: false) */
  highlightSql?: boolean;

  // --- Schema management (hibernate.hbm2ddl.auto) ---
  /** Schema generation strategy (default: 'none') */
  schemaStrategy?: SchemaStrategy;

  // --- Connection pool (hibernate.connection.pool_size) ---
  /** Max connections in pool (default: dialect-specific) */
  poolSize?: number;

  // --- Cache (hibernate.cache.*) ---
  /** Enable query result caching (default: false) */
  cacheEnabled?: boolean;
  /** Cache TTL in seconds (default: 60) */
  cacheTtlSeconds?: number;

  // --- Performance (hibernate.default_batch_fetch_size) ---
  /** Default batch size for bulk operations (default: 25) */
  batchSize?: number;

  /** Additional dialect-specific options */
  options?: Record<string, unknown>;
}

export interface IDialect {
  readonly dialectType: DialectType;

  // --- Lifecycle ---
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;

  // --- Schema management ---
  initSchema(schemas: EntitySchema[]): Promise<void>;

  // --- CRUD ---
  find<T = Record<string, unknown>>(
    schema: EntitySchema,
    filter: FilterQuery,
    options?: QueryOptions,
  ): Promise<T[]>;

  findOne<T = Record<string, unknown>>(
    schema: EntitySchema,
    filter: FilterQuery,
    options?: QueryOptions,
  ): Promise<T | null>;

  findById<T = Record<string, unknown>>(
    schema: EntitySchema,
    id: string,
    options?: QueryOptions,
  ): Promise<T | null>;

  create<T = Record<string, unknown>>(
    schema: EntitySchema,
    data: Record<string, unknown>,
  ): Promise<T>;

  update<T = Record<string, unknown>>(
    schema: EntitySchema,
    id: string,
    data: Record<string, unknown>,
  ): Promise<T | null>;

  updateMany(
    schema: EntitySchema,
    filter: FilterQuery,
    data: Record<string, unknown>,
  ): Promise<number>;

  delete(
    schema: EntitySchema,
    id: string,
  ): Promise<boolean>;

  deleteMany(
    schema: EntitySchema,
    filter: FilterQuery,
  ): Promise<number>;

  // --- Queries ---
  count(
    schema: EntitySchema,
    filter: FilterQuery,
  ): Promise<number>;

  distinct(
    schema: EntitySchema,
    field: string,
    filter: FilterQuery,
  ): Promise<unknown[]>;

  aggregate<T = Record<string, unknown>>(
    schema: EntitySchema,
    stages: AggregateStage[],
  ): Promise<T[]>;

  // --- Relations (equivalent populate / JOIN) ---
  findWithRelations<T = Record<string, unknown>>(
    schema: EntitySchema,
    filter: FilterQuery,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T[]>;

  findByIdWithRelations<T = Record<string, unknown>>(
    schema: EntitySchema,
    id: string,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T | null>;

  // --- Upsert (equivalent Hibernate saveOrUpdate) ---
  upsert<T = Record<string, unknown>>(
    schema: EntitySchema,
    filter: FilterQuery,
    data: Record<string, unknown>,
  ): Promise<T>;

  // --- Atomic operations ---
  increment(
    schema: EntitySchema,
    id: string,
    field: string,
    amount: number,
  ): Promise<Record<string, unknown>>;

  // --- Array operations (equivalent Hibernate collection management) ---
  addToSet(
    schema: EntitySchema,
    id: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown> | null>;

  pull(
    schema: EntitySchema,
    id: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown> | null>;

  // --- Text search ---
  search<T = Record<string, unknown>>(
    schema: EntitySchema,
    query: string,
    fields: string[],
    options?: QueryOptions,
  ): Promise<T[]>;

  // --- Raw query execution (dialect-agnostic) ---
  /** Execute a raw SELECT query and return rows */
  executeQuery?<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
  /** Execute a raw non-SELECT statement (INSERT, UPDATE, DELETE) */
  executeRun?(sql: string, params: unknown[]): Promise<{ changes: number }>;

  // --- Transactions (ACID) ---
  /**
   * Run `cb` inside a database transaction. On SQL dialects this wraps the
   * callback in `BEGIN` / `COMMIT` (or `ROLLBACK` if the callback throws).
   * On MongoDB, a replica-set session is used. On non-transactional or
   * unsupported dialects, the callback is executed pass-through (non-atomic)
   * and a warning is logged once per process.
   *
   * The callback receives the same dialect instance it was called on, so
   * existing query code keeps working without changes.
   *
   * **Note on pooled SQL dialects** (Postgres, MySQL, MariaDB, MSSQL, …) :
   * without per-dialect client checkout, parallel queries inside the callback
   * may be dispatched on different pool connections. For strict correctness
   * under concurrent load, set `poolSize: 1` on those dialects, or use a
   * dialect that implements a scoped override of this method.
   */
  $transaction?<T>(
    cb: (tx: IDialect) => Promise<T>,
    opts?: { isolation?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' },
  ): Promise<T>;

  // --- Schema management ---
  /** Drop a single table by name */
  dropTable?(tableName: string): Promise<void>;
  /** Drop all tables in the database (dangerous) */
  dropAllTables?(): Promise<void>;
  /** Drop tables for registered schemas + their junction tables */
  dropSchema?(schemas: EntitySchema[]): Promise<string[]>;
  /** Truncate (empty) a single table — keeps structure, deletes data */
  truncateTable?(tableName: string): Promise<void>;
  /** Truncate all registered schema tables — keeps structure, deletes data */
  truncateAll?(schemas: EntitySchema[]): Promise<string[]>;
}

// ============================================================
// Repository Interface (equivalent Spring Data Repository)
// ============================================================

export interface IRepository<T> {
  findAll(filter?: FilterQuery, options?: QueryOptions): Promise<T[]>;
  findOne(filter: FilterQuery, options?: QueryOptions): Promise<T | null>;
  findById(id: string, options?: QueryOptions): Promise<T | null>;
  findByIdWithRelations(id: string, relations?: string[], options?: QueryOptions): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | null>;
  updateMany(filter: FilterQuery, data: Partial<T>): Promise<number>;
  delete(id: string): Promise<boolean>;
  deleteMany(filter: FilterQuery): Promise<number>;
  count(filter?: FilterQuery): Promise<number>;
  search(query: string, options?: QueryOptions): Promise<T[]>;
  distinct(field: string, filter?: FilterQuery): Promise<unknown[]>;
  aggregate<R = Record<string, unknown>>(stages: AggregateStage[]): Promise<R[]>;
  upsert(filter: FilterQuery, data: Partial<T>): Promise<T>;
  increment(id: string, field: string, amount: number): Promise<T | null>;
  addToSet(id: string, field: string, value: unknown): Promise<T | null>;
  pull(id: string, field: string, value: unknown): Promise<T | null>;
  findWithRelations(
    filter: FilterQuery,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T[]>;
}

// ============================================================
// Plugin Interface
// ============================================================

export interface HookContext {
  entity: EntitySchema;
  dialect: DialectType;
  operation: 'create' | 'update' | 'delete' | 'find';
  userId?: string;
}

export interface IPlugin {
  name: string;
  /** Modify the schema at boot time (add fields, indexes...) */
  onSchemaInit?(schema: EntitySchema): EntitySchema;
  /** Before insert */
  preSave?(doc: Record<string, unknown>, ctx: HookContext): Promise<Record<string, unknown>> | Record<string, unknown>;
  /** After insert */
  postSave?(doc: Record<string, unknown>, ctx: HookContext): Promise<void> | void;
  /** Before update */
  preUpdate?(id: string, data: Record<string, unknown>, ctx: HookContext): Promise<Record<string, unknown>> | Record<string, unknown>;
  /** After update */
  postUpdate?(doc: Record<string, unknown>, ctx: HookContext): Promise<void> | void;
  /** Before delete */
  preDelete?(id: string, ctx: HookContext): Promise<void> | void;
  /** Transform queries (e.g. soft-delete auto-filter) */
  onQuery?(filter: FilterQuery, ctx: HookContext): FilterQuery;
  /** Transform results (e.g. normalization) */
  onResult?(doc: Record<string, unknown>, ctx: HookContext): Record<string, unknown>;
}

// ============================================================
// Utility Types
// ============================================================

/** Normalized document: id (string) instead of _id */
export interface NormalizedDoc {
  id: string;
  [key: string]: unknown;
}

// Abstract SQL Dialect — base class for all SQL dialects
// Inspired by org.hibernate.dialect.Dialect (Hibernate ORM 6.4)
// Extracts ~80% of shared SQL logic from sqlite.dialect.ts
// Includes JDBC bridge support via JdbcNormalizer (transparent interception)
// Author: Dr Hamid MADANI drmdh@msn.com

import { randomUUID } from 'crypto';
import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  EntitySchema,
  FieldDef,
  FilterQuery as DALFilter,
  FilterOperator,
  QueryOptions,
  AggregateStage,
  AggregateGroupStage,
} from '../core/types.js';
import { JdbcNormalizer } from '../bridge/JdbcNormalizer.js';
import { hasJdbcDriver } from '../bridge/jdbc-registry.js';
import { BridgeManager, type BridgeInstance } from '../bridge/BridgeManager.js';

// ============================================================
// SQL Logging — inspired by hibernate.show_sql / hibernate.format_sql
// ============================================================

function logQuery(dialect: string, showSql: boolean, formatSql: boolean, operation: string, table: string, details?: unknown): void {
  if (!showSql) return;
  const prefix = `[DAL:${dialect}] ${operation} ${table}`;
  if (formatSql && details) {
    console.log(prefix);
    console.log(JSON.stringify(details, null, 2));
  } else if (details) {
    console.log(`${prefix} ${JSON.stringify(details)}`);
  } else {
    console.log(prefix);
  }
}

// ============================================================
// Utility — safe JSON parse
// ============================================================

function parseJsonSafe(val: unknown, fallback: unknown): unknown {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

/**
 * Convert basic regex patterns to SQL LIKE patterns.
 * Handles common cases: ^prefix, suffix$, .*contains.*
 */
function regexToLike(regex: string): string {
  let pattern = regex;
  const hasStart = pattern.startsWith('^');
  const hasEnd = pattern.endsWith('$');
  pattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
  pattern = pattern.replace(/\.\*/g, '%');
  pattern = pattern.replace(/\./g, '_');
  if (!hasStart) pattern = `%${pattern}`;
  if (!hasEnd) pattern = `${pattern}%`;
  return pattern;
}

// ============================================================
// WhereClause interface
// ============================================================

interface WhereClause {
  sql: string;
  params: unknown[];
}

// ============================================================
// AbstractSqlDialect — base for all SQL dialects
// ============================================================

export abstract class AbstractSqlDialect implements IDialect {
  // --- Abstract members (each dialect must implement) ---

  abstract readonly dialectType: DialectType;

  /** Quote an identifier (column/table name) for this dialect */
  abstract quoteIdentifier(name: string): string;

  /** Get the parameter placeholder for index (1-based). E.g. $1, ?, :1, @p1 */
  abstract getPlaceholder(index: number): string;

  /** Map a DAL FieldDef to the native SQL column type */
  abstract fieldToSqlType(field: FieldDef): string;

  /** Get the SQL column type for the primary key (id) column */
  abstract getIdColumnType(): string;

  /** Execute a SELECT query via the dialect's native driver (npm) */
  abstract doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;

  /** Execute a non-SELECT statement via the dialect's native driver (npm) */
  abstract doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }>;

  // --- Concrete query methods with JDBC bridge interception ---

  /** Execute a SELECT query — routes to JDBC bridge or native driver */
  async executeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (this.jdbcBridgeActive) return this.bridgeExecuteQuery<T>(sql, params);
    return this.doExecuteQuery<T>(sql, params);
  }

  /** Execute a non-SELECT statement — routes to JDBC bridge or native driver */
  async executeRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (this.jdbcBridgeActive) return this.bridgeExecuteRun(sql, params);
    return this.doExecuteRun(sql, params);
  }

  /** Establish the actual database connection */
  abstract doConnect(config: ConnectionConfig): Promise<void>;

  /** Close the actual database connection */
  abstract doDisconnect(): Promise<void>;

  /** Test the connection is alive */
  abstract doTestConnection(): Promise<boolean>;

  /** Return a SQL query that lists table names. Result rows must have a 'name' column. */
  abstract getTableListQuery(): string;

  // --- Protected state ---

  protected config: ConnectionConfig | null = null;
  protected schemas: EntitySchema[] = [];
  protected showSql = false;
  protected formatSql = false;
  private paramCounter = 0;

  // --- JDBC Bridge state (transparent interception) ---
  private bridgeInstance: BridgeInstance | null = null;
  private jdbcBridgeActive = false;

  // --- Hooks (overridable by subclasses) ---

  /** Whether this dialect supports CREATE TABLE IF NOT EXISTS */
  protected supportsIfNotExists(): boolean { return true; }

  /** Whether this dialect supports RETURNING clause on INSERT */
  protected supportsReturning(): boolean { return false; }

  /** Serialize a JS boolean to a DB value (default: 1/0) */
  protected serializeBoolean(v: boolean): unknown { return v ? 1 : 0; }

  /** Deserialize a DB value to a JS boolean */
  protected deserializeBoolean(v: unknown): boolean { return v === 1 || v === true || v === '1'; }

  /** Build the LIMIT/OFFSET clause (dialect-specific override) */
  protected buildLimitOffset(options?: QueryOptions): string {
    let sql = '';
    if (options?.limit) sql += ` LIMIT ${options.limit}`;
    if (options?.skip) sql += ` OFFSET ${options.skip}`;
    return sql;
  }

  /** Get the CREATE TABLE prefix, including IF NOT EXISTS when supported */
  protected getCreateTablePrefix(tableName: string): string {
    const q = this.quoteIdentifier(tableName);
    return this.supportsIfNotExists()
      ? `CREATE TABLE IF NOT EXISTS ${q}`
      : `CREATE TABLE ${q}`;
  }

  /** Get the CREATE INDEX prefix, including IF NOT EXISTS when supported */
  protected getCreateIndexPrefix(indexName: string, unique: boolean): string {
    const u = unique ? 'UNIQUE ' : '';
    const q = this.quoteIdentifier(indexName);
    return this.supportsIfNotExists()
      ? `CREATE ${u}INDEX IF NOT EXISTS ${q}`
      : `CREATE ${u}INDEX ${q}`;
  }

  /** Serialize date values to a format suitable for this dialect */
  protected serializeDate(value: unknown): unknown {
    let d: Date | null = null;
    if (value === 'now') d = new Date();
    else if (value instanceof Date) d = value;
    else if (typeof value === 'string') {
      // If going through JDBC bridge, normalize ISO strings to JDBC format
      if (this.jdbcBridgeActive) {
        d = new Date(value);
        if (isNaN(d.getTime())) return value;
      } else {
        return value;
      }
    }
    if (!d) return null;
    // JDBC dialects need 'yyyy-MM-dd HH:mm:ss' format (no T, no Z)
    if (this.jdbcBridgeActive) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0') + ':' +
        String(d.getSeconds()).padStart(2, '0');
    }
    return d.toISOString();
  }

  /** Serialize JSON/array values */
  protected serializeJson(value: unknown): unknown {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  /**
   * Build a regex/LIKE condition. Override for case-sensitive dialects.
   * Default: LIKE (case-insensitive in MySQL, SQLite, MSSQL; case-sensitive in Postgres, Oracle, DB2, HANA).
   * Postgres overrides to use ILIKE when flags contain 'i'.
   */
  protected buildRegexCondition(col: string, flags?: string): string {
    // Default: just use LIKE — subclasses override for case-insensitive support
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  /** Dialect label for logging */
  protected getDialectLabel(): string {
    return this.dialectType.charAt(0).toUpperCase() + this.dialectType.slice(1);
  }

  // --- Logging helper ---

  protected log(operation: string, table: string, details?: unknown): void {
    logQuery(this.getDialectLabel(), this.showSql, this.formatSql, operation, table, details);
  }

  // --- Placeholder counter management ---

  /** Reset the parameter counter (call before building a new statement) */
  protected resetParams(): void {
    this.paramCounter = 0;
  }

  /** Get the next placeholder and increment the counter */
  protected nextPlaceholder(): string {
    this.paramCounter++;
    return this.getPlaceholder(this.paramCounter);
  }

  // ============================================================
  // Value Serialization / Deserialization
  // ============================================================

  protected serializeValue(value: unknown, field?: FieldDef): unknown {
    if (value === undefined || value === null) return null;
    if (field?.type === 'boolean' || typeof value === 'boolean') {
      return this.serializeBoolean(value as boolean);
    }
    if (field?.type === 'date' || value instanceof Date) {
      return this.serializeDate(value);
    }
    if (field?.type === 'json' || field?.type === 'array') {
      return this.serializeJson(value);
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return value;
  }

  protected deserializeRow(row: Record<string, unknown>, schema: EntitySchema): Record<string, unknown> {
    if (!row) return row;
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(row)) {
      if (key === 'id') {
        result.id = val;
        continue;
      }

      const fieldDef = schema.fields[key];
      const relDef = schema.relations[key];

      if (fieldDef) {
        result[key] = this.deserializeField(val, fieldDef);
      } else if (relDef) {
        if (relDef.type === 'many-to-many') {
          result[key] = [];
          continue;
        }
        if (relDef.type === 'one-to-many') {
          result[key] = parseJsonSafe(val as string, []);
        } else {
          result[key] = val;
        }
      } else if (key === 'createdAt' || key === 'updatedAt') {
        result[key] = val;
      } else {
        result[key] = val;
      }
    }

    // Ensure many-to-many relations default to []
    for (const [relName, relDef] of Object.entries(schema.relations)) {
      if (relDef.type === 'many-to-many' && !(relName in result)) {
        result[relName] = [];
      }
    }

    return result;
  }

  protected deserializeField(val: unknown, field: FieldDef): unknown {
    if (val === null || val === undefined) return val;

    switch (field.type) {
      case 'boolean':
        return this.deserializeBoolean(val);
      case 'date':
        return val;
      case 'json':
        return parseJsonSafe(val as string, val);
      case 'array':
        return parseJsonSafe(val as string, []);
      case 'number':
        return val;
      default:
        return val;
    }
  }

  // ============================================================
  // Filter Translation — DAL FilterQuery → SQL WHERE clause
  // ============================================================

  protected translateFilter(filter: DALFilter, schema: EntitySchema): WhereClause {
    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === '$or' && Array.isArray(value)) {
        const orClauses = (value as DALFilter[]).map(f => this.translateFilter(f, schema));
        if (orClauses.length > 0) {
          const orSql = orClauses.map(c => `(${c.sql})`).join(' OR ');
          conditions.push(`(${orSql})`);
          for (const c of orClauses) params.push(...c.params);
        }
        continue;
      }

      if (key === '$and' && Array.isArray(value)) {
        const andClauses = (value as DALFilter[]).map(f => this.translateFilter(f, schema));
        if (andClauses.length > 0) {
          const andSql = andClauses.map(c => `(${c.sql})`).join(' AND ');
          conditions.push(`(${andSql})`);
          for (const c of andClauses) params.push(...c.params);
        }
        continue;
      }

      const col = this.quoteIdentifier(key);

      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        const op = value as FilterOperator;

        if ('$eq' in op) {
          if (op.$eq === null) { conditions.push(`${col} IS NULL`); }
          else { conditions.push(`${col} = ${this.nextPlaceholder()}`); params.push(this.serializeForFilter(op.$eq, key, schema)); }
        }
        if ('$ne' in op) {
          if (op.$ne === null) { conditions.push(`${col} IS NOT NULL`); }
          else { conditions.push(`${col} != ${this.nextPlaceholder()}`); params.push(this.serializeForFilter(op.$ne, key, schema)); }
        }
        if ('$gt' in op) { conditions.push(`${col} > ${this.nextPlaceholder()}`); params.push(this.serializeForFilter(op.$gt, key, schema)); }
        if ('$gte' in op) { conditions.push(`${col} >= ${this.nextPlaceholder()}`); params.push(this.serializeForFilter(op.$gte, key, schema)); }
        if ('$lt' in op) { conditions.push(`${col} < ${this.nextPlaceholder()}`); params.push(this.serializeForFilter(op.$lt, key, schema)); }
        if ('$lte' in op) { conditions.push(`${col} <= ${this.nextPlaceholder()}`); params.push(this.serializeForFilter(op.$lte, key, schema)); }
        if ('$in' in op && Array.isArray(op.$in)) {
          const placeholders = op.$in.map(() => this.nextPlaceholder()).join(', ');
          conditions.push(`${col} IN (${placeholders})`);
          for (const v of op.$in) params.push(this.serializeForFilter(v, key, schema));
        }
        if ('$nin' in op && Array.isArray(op.$nin)) {
          const placeholders = op.$nin.map(() => this.nextPlaceholder()).join(', ');
          conditions.push(`${col} NOT IN (${placeholders})`);
          for (const v of op.$nin) params.push(this.serializeForFilter(v, key, schema));
        }
        if ('$regex' in op) {
          const pattern = regexToLike(op.$regex as string);
          const flags = (op as Record<string, unknown>).$regexFlags as string | undefined;
          conditions.push(this.buildRegexCondition(col, flags));
          params.push(pattern);
        }
        if ('$exists' in op) {
          if (op.$exists) {
            conditions.push(`${col} IS NOT NULL`);
          } else {
            conditions.push(`${col} IS NULL`);
          }
        }
      } else {
        if (value === null) {
          conditions.push(`${col} IS NULL`);
        } else {
          conditions.push(`${col} = ${this.nextPlaceholder()}`);
          params.push(this.serializeForFilter(value, key, schema));
        }
      }
    }

    return {
      sql: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
      params,
    };
  }

  protected serializeForFilter(value: unknown, fieldName: string, schema: EntitySchema): unknown {
    const field = schema.fields[fieldName];
    if (field) return this.serializeValue(value, field);
    if (typeof value === 'boolean') return this.serializeBoolean(value);
    if (value instanceof Date) return this.serializeDate(value);
    return value;
  }

  // ============================================================
  // Query Building Helpers
  // ============================================================

  protected buildSelectColumns(schema: EntitySchema, options?: QueryOptions): string {
    if (options?.select && options.select.length > 0) {
      const cols = ['id', ...options.select.filter(f => f !== 'id')];
      return cols.map(c => this.quoteIdentifier(c)).join(', ');
    }
    if (options?.exclude && options.exclude.length > 0) {
      const allCols = this.getAllColumns(schema);
      const filtered = allCols.filter(c => !options.exclude!.includes(c));
      return filtered.map(c => this.quoteIdentifier(c)).join(', ');
    }
    return '*';
  }

  protected getAllColumns(schema: EntitySchema): string[] {
    const cols = ['id'];
    cols.push(...Object.keys(schema.fields));
    for (const [name, rel] of Object.entries(schema.relations)) {
      if (rel.type !== 'many-to-many') {
        cols.push(name);
      }
    }
    if (schema.timestamps) {
      cols.push('createdAt', 'updatedAt');
    }
    return cols;
  }

  protected buildOrderBy(options?: QueryOptions): string {
    if (!options?.sort) return '';
    const clauses = Object.entries(options.sort)
      .map(([field, dir]) => `${this.quoteIdentifier(field)} ${dir === -1 ? 'DESC' : 'ASC'}`);
    return clauses.length > 0 ? ` ORDER BY ${clauses.join(', ')}` : '';
  }

  // ============================================================
  // Data Preparation — EntitySchema + data → columns/values
  // ============================================================

  protected prepareInsertData(
    schema: EntitySchema,
    data: Record<string, unknown>,
  ): { columns: string[]; placeholders: string[]; values: unknown[] } {
    const columns: string[] = ['id'];
    const placeholders: string[] = [this.nextPlaceholder()];
    const id = (data.id as string) || randomUUID();
    const values: unknown[] = [id];

    for (const [name, field] of Object.entries(schema.fields)) {
      if (name in data) {
        columns.push(name);
        placeholders.push(this.nextPlaceholder());
        values.push(this.serializeValue(data[name], field));
      } else if (field.default !== undefined) {
        columns.push(name);
        placeholders.push(this.nextPlaceholder());
        const def = field.default === 'now' ? this.serializeDate('now') : field.default;
        values.push(this.serializeValue(def, field));
      }
    }

    for (const [name, rel] of Object.entries(schema.relations)) {
      if (rel.type === 'many-to-many') continue;
      if (name in data) {
        columns.push(name);
        placeholders.push(this.nextPlaceholder());
        if (rel.type === 'one-to-many') {
          values.push(JSON.stringify(data[name] ?? []));
        } else {
          // Empty string → null for FK columns (avoids FOREIGN KEY constraint failures)
          values.push(data[name] || null);
        }
      } else if (rel.type === 'one-to-many') {
        columns.push(name);
        placeholders.push(this.nextPlaceholder());
        values.push('[]');
      }
    }

    if (schema.timestamps) {
      const now = this.serializeDate('now');
      if (!columns.includes('createdAt')) {
        columns.push('createdAt');
        placeholders.push(this.nextPlaceholder());
        values.push(now);
      }
      if (!columns.includes('updatedAt')) {
        columns.push('updatedAt');
        placeholders.push(this.nextPlaceholder());
        values.push(now);
      }
    }

    return { columns, placeholders, values };
  }

  protected prepareUpdateData(
    schema: EntitySchema,
    data: Record<string, unknown>,
  ): { setClauses: string[]; values: unknown[] } {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(data)) {
      if (key === 'id' || key === '_id') continue;

      const field = schema.fields[key];
      const rel = schema.relations[key];

      if (field) {
        setClauses.push(`${this.quoteIdentifier(key)} = ${this.nextPlaceholder()}`);
        values.push(this.serializeValue(val, field));
      } else if (rel) {
        if (rel.type === 'many-to-many') continue;
        setClauses.push(`${this.quoteIdentifier(key)} = ${this.nextPlaceholder()}`);
        if (rel.type === 'one-to-many') {
          values.push(JSON.stringify(val ?? []));
        } else {
          // Empty string → null for FK columns (avoids FOREIGN KEY constraint failures)
          values.push(val || null);
        }
      } else if (key === 'createdAt' || key === 'updatedAt') {
        setClauses.push(`${this.quoteIdentifier(key)} = ${this.nextPlaceholder()}`);
        values.push(this.serializeDate(val));
      }
    }

    // Auto-update updatedAt
    if (schema.timestamps && !setClauses.some(c => c.includes(this.quoteIdentifier('updatedAt')))) {
      setClauses.push(`${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`);
      values.push(this.serializeDate('now'));
    }

    return { setClauses, values };
  }

  // ============================================================
  // DDL Generation — EntitySchema → CREATE TABLE
  // ============================================================

  protected generateCreateTable(schema: EntitySchema): string {
    const q = (name: string) => this.quoteIdentifier(name);
    const cols: string[] = [`  ${q('id')} ${this.getIdColumnType()} PRIMARY KEY`];

    for (const [name, field] of Object.entries(schema.fields)) {
      let colDef = `  ${q(name)} ${this.fieldToSqlType(field)}`;
      // DEFAULT must come before NOT NULL for HSQLDB compatibility
      if (field.default !== undefined && field.default !== 'now' && field.default !== null) {
        const defVal = this.serializeValue(field.default, field);
        if (typeof defVal === 'string') colDef += ` DEFAULT '${defVal.replace(/'/g, "''")}'`;
        else if (typeof defVal === 'number') colDef += ` DEFAULT ${defVal}`;
      }
      if (field.required) colDef += ' NOT NULL';
      if (field.unique) colDef += ' UNIQUE';
      cols.push(colDef);
    }

    for (const [name, rel] of Object.entries(schema.relations)) {
      if (rel.type === 'many-to-many') continue;
      if (rel.type === 'one-to-many') {
        cols.push(`  ${q(name)} ${this.fieldToSqlType({ type: 'json' })} DEFAULT '[]'`);
      } else {
        let colDef = `  ${q(name)} ${this.getIdColumnType()}`;
        if (rel.required) colDef += ' NOT NULL';
        cols.push(colDef);
      }
    }

    if (schema.timestamps) {
      cols.push(`  ${q('createdAt')} ${this.fieldToSqlType({ type: 'date' })}`);
      cols.push(`  ${q('updatedAt')} ${this.fieldToSqlType({ type: 'date' })}`);
    }

    return `${this.getCreateTablePrefix(schema.collection)} (\n${cols.join(',\n')}\n)`;
  }

  protected generateIndexes(schema: EntitySchema): string[] {
    const statements: string[] = [];

    for (let i = 0; i < schema.indexes.length; i++) {
      const idx = schema.indexes[i];
      const fields = Object.entries(idx.fields);

      // Skip text indexes
      if (fields.some(([, dir]) => dir === 'text')) continue;

      const idxName = `idx_${schema.collection}_${i}`;
      const colDefs = fields.map(([f, dir]) => `${this.quoteIdentifier(f)} ${dir === 'desc' ? 'DESC' : 'ASC'}`);
      statements.push(
        `${this.getCreateIndexPrefix(idxName, idx.unique ?? false)} ON ${this.quoteIdentifier(schema.collection)} (${colDefs.join(', ')})`
      );
    }

    return statements;
  }

  // ============================================================
  // IDialect Implementation — Lifecycle
  // ============================================================

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config;
    this.showSql = config.showSql ?? false;
    this.formatSql = config.formatSql ?? false;

    // --- JDBC Bridge interception via BridgeManager ---
    // If a JDBC JAR is available for this dialect, use the bridge
    // instead of calling the dialect's doConnect() (npm driver).
    // BridgeManager handles multi-bridge, port management, PID files, autostart.
    const jarDir = config.options?.jarDir as string | undefined;
    if (hasJdbcDriver(this.dialectType) && JdbcNormalizer.isAvailable(this.dialectType, jarDir)) {
      const manager = BridgeManager.getInstance();
      this.bridgeInstance = await manager.getOrCreate(this.dialectType, config.uri, {
        jarDir,
        bridgeJavaFile: config.options?.bridgeJavaFile as string | undefined,
      });
      this.jdbcBridgeActive = true;
      this.log('CONNECT', `${config.uri} [via JDBC bridge on port ${this.bridgeInstance.port}]`);
    } else {
      // No JAR found — use the dialect's native npm driver
      await this.doConnect(config);
      this.log('CONNECT', config.uri);
    }

    if (config.schemaStrategy === 'create') {
      this.log('SCHEMA', 'create — dropping existing tables');
      await this.dropAllTables();
    }
  }

  async disconnect(): Promise<void> {
    if (this.config?.schemaStrategy === 'create-drop') {
      this.log('SCHEMA', 'create-drop — dropping all tables on shutdown');
      await this.dropAllTables();
    }

    if (this.jdbcBridgeActive && this.bridgeInstance) {
      // Do NOT stop the bridge — BridgeManager manages its lifecycle.
      // Other dialect instances may reuse the same bridge.
      // Bridges are stopped by BridgeManager.stopAll() on app exit.
      this.bridgeInstance = null;
      this.jdbcBridgeActive = false;
    } else {
      await this.doDisconnect();
    }

    this.config = null;
    this.schemas = [];
    this.log('DISCONNECT', '');
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.jdbcBridgeActive && this.bridgeInstance) {
        // Use dialect-appropriate ping query
        const pingQuery = this.dialectType === 'hsqldb'
          ? 'SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS'
          : this.dialectType === 'oracle'
            ? 'SELECT 1 FROM DUAL'
            : 'SELECT 1';
        const result = await this.bridgeInstance.normalizer.query<unknown[]>(pingQuery, []);
        return Array.isArray(result);
      }
      return await this.doTestConnection();
    } catch (err) {
      console.error(`[${this.dialectType}] testConnection failed:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  // --- JDBC Bridge query methods (used by executeQuery/executeRun interception) ---

  /**
   * Execute a SELECT query via the JDBC bridge.
   * Called transparently when jdbcBridgeActive is true.
   */
  protected async bridgeExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.bridgeInstance) throw new Error('JDBC bridge not initialized');
    return this.bridgeInstance.normalizer.query<T[]>(sql, params);
  }

  /**
   * Execute a non-SELECT statement via the JDBC bridge.
   * Called transparently when jdbcBridgeActive is true.
   */
  protected async bridgeExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.bridgeInstance) throw new Error('JDBC bridge not initialized');
    const result = await this.bridgeInstance.normalizer.query<{ changes?: number }>(sql, params);
    return { changes: (result as { changes?: number })?.changes ?? 0 };
  }

  /** Whether the JDBC bridge is active for this dialect instance */
  protected get isJdbcBridgeActive(): boolean {
    return this.jdbcBridgeActive;
  }

  // --- Schema management (hibernate.hbm2ddl.auto) ---

  async initSchema(schemas: EntitySchema[]): Promise<void> {
    this.schemas = schemas;
    const strategy = this.config?.schemaStrategy ?? 'none';
    this.log('INIT_SCHEMA', `strategy=${strategy}`, { entities: schemas.map(s => s.name) });

    if (strategy === 'none') return;

    if (strategy === 'validate') {
      for (const schema of schemas) {
        const exists = await this.tableExists(schema.collection);
        if (!exists) {
          throw new Error(
            `Schema validation failed: table "${schema.collection}" does not exist ` +
            `(entity: ${schema.name}). Set schemaStrategy to "update" or "create".`
          );
        }
      }
      return;
    }

    // strategy: 'update' or 'create'
    for (const schema of schemas) {
      const createSql = this.generateCreateTable(schema);
      this.log('DDL', schema.collection, createSql);
      await this.executeRun(createSql, []);

      const indexStatements = this.generateIndexes(schema);
      for (const stmt of indexStatements) {
        await this.executeRun(stmt, []);
      }
    }

    // Create junction tables for many-to-many relations
    for (const schema of schemas) {
      for (const [, rel] of Object.entries(schema.relations)) {
        if (rel.type === 'many-to-many' && rel.through) {
          const targetSchema = schemas.find(s => s.name === rel.target);
          if (!targetSchema) continue;
          const sourceKey = `${schema.name.toLowerCase()}Id`;
          const targetKey = `${rel.target.toLowerCase()}Id`;
          const q = (n: string) => this.quoteIdentifier(n);
          const idType = this.getIdColumnType();
          const ddl = `${this.getCreateTablePrefix(rel.through)} (
  ${q(sourceKey)} ${idType} NOT NULL,
  ${q(targetKey)} ${idType} NOT NULL,
  PRIMARY KEY (${q(sourceKey)}, ${q(targetKey)})
)`;
          this.log('DDL_JUNCTION', rel.through, ddl);
          await this.executeRun(ddl, []);
        }
      }
    }
  }

  // ============================================================
  // IDialect Implementation — CRUD
  // ============================================================

  async find<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T[]> {
    this.resetParams();
    const where = this.translateFilter(filter, schema);
    const cols = this.buildSelectColumns(schema, options);
    const orderBy = this.buildOrderBy(options);
    const limitOffset = this.buildLimitOffset(options);
    const table = this.quoteIdentifier(schema.collection);

    const sql = `SELECT ${cols} FROM ${table} WHERE ${where.sql}${orderBy}${limitOffset}`;
    this.log('FIND', schema.collection, { sql, params: where.params });

    const rows = await this.executeQuery<Record<string, unknown>>(sql, where.params);
    return rows.map(row => this.deserializeRow(row, schema) as T);
  }

  async findOne<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T | null> {
    const results = await this.find<T>(schema, filter, { ...options, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async findById<T>(schema: EntitySchema, id: string, options?: QueryOptions): Promise<T | null> {
    this.resetParams();
    const cols = this.buildSelectColumns(schema, options);
    const table = this.quoteIdentifier(schema.collection);
    const ph = this.nextPlaceholder();

    const sql = `SELECT ${cols} FROM ${table} WHERE ${this.quoteIdentifier('id')} = ${ph}`;
    this.log('FIND_BY_ID', schema.collection, { id });

    const rows = await this.executeQuery<Record<string, unknown>>(sql, [id]);
    return rows.length > 0 ? this.deserializeRow(rows[0], schema) as T : null;
  }

  async create<T>(schema: EntitySchema, data: Record<string, unknown>): Promise<T> {
    this.resetParams();
    const { columns, placeholders, values } = this.prepareInsertData(schema, data);
    const table = this.quoteIdentifier(schema.collection);
    const colsSql = columns.map(c => this.quoteIdentifier(c)).join(', ');

    const sql = `INSERT INTO ${table} (${colsSql}) VALUES (${placeholders.join(', ')})`;
    this.log('CREATE', schema.collection, { sql, values });

    await this.executeRun(sql, values);

    // Insert junction table rows for many-to-many
    const entityId = values[0] as string;
    for (const [relName, rel] of Object.entries(schema.relations)) {
      if (rel.type === 'many-to-many' && rel.through && Array.isArray(data[relName])) {
        const sourceKey = `${schema.name.toLowerCase()}Id`;
        const targetKey = `${rel.target.toLowerCase()}Id`;
        for (const targetId of data[relName] as unknown[]) {
          this.resetParams();
          const p1 = this.nextPlaceholder();
          const p2 = this.nextPlaceholder();
          await this.executeRun(
            `INSERT INTO ${this.quoteIdentifier(rel.through)} (${this.quoteIdentifier(sourceKey)}, ${this.quoteIdentifier(targetKey)}) VALUES (${p1}, ${p2})`,
            [entityId, targetId]
          );
        }
      }
    }

    return this.findById<T>(schema, entityId) as Promise<T>;
  }

  async update<T>(schema: EntitySchema, id: string, data: Record<string, unknown>): Promise<T | null> {
    const existing = await this.findById(schema, id);
    if (!existing) return null;

    this.resetParams();
    const { setClauses, values } = this.prepareUpdateData(schema, data);

    if (setClauses.length > 0) {
      const table = this.quoteIdentifier(schema.collection);
      const ph = this.nextPlaceholder();
      const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${this.quoteIdentifier('id')} = ${ph}`;
      values.push(id);
      this.log('UPDATE', schema.collection, { sql, values });
      await this.executeRun(sql, values);
    }

    // Replace junction table rows for many-to-many
    for (const [relName, rel] of Object.entries(schema.relations)) {
      if (rel.type === 'many-to-many' && rel.through && relName in data) {
        const sourceKey = `${schema.name.toLowerCase()}Id`;
        const targetKey = `${rel.target.toLowerCase()}Id`;
        this.resetParams();
        const delPh = this.nextPlaceholder();
        await this.executeRun(
          `DELETE FROM ${this.quoteIdentifier(rel.through)} WHERE ${this.quoteIdentifier(sourceKey)} = ${delPh}`,
          [id]
        );
        if (Array.isArray(data[relName])) {
          for (const targetId of data[relName] as unknown[]) {
            this.resetParams();
            const p1 = this.nextPlaceholder();
            const p2 = this.nextPlaceholder();
            await this.executeRun(
              `INSERT INTO ${this.quoteIdentifier(rel.through)} (${this.quoteIdentifier(sourceKey)}, ${this.quoteIdentifier(targetKey)}) VALUES (${p1}, ${p2})`,
              [id, targetId]
            );
          }
        }
      }
    }

    return this.findById<T>(schema, id);
  }

  async updateMany(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<number> {
    this.resetParams();
    const { setClauses, values } = this.prepareUpdateData(schema, data);
    if (setClauses.length === 0) return 0;

    // Need fresh param counter for the WHERE clause
    const where = this.translateFilter(filter, schema);
    const table = this.quoteIdentifier(schema.collection);

    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${where.sql}`;
    const allValues = [...values, ...where.params];
    this.log('UPDATE_MANY', schema.collection, { sql, params: allValues });

    const result = await this.executeRun(sql, allValues);
    return result.changes;
  }

  async delete(schema: EntitySchema, id: string): Promise<boolean> {
    this.resetParams();
    const table = this.quoteIdentifier(schema.collection);
    const ph = this.nextPlaceholder();

    const sql = `DELETE FROM ${table} WHERE ${this.quoteIdentifier('id')} = ${ph}`;
    this.log('DELETE', schema.collection, { id });

    const result = await this.executeRun(sql, [id]);
    return result.changes > 0;
  }

  async deleteMany(schema: EntitySchema, filter: DALFilter): Promise<number> {
    this.resetParams();
    const where = this.translateFilter(filter, schema);
    const table = this.quoteIdentifier(schema.collection);

    const sql = `DELETE FROM ${table} WHERE ${where.sql}`;
    this.log('DELETE_MANY', schema.collection, { sql, params: where.params });

    const result = await this.executeRun(sql, where.params);
    return result.changes;
  }

  // ============================================================
  // IDialect Implementation — Queries
  // ============================================================

  async count(schema: EntitySchema, filter: DALFilter): Promise<number> {
    this.resetParams();
    const where = this.translateFilter(filter, schema);
    const table = this.quoteIdentifier(schema.collection);

    const sql = `SELECT COUNT(*) as cnt FROM ${table} WHERE ${where.sql}`;
    this.log('COUNT', schema.collection, { sql, params: where.params });

    const rows = await this.executeQuery<{ cnt: number }>(sql, where.params);
    return rows.length > 0 ? Number(rows[0].cnt) : 0;
  }

  async distinct(schema: EntitySchema, field: string, filter: DALFilter): Promise<unknown[]> {
    this.resetParams();
    const where = this.translateFilter(filter, schema);
    const table = this.quoteIdentifier(schema.collection);

    const sql = `SELECT DISTINCT ${this.quoteIdentifier(field)} FROM ${table} WHERE ${where.sql}`;
    this.log('DISTINCT', schema.collection, { sql, params: where.params });

    const rows = await this.executeQuery<Record<string, unknown>>(sql, where.params);
    return rows.map(r => {
      const val = r[field];
      const fieldDef = schema.fields[field];
      if (fieldDef) return this.deserializeField(val, fieldDef);
      return val;
    });
  }

  async aggregate<T>(schema: EntitySchema, stages: AggregateStage[]): Promise<T[]> {
    this.resetParams();
    let whereClause = '1=1';
    let whereParams: unknown[] = [];
    let groupBy: string | null = null;
    let selectCols: string[] = [];
    let orderBy = '';
    let limit = '';

    for (const stage of stages) {
      if ('$match' in stage) {
        const w = this.translateFilter(stage.$match, schema);
        whereClause = w.sql;
        whereParams = w.params;
      } else if ('$group' in stage) {
        const group = stage as AggregateGroupStage;
        const groupDef = group.$group;
        selectCols = [];

        for (const [key, val] of Object.entries(groupDef)) {
          if (key === '_by') {
            if (val) {
              groupBy = this.quoteIdentifier(val as string);
              selectCols.push(`${groupBy} as ${this.quoteIdentifier('_id')}`);
            } else {
              selectCols.push(`NULL as ${this.quoteIdentifier('_id')}`);
            }
          } else if (val && typeof val === 'object') {
            const acc = val as Record<string, unknown>;
            if ('$sum' in acc) {
              if (typeof acc.$sum === 'string') {
                selectCols.push(`SUM(${this.quoteIdentifier((acc.$sum as string).replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
              } else {
                selectCols.push(`SUM(${acc.$sum}) as ${this.quoteIdentifier(key)}`);
              }
            }
            if ('$count' in acc) {
              selectCols.push(`COUNT(*) as ${this.quoteIdentifier(key)}`);
            }
            if ('$avg' in acc && typeof acc.$avg === 'string') {
              selectCols.push(`AVG(${this.quoteIdentifier(acc.$avg.replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
            }
            if ('$min' in acc && typeof acc.$min === 'string') {
              selectCols.push(`MIN(${this.quoteIdentifier(acc.$min.replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
            }
            if ('$max' in acc && typeof acc.$max === 'string') {
              selectCols.push(`MAX(${this.quoteIdentifier(acc.$max.replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
            }
          }
        }
      } else if ('$sort' in stage) {
        const sortClauses = Object.entries(stage.$sort)
          .map(([f, dir]) => `${this.quoteIdentifier(f)} ${dir === -1 ? 'DESC' : 'ASC'}`);
        orderBy = ` ORDER BY ${sortClauses.join(', ')}`;
      } else if ('$limit' in stage) {
        limit = ` LIMIT ${stage.$limit}`;
      }
    }

    if (selectCols.length === 0) selectCols = ['*'];

    const table = this.quoteIdentifier(schema.collection);
    let sql = `SELECT ${selectCols.join(', ')} FROM ${table} WHERE ${whereClause}`;
    if (groupBy) sql += ` GROUP BY ${groupBy}`;
    sql += orderBy + limit;

    this.log('AGGREGATE', schema.collection, { sql, params: whereParams });
    return this.executeQuery<T>(sql, whereParams);
  }

  // ============================================================
  // IDialect Implementation — Relations (N+1 strategy)
  // ============================================================

  async findWithRelations<T>(
    schema: EntitySchema,
    filter: DALFilter,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T[]> {
    const rows = await this.find<Record<string, unknown>>(schema, filter, options);
    if (rows.length === 0) return [] as T[];

    return Promise.all(
      rows.map(row => this.populateRelations(row, schema, relations))
    ) as Promise<T[]>;
  }

  async findByIdWithRelations<T>(
    schema: EntitySchema,
    id: string,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T | null> {
    const row = await this.findById<Record<string, unknown>>(schema, id, options);
    if (!row) return null;

    return this.populateRelations(row, schema, relations) as Promise<T>;
  }

  private async populateRelations(
    row: Record<string, unknown>,
    schema: EntitySchema,
    relations: string[],
  ): Promise<Record<string, unknown>> {
    const result = { ...row };

    for (const relName of relations) {
      const relDef = schema.relations[relName];
      if (!relDef) continue;

      const targetSchema = this.schemas.find(s => s.name === relDef.target);
      if (!targetSchema) continue;

      const selectOpts: QueryOptions | undefined = relDef.select
        ? { select: relDef.select }
        : undefined;

      if (relDef.type === 'many-to-many' && relDef.through) {
        const sourceKey = `${schema.name.toLowerCase()}Id`;
        const targetKey = `${relDef.target.toLowerCase()}Id`;

        this.resetParams();
        const ph = this.nextPlaceholder();
        const junctionRows = await this.executeQuery<Record<string, string>>(
          `SELECT ${this.quoteIdentifier(targetKey)} FROM ${this.quoteIdentifier(relDef.through)} WHERE ${this.quoteIdentifier(sourceKey)} = ${ph}`,
          [result.id]
        );

        const populated: Record<string, unknown>[] = [];
        for (const jr of junctionRows) {
          const related = await this.findById<Record<string, unknown>>(targetSchema, jr[targetKey], selectOpts);
          if (related) populated.push(related);
        }
        result[relName] = populated;
      } else if (relDef.type === 'one-to-many') {
        const ids = result[relName];
        if (Array.isArray(ids) && ids.length > 0) {
          const populated: Record<string, unknown>[] = [];
          for (const refId of ids) {
            const related = await this.findById<Record<string, unknown>>(targetSchema, String(refId), selectOpts);
            if (related) populated.push(related);
          }
          result[relName] = populated;
        } else {
          result[relName] = [];
        }
      } else {
        const refId = result[relName];
        if (refId) {
          const related = await this.findById<Record<string, unknown>>(targetSchema, String(refId), selectOpts);
          result[relName] = related ?? refId;
        }
      }
    }

    return result;
  }

  // ============================================================
  // IDialect Implementation — Upsert
  // ============================================================

  async upsert<T>(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<T> {
    const existing = await this.findOne<Record<string, unknown>>(schema, filter);

    if (existing) {
      const updated = await this.update<T>(schema, existing.id as string, data);
      return updated!;
    } else {
      return this.create<T>(schema, data);
    }
  }

  // ============================================================
  // IDialect Implementation — Atomic operations
  // ============================================================

  async increment(
    schema: EntitySchema,
    id: string,
    field: string,
    amount: number,
  ): Promise<Record<string, unknown>> {
    const existing = await this.findById<Record<string, unknown>>(schema, id);

    if (existing) {
      this.resetParams();
      const col = this.quoteIdentifier(field);
      const table = this.quoteIdentifier(schema.collection);
      const ph = this.nextPlaceholder();
      let sql = `UPDATE ${table} SET ${col} = COALESCE(${col}, 0) + ${ph}`;
      const params: unknown[] = [amount];

      if (schema.timestamps) {
        sql += `, ${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`;
        params.push(this.serializeDate('now'));
      }

      sql += ` WHERE ${this.quoteIdentifier('id')} = ${this.nextPlaceholder()}`;
      params.push(id);

      this.log('INCREMENT', schema.collection, { id, field, amount });
      await this.executeRun(sql, params);
    } else {
      const data: Record<string, unknown> = { id, [field]: amount };
      await this.create(schema, data);
    }

    return (await this.findById<Record<string, unknown>>(schema, id))!;
  }

  // ============================================================
  // IDialect Implementation — Array operations
  // ============================================================

  async addToSet(
    schema: EntitySchema,
    id: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.findById<Record<string, unknown>>(schema, id);
    if (!row) return null;

    // Many-to-many: INSERT into junction table
    const relDef = schema.relations[field];
    if (relDef?.type === 'many-to-many' && relDef.through) {
      const sourceKey = `${schema.name.toLowerCase()}Id`;
      const targetKey = `${relDef.target.toLowerCase()}Id`;
      this.log('ADD_TO_SET_M2M', relDef.through, { id, field, value });

      this.resetParams();
      const p1 = this.nextPlaceholder();
      const p2 = this.nextPlaceholder();
      // Use INSERT and ignore duplicates — dialect-specific handling in executeRun if needed
      try {
        await this.executeRun(
          `INSERT INTO ${this.quoteIdentifier(relDef.through)} (${this.quoteIdentifier(sourceKey)}, ${this.quoteIdentifier(targetKey)}) VALUES (${p1}, ${p2})`,
          [id, value]
        );
      } catch {
        // Duplicate key — ignore (set semantics)
      }
      return this.findById<Record<string, unknown>>(schema, id);
    }

    // Get current array value
    let arr: unknown[] = [];
    const currentVal = row[field];
    if (Array.isArray(currentVal)) {
      arr = [...currentVal];
    }

    // Add only if not present (set semantics)
    const serialized = JSON.stringify(value);
    const exists = arr.some(item => JSON.stringify(item) === serialized);
    if (!exists) {
      arr.push(value);

      this.resetParams();
      const col = this.quoteIdentifier(field);
      const table = this.quoteIdentifier(schema.collection);
      let sql = `UPDATE ${table} SET ${col} = ${this.nextPlaceholder()}`;
      const params: unknown[] = [JSON.stringify(arr)];

      if (schema.timestamps) {
        sql += `, ${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`;
        params.push(this.serializeDate('now'));
      }

      sql += ` WHERE ${this.quoteIdentifier('id')} = ${this.nextPlaceholder()}`;
      params.push(id);

      this.log('ADD_TO_SET', schema.collection, { id, field, value });
      await this.executeRun(sql, params);
    }

    return this.findById<Record<string, unknown>>(schema, id);
  }

  async pull(
    schema: EntitySchema,
    id: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.findById<Record<string, unknown>>(schema, id);
    if (!row) return null;

    // Many-to-many: DELETE from junction table
    const relDef = schema.relations[field];
    if (relDef?.type === 'many-to-many' && relDef.through) {
      const sourceKey = `${schema.name.toLowerCase()}Id`;
      const targetKey = `${relDef.target.toLowerCase()}Id`;
      this.log('PULL_M2M', relDef.through, { id, field, value });

      this.resetParams();
      const p1 = this.nextPlaceholder();
      const p2 = this.nextPlaceholder();
      await this.executeRun(
        `DELETE FROM ${this.quoteIdentifier(relDef.through)} WHERE ${this.quoteIdentifier(sourceKey)} = ${p1} AND ${this.quoteIdentifier(targetKey)} = ${p2}`,
        [id, value]
      );
      return this.findById<Record<string, unknown>>(schema, id);
    }

    // Get current array and remove matching element
    let arr: unknown[] = [];
    const currentVal = row[field];
    if (Array.isArray(currentVal)) {
      arr = [...currentVal];
    }

    const serializedVal = JSON.stringify(value);
    const filtered = arr.filter(item => JSON.stringify(item) !== serializedVal);

    if (filtered.length !== arr.length) {
      this.resetParams();
      const col = this.quoteIdentifier(field);
      const table = this.quoteIdentifier(schema.collection);
      let sql = `UPDATE ${table} SET ${col} = ${this.nextPlaceholder()}`;
      const params: unknown[] = [JSON.stringify(filtered)];

      if (schema.timestamps) {
        sql += `, ${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`;
        params.push(this.serializeDate('now'));
      }

      sql += ` WHERE ${this.quoteIdentifier('id')} = ${this.nextPlaceholder()}`;
      params.push(id);

      this.log('PULL', schema.collection, { id, field, value });
      await this.executeRun(sql, params);
    }

    return this.findById<Record<string, unknown>>(schema, id);
  }

  // ============================================================
  // IDialect Implementation — Text search
  // ============================================================

  async search<T>(
    schema: EntitySchema,
    query: string,
    fields: string[],
    options?: QueryOptions,
  ): Promise<T[]> {
    this.resetParams();
    const conditions = fields.map(f => `${this.quoteIdentifier(f)} LIKE ${this.nextPlaceholder()}`);
    const pattern = `%${query}%`;
    const params = fields.map(() => pattern);

    const cols = this.buildSelectColumns(schema, options);
    const orderBy = this.buildOrderBy(options);
    const limitOffset = this.buildLimitOffset(options);
    const table = this.quoteIdentifier(schema.collection);

    const sql = `SELECT ${cols} FROM ${table} WHERE (${conditions.join(' OR ')})${orderBy}${limitOffset}`;
    this.log('SEARCH', schema.collection, { sql, query, fields });

    const rows = await this.executeQuery<Record<string, unknown>>(sql, params);
    return rows.map(row => this.deserializeRow(row, schema) as T);
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /** Check if a table exists */
  protected async tableExists(tableName: string): Promise<boolean> {
    try {
      const query = this.getTableListQuery();
      const rows = await this.executeQuery<{ name: string }>(query, []);
      return rows.some(r => {
        // Check multiple possible column names
        const name = (r as Record<string, unknown>).name
          || (r as Record<string, unknown>).TABLE_NAME
          || (r as Record<string, unknown>).table_name
          || Object.values(r)[0];
        return name === tableName;
      });
    } catch {
      return false;
    }
  }

  /** Drop all tables (used by 'create' and 'create-drop' strategies) */
  protected async dropAllTables(): Promise<void> {
    try {
      const query = this.getTableListQuery();
      const rows = await this.executeQuery<Record<string, unknown>>(query, []);
      for (const row of rows) {
        const name = (row.name || row.TABLE_NAME || row.table_name || Object.values(row)[0]) as string;
        if (name) {
          await this.executeRun(`DROP TABLE ${this.quoteIdentifier(name)}`, []);
        }
      }
    } catch {
      // Ignore errors during drop
    }
  }
}

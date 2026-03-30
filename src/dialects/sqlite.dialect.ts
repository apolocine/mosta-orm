// SQLite Dialect — implements IDialect with better-sqlite3
// Equivalent to org.hibernate.dialect.SQLiteDialect
// Author: Dr Hamid MADANI drmdh@msn.com
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
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

// ============================================================
// SQL Logging — inspired by hibernate.show_sql / hibernate.format_sql
// ============================================================

let showSql = false;
let formatSql = false;
let highlightEnabled = false;

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m',
  yellow: '\x1b[33m', green: '\x1b[32m', magenta: '\x1b[35m',
  blue: '\x1b[34m', gray: '\x1b[90m',
};

const SQL_KW = /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|IF|NOT|EXISTS|INDEX|DROP|PRIMARY|KEY|UNIQUE|NULL|AND|OR|AS|COUNT|DISTINCT|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|LIKE|IN|IS|DEFAULT)\b/gi;

function logQuery(operation: string, table: string, details?: unknown): void {
  if (!showSql) return;
  const prefix = highlightEnabled
    ? `${C.dim}[DAL:${C.cyan}SQLite${C.dim}]${C.reset} ${C.blue}${operation}${C.reset} ${C.green}${table}${C.reset}`
    : `[DAL:SQLite] ${operation} ${table}`;
  if (formatSql && details) {
    const d = details as Record<string, unknown>;
    const sql = d.sql as string | undefined;
    if (sql && highlightEnabled) {
      console.log(prefix);
      console.log(`  ${sql.replace(SQL_KW, kw => `${C.yellow}${kw.toUpperCase()}${C.reset}`)}`);
      const params = (d.params ?? d.values) as unknown[] | undefined;
      if (params?.length) {
        console.log(`  ${C.gray}params: [${params.map((p, i) => `${C.magenta}${JSON.stringify(p)}${C.gray}`).join(', ')}]${C.reset}`);
      }
    } else {
      console.log(prefix);
      console.log(JSON.stringify(details, null, 2));
    }
  } else if (details) {
    console.log(`${prefix} ${JSON.stringify(details)}`);
  } else {
    console.log(prefix);
  }
}

// ============================================================
// Type Mapping — DAL FieldType → SQLite column type
// ============================================================

function fieldToSqlType(field: FieldDef): string {
  switch (field.type) {
    case 'string':  return 'TEXT';
    case 'text':    return 'TEXT';
    case 'number':  return 'REAL';
    case 'boolean': return 'INTEGER';
    case 'date':    return 'TEXT';
    case 'json':    return 'TEXT';
    case 'array':   return 'TEXT'; // JSON-encoded array
    default:        return 'TEXT';
  }
}

// ============================================================
// Value Serialization — JS values → SQLite-compatible values
// ============================================================

function serializeValue(value: unknown, field?: FieldDef): unknown {
  if (value === undefined || value === null) return null;
  if (field?.type === 'boolean' || typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (field?.type === 'date' || value instanceof Date) {
    if (value === 'now') return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return null;
  }
  if (field?.type === 'json' || field?.type === 'array') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

function deserializeRow(row: Record<string, unknown>, schema: EntitySchema): Record<string, unknown> {
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
      result[key] = deserializeField(val, fieldDef);
    } else if (relDef) {
      // many-to-many: no column in entity table, handled by junction table
      if (relDef.type === 'many-to-many') {
        result[key] = [];
        continue;
      }
      // Relation column — stored as TEXT (ID or JSON array of IDs)
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

  // Ensure many-to-many relations default to [] even when no column exists in SQL row
  for (const [relName, relDef] of Object.entries(schema.relations)) {
    if (relDef.type === 'many-to-many' && !(relName in result)) {
      result[relName] = [];
    }
  }

  return result;
}

function deserializeField(val: unknown, field: FieldDef): unknown {
  if (val === null || val === undefined) return val;

  switch (field.type) {
    case 'boolean':
      return val === 1 || val === true;
    case 'date':
      return val;
    case 'json':
      return parseJsonSafe(val as string, val);
    case 'array':
      return parseJsonSafe(val as string, []);
    case 'number':
      return val;
    case 'text':
      return val;
    default:
      return val;
  }
}

function parseJsonSafe(val: unknown, fallback: unknown): unknown {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// ============================================================
// Filter Translation — DAL FilterQuery → SQL WHERE clause
// ============================================================

interface WhereClause {
  sql: string;
  params: unknown[];
}

function translateFilter(filter: DALFilter, schema: EntitySchema): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(value)) {
      const orClauses = (value as DALFilter[]).map(f => translateFilter(f, schema));
      if (orClauses.length > 0) {
        const orSql = orClauses.map(c => `(${c.sql})`).join(' OR ');
        conditions.push(`(${orSql})`);
        for (const c of orClauses) params.push(...c.params);
      }
      continue;
    }

    if (key === '$and' && Array.isArray(value)) {
      const andClauses = (value as DALFilter[]).map(f => translateFilter(f, schema));
      if (andClauses.length > 0) {
        const andSql = andClauses.map(c => `(${c.sql})`).join(' AND ');
        conditions.push(`(${andSql})`);
        for (const c of andClauses) params.push(...c.params);
      }
      continue;
    }

    // Quoted column name to handle reserved words
    const col = quoteCol(key);

    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // FilterOperator
      const op = value as FilterOperator;

      if ('$eq' in op) {
        if (op.$eq === null) { conditions.push(`${col} IS NULL`); }
        else { conditions.push(`${col} = ?`); params.push(serializeForFilter(op.$eq, key, schema)); }
      }
      if ('$ne' in op) {
        if (op.$ne === null) { conditions.push(`${col} IS NOT NULL`); }
        else { conditions.push(`${col} != ?`); params.push(serializeForFilter(op.$ne, key, schema)); }
      }
      if ('$gt' in op) { conditions.push(`${col} > ?`); params.push(serializeForFilter(op.$gt, key, schema)); }
      if ('$gte' in op) { conditions.push(`${col} >= ?`); params.push(serializeForFilter(op.$gte, key, schema)); }
      if ('$lt' in op) { conditions.push(`${col} < ?`); params.push(serializeForFilter(op.$lt, key, schema)); }
      if ('$lte' in op) { conditions.push(`${col} <= ?`); params.push(serializeForFilter(op.$lte, key, schema)); }
      if ('$in' in op && Array.isArray(op.$in)) {
        const placeholders = op.$in.map(() => '?').join(', ');
        conditions.push(`${col} IN (${placeholders})`);
        for (const v of op.$in) params.push(serializeForFilter(v, key, schema));
      }
      if ('$nin' in op && Array.isArray(op.$nin)) {
        const placeholders = op.$nin.map(() => '?').join(', ');
        conditions.push(`${col} NOT IN (${placeholders})`);
        for (const v of op.$nin) params.push(serializeForFilter(v, key, schema));
      }
      if ('$regex' in op) {
        // SQLite LIKE approximation: convert basic regex patterns
        const pattern = regexToLike(op.$regex as string);
        conditions.push(`${col} LIKE ?`);
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
      // Direct equality
      if (value === null) {
        conditions.push(`${col} IS NULL`);
      } else {
        conditions.push(`${col} = ?`);
        params.push(serializeForFilter(value, key, schema));
      }
    }
  }

  return {
    sql: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params,
  };
}

function serializeForFilter(value: unknown, fieldName: string, schema: EntitySchema): unknown {
  const field = schema.fields[fieldName];
  if (field) return serializeValue(value, field);
  // For relation fields or unknown, pass through
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Convert basic regex patterns to SQLite LIKE patterns.
 * Handles common cases: ^prefix, suffix$, .*contains.*
 */
function regexToLike(regex: string): string {
  let pattern = regex;
  // Remove regex anchors and translate
  const hasStart = pattern.startsWith('^');
  const hasEnd = pattern.endsWith('$');
  pattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
  // Replace .* with %
  pattern = pattern.replace(/\.\*/g, '%');
  // Replace . with _
  pattern = pattern.replace(/\./g, '_');
  // Escape SQLite LIKE special chars that aren't our wildcards
  // (We already converted . and .* so remaining regex chars are literal)
  if (!hasStart) pattern = `%${pattern}`;
  if (!hasEnd) pattern = `${pattern}%`;
  return pattern;
}

function quoteCol(name: string): string {
  // Quote column names to handle reserved words like "order"
  return `"${name}"`;
}

// ============================================================
// Query Building Helpers
// ============================================================

function buildSelectColumns(schema: EntitySchema, options?: QueryOptions): string {
  if (options?.select && options.select.length > 0) {
    const cols = ['id', ...options.select.filter(f => f !== 'id')];
    return cols.map(quoteCol).join(', ');
  }
  if (options?.exclude && options.exclude.length > 0) {
    const allCols = getAllColumns(schema);
    const filtered = allCols.filter(c => !options.exclude!.includes(c));
    return filtered.map(quoteCol).join(', ');
  }
  return '*';
}

function getAllColumns(schema: EntitySchema): string[] {
  const cols = ['id'];
  cols.push(...Object.keys(schema.fields));
  // Skip many-to-many relations (no column in entity table)
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

function buildOrderBy(options?: QueryOptions): string {
  if (!options?.sort) return '';
  const clauses = Object.entries(options.sort)
    .map(([field, dir]) => `${quoteCol(field)} ${dir === -1 ? 'DESC' : 'ASC'}`);
  return clauses.length > 0 ? ` ORDER BY ${clauses.join(', ')}` : '';
}

function buildLimitOffset(options?: QueryOptions): string {
  let sql = '';
  if (options?.limit) sql += ` LIMIT ${options.limit}`;
  if (options?.skip) sql += ` OFFSET ${options.skip}`;
  return sql;
}

// ============================================================
// Data Preparation — EntitySchema + data → columns/values
// ============================================================

function prepareInsertData(
  schema: EntitySchema,
  data: Record<string, unknown>,
): { columns: string[]; placeholders: string[]; values: unknown[] } {
  const columns: string[] = ['id'];
  const placeholders: string[] = ['?'];
  const id = (data.id as string) || randomUUID();
  const values: unknown[] = [id];

  // Fields
  for (const [name, field] of Object.entries(schema.fields)) {
    if (name in data) {
      columns.push(name);
      placeholders.push('?');
      values.push(serializeValue(data[name], field));
    } else if (field.default !== undefined) {
      columns.push(name);
      placeholders.push('?');
      const def = field.default === 'now' ? new Date().toISOString() : field.default;
      values.push(serializeValue(def, field));
    }
  }

  // Relations
  for (const [name, rel] of Object.entries(schema.relations)) {
    if (rel.type === 'many-to-many') {
      // Handled by junction table, skip column insert
      continue;
    }
    if (name in data) {
      columns.push(name);
      placeholders.push('?');
      if (rel.type === 'one-to-many') {
        // Array of IDs → JSON
        values.push(JSON.stringify(data[name] ?? []));
      } else {
        // Empty string → null for FK columns (avoids FOREIGN KEY constraint failures)
        values.push(data[name] || null);
      }
    } else if (rel.type === 'one-to-many') {
      columns.push(name);
      placeholders.push('?');
      values.push('[]');
    }
  }

  // Timestamps
  if (schema.timestamps) {
    const now = new Date().toISOString();
    if (!columns.includes('createdAt')) {
      columns.push('createdAt');
      placeholders.push('?');
      values.push(now);
    }
    if (!columns.includes('updatedAt')) {
      columns.push('updatedAt');
      placeholders.push('?');
      values.push(now);
    }
  }

  // Extra columns not in schema.fields or relations (e.g. discriminator _type)
  const relationKeys = new Set(Object.keys(schema.relations));
  for (const key of Object.keys(data)) {
    if (!columns.includes(key) && key !== 'id' && !relationKeys.has(key)) {
      columns.push(key);
      placeholders.push('?');
      values.push(data[key] as unknown);
    }
  }

  return { columns, placeholders, values };
}

function prepareUpdateData(
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
      setClauses.push(`${quoteCol(key)} = ?`);
      values.push(serializeValue(val, field));
    } else if (rel) {
      if (rel.type === 'many-to-many') {
        // Handled by junction table, skip column update
        continue;
      }
      setClauses.push(`${quoteCol(key)} = ?`);
      if (rel.type === 'one-to-many') {
        values.push(JSON.stringify(val ?? []));
      } else {
        // Empty string → null for FK columns (avoids FOREIGN KEY constraint failures)
        values.push(val || null);
      }
    } else if (key === 'createdAt' || key === 'updatedAt') {
      setClauses.push(`${quoteCol(key)} = ?`);
      values.push(val instanceof Date ? val.toISOString() : val);
    }
  }

  // Auto-update updatedAt
  if (schema.timestamps && !setClauses.some(c => c.startsWith('"updatedAt"'))) {
    setClauses.push(`"updatedAt" = ?`);
    values.push(new Date().toISOString());
  }

  return { setClauses, values };
}

// ============================================================
// DDL Generation — EntitySchema → CREATE TABLE
// ============================================================

function generateCreateTable(schema: EntitySchema): string {
  const cols: string[] = ['  "id" TEXT PRIMARY KEY'];

  // Fields
  for (const [name, field] of Object.entries(schema.fields)) {
    let colDef = `  ${quoteCol(name)} ${fieldToSqlType(field)}`;
    if (field.required) colDef += ' NOT NULL';
    if (field.unique) colDef += ' UNIQUE';
    if (field.default !== undefined && field.default !== 'now' && field.default !== null) {
      const defVal = serializeValue(field.default, field);
      if (typeof defVal === 'string') colDef += ` DEFAULT '${defVal.replace(/'/g, "''")}'`;
      else if (typeof defVal === 'number') colDef += ` DEFAULT ${defVal}`;
    }
    cols.push(colDef);
  }

  // Relations
  for (const [name, rel] of Object.entries(schema.relations)) {
    if (rel.type === 'many-to-many') {
      // Handled by junction table, no column in entity table
      continue;
    }
    if (rel.type === 'one-to-many') {
      cols.push(`  ${quoteCol(name)} TEXT DEFAULT '[]'`);
    } else {
      let colDef = `  ${quoteCol(name)} TEXT`;
      if (rel.required) colDef += ' NOT NULL';
      cols.push(colDef);
    }
  }

  // Timestamps
  if (schema.timestamps) {
    cols.push('  "createdAt" TEXT');
    cols.push('  "updatedAt" TEXT');
  }

  // Discriminator column (single-table inheritance)
  if (schema.discriminator) {
    cols.push(`  ${quoteCol(schema.discriminator)} TEXT NOT NULL`);
  }

  // Soft-delete column
  if (schema.softDelete) {
    cols.push('  "deletedAt" TEXT');
  }

  return `CREATE TABLE IF NOT EXISTS "${schema.collection}" (\n${cols.join(',\n')}\n)`;
}

function generateIndexes(schema: EntitySchema): string[] {
  const statements: string[] = [];

  for (let i = 0; i < schema.indexes.length; i++) {
    const idx = schema.indexes[i];
    const fields = Object.entries(idx.fields);

    // Skip text indexes (handled differently in search)
    if (fields.some(([, dir]) => dir === 'text')) continue;

    const idxName = `idx_${schema.collection}_${i}`;
    const colDefs = fields.map(([f, dir]) => `${quoteCol(f)} ${dir === 'desc' ? 'DESC' : 'ASC'}`);
    const unique = idx.unique ? 'UNIQUE ' : '';
    statements.push(
      `CREATE ${unique}INDEX IF NOT EXISTS "${idxName}" ON "${schema.collection}" (${colDefs.join(', ')})`
    );
  }

  return statements;
}

// ============================================================
// Discriminator + soft-delete helpers
// ============================================================

function applyDiscriminator(filter: DALFilter, schema: EntitySchema): DALFilter {
  if (!schema.discriminator || !schema.discriminatorValue) return filter;
  return { ...filter, [schema.discriminator]: schema.discriminatorValue };
}

function applyDiscriminatorToData(data: Record<string, unknown>, schema: EntitySchema): Record<string, unknown> {
  if (!schema.discriminator || !schema.discriminatorValue) return data;
  return { ...data, [schema.discriminator]: schema.discriminatorValue };
}

function applySoftDeleteFilter(filter: DALFilter, schema: EntitySchema): DALFilter {
  if (!schema.softDelete || 'deletedAt' in filter) return filter;
  return { ...filter, deletedAt: { $eq: null } };
}

function applyAllFilters(filter: DALFilter, schema: EntitySchema): DALFilter {
  return applySoftDeleteFilter(applyDiscriminator(filter, schema), schema);
}

// ============================================================
// SQLiteDialect — implements IDialect
// ============================================================

class SQLiteDialect implements IDialect {
  readonly dialectType: DialectType = 'sqlite';
  private db: Database.Database | null = null;
  private config: ConnectionConfig | null = null;
  private schemas: EntitySchema[] = [];

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config;
    showSql = config.showSql ?? false;
    formatSql = config.formatSql ?? false;
    highlightEnabled = config.highlightSql ?? false;

    // Ensure parent directory exists for file-based DBs
    if (config.uri !== ':memory:') {
      const dbPath = resolve(config.uri);
      const dbDir = dirname(dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }
      this.db = new Database(dbPath);
    } else {
      this.db = new Database(':memory:');
    }

    // WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    logQuery('CONNECT', config.uri);

    // hibernate.hbm2ddl.auto=create
    if (config.schemaStrategy === 'create') {
      logQuery('SCHEMA', 'create — dropping existing tables');
      // Get all table names and drop them
      const tables = this.db!.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as { name: string }[];
      this.db!.pragma('foreign_keys = OFF');
      for (const t of tables) {
        this.db!.exec(`DROP TABLE IF EXISTS "${t.name}"`);
      }
      this.db!.pragma('foreign_keys = ON');
    }
  }

  async disconnect(): Promise<void> {
    if (!this.db) return;

    // hibernate.hbm2ddl.auto=create-drop
    if (this.config?.schemaStrategy === 'create-drop') {
      logQuery('SCHEMA', 'create-drop — dropping all tables on shutdown');
      const tables = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as { name: string }[];
      this.db.pragma('foreign_keys = OFF');
      for (const t of tables) {
        this.db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
      }
    }

    this.db.close();
    this.db = null;
    this.schemas = [];
    logQuery('DISCONNECT', '');
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.db) return false;
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  // --- Schema management (hibernate.hbm2ddl.auto) ---

  async initSchema(schemas: EntitySchema[]): Promise<void> {
    if (!this.db) throw new Error('SQLite not connected');
    this.schemas = schemas;
    const strategy = this.config?.schemaStrategy ?? 'none';
    logQuery('INIT_SCHEMA', `strategy=${strategy}`, { entities: schemas.map(s => s.name) });

    if (strategy === 'none') return;

    if (strategy === 'validate') {
      // Check all tables exist
      for (const schema of schemas) {
        const row = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(schema.collection) as { name: string } | undefined;
        if (!row) {
          throw new Error(
            `Schema validation failed: table "${schema.collection}" does not exist ` +
            `(entity: ${schema.name}). Set schemaStrategy to "update" or "create".`
          );
        }
      }
      return;
    }

    // strategy: 'update' or 'create' — create tables + indexes
    // Try to run the migration file first
    const migrationPath = resolve(
      dirname(new URL(import.meta.url).pathname),
      '../migrations/sqlite/001-initial.sql'
    );

    if (existsSync(migrationPath)) {
      logQuery('MIGRATION', migrationPath);
      const sql = readFileSync(migrationPath, 'utf-8');
      this.db.exec(sql);
    } else {
      // Fall back to dynamic DDL generation from schemas
      for (const schema of schemas) {
        const createSql = generateCreateTable(schema);
        logQuery('DDL', schema.collection, createSql);
        this.db.exec(createSql);

        const indexStatements = generateIndexes(schema);
        for (const stmt of indexStatements) {
          this.db.exec(stmt);
        }
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
          const ddl = `CREATE TABLE IF NOT EXISTS "${rel.through}" (
  "${sourceKey}" TEXT NOT NULL,
  "${targetKey}" TEXT NOT NULL,
  PRIMARY KEY ("${sourceKey}", "${targetKey}"),
  FOREIGN KEY ("${sourceKey}") REFERENCES "${schema.collection}"("id") ON DELETE CASCADE,
  FOREIGN KEY ("${targetKey}") REFERENCES "${targetSchema.collection}"("id") ON DELETE CASCADE
)`;
          logQuery('DDL_JUNCTION', rel.through, ddl);
          this.db.exec(ddl);
        }
      }
    }
  }

  // --- CRUD ---

  async find<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T[]> {
    const db = this.getDb();
    const where = translateFilter(applyAllFilters(filter, schema), schema);
    const cols = buildSelectColumns(schema, options);
    const orderBy = buildOrderBy(options);
    const limitOffset = buildLimitOffset(options);

    const sql = `SELECT ${cols} FROM "${schema.collection}" WHERE ${where.sql}${orderBy}${limitOffset}`;
    logQuery('FIND', schema.collection, { sql, params: where.params });

    const rows = db.prepare(sql).all(...where.params) as Record<string, unknown>[];
    return rows.map(row => deserializeRow(row, schema) as T);
  }

  async findOne<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T | null> {
    const db = this.getDb();
    const where = translateFilter(applyAllFilters(filter, schema), schema);
    const cols = buildSelectColumns(schema, options);
    const orderBy = buildOrderBy(options);

    const sql = `SELECT ${cols} FROM "${schema.collection}" WHERE ${where.sql}${orderBy} LIMIT 1`;
    logQuery('FIND_ONE', schema.collection, { sql, params: where.params });

    const row = db.prepare(sql).get(...where.params) as Record<string, unknown> | undefined;
    return row ? deserializeRow(row, schema) as T : null;
  }

  async findById<T>(schema: EntitySchema, id: string, options?: QueryOptions): Promise<T | null> {
    const db = this.getDb();
    const cols = buildSelectColumns(schema, options);
    const where = translateFilter(applyAllFilters({ id }, schema), schema);

    const sql = `SELECT ${cols} FROM "${schema.collection}" WHERE ${where.sql}`;
    logQuery('FIND_BY_ID', schema.collection, { id });

    const row = db.prepare(sql).get(...where.params) as Record<string, unknown> | undefined;
    return row ? deserializeRow(row, schema) as T : null;
  }

  async create<T>(schema: EntitySchema, data: Record<string, unknown>): Promise<T> {
    const db = this.getDb();
    const { columns, placeholders, values } = prepareInsertData(schema, applyDiscriminatorToData(data, schema));

    const sql = `INSERT INTO "${schema.collection}" (${columns.map(quoteCol).join(', ')}) VALUES (${placeholders.join(', ')})`;
    logQuery('CREATE', schema.collection, { sql, values });

    db.prepare(sql).run(...values);

    // Insert junction table rows for many-to-many relations
    const entityId = values[0] as string;
    for (const [relName, rel] of Object.entries(schema.relations)) {
      if (rel.type === 'many-to-many' && rel.through && Array.isArray(data[relName])) {
        const sourceKey = `${schema.name.toLowerCase()}Id`;
        const targetKey = `${rel.target.toLowerCase()}Id`;
        const stmt = db.prepare(
          `INSERT OR IGNORE INTO "${rel.through}" ("${sourceKey}", "${targetKey}") VALUES (?, ?)`
        );
        for (const targetId of data[relName] as unknown[]) {
          stmt.run(entityId, targetId);
        }
      }
    }

    // Return the created row
    return this.findById<T>(schema, entityId) as Promise<T>;
  }

  async update<T>(schema: EntitySchema, id: string, data: Record<string, unknown>): Promise<T | null> {
    const db = this.getDb();

    // Check existence first
    const existing = await this.findById(schema, id);
    if (!existing) return null;

    const { setClauses, values } = prepareUpdateData(schema, data);

    if (setClauses.length > 0) {
      const idWhere = translateFilter(applyDiscriminator({ id }, schema), schema);
      const sql = `UPDATE "${schema.collection}" SET ${setClauses.join(', ')} WHERE ${idWhere.sql}`;
      values.push(...idWhere.params);
      logQuery('UPDATE', schema.collection, { sql, values });
      db.prepare(sql).run(...values);
    }

    // Replace junction table rows for many-to-many relations
    for (const [relName, rel] of Object.entries(schema.relations)) {
      if (rel.type === 'many-to-many' && rel.through && relName in data) {
        const sourceKey = `${schema.name.toLowerCase()}Id`;
        const targetKey = `${rel.target.toLowerCase()}Id`;
        // Delete existing junction rows
        db.prepare(`DELETE FROM "${rel.through}" WHERE "${sourceKey}" = ?`).run(id);
        // Insert new junction rows
        if (Array.isArray(data[relName])) {
          const stmt = db.prepare(
            `INSERT OR IGNORE INTO "${rel.through}" ("${sourceKey}", "${targetKey}") VALUES (?, ?)`
          );
          for (const targetId of data[relName] as unknown[]) {
            stmt.run(id, targetId);
          }
        }
      }
    }

    return this.findById<T>(schema, id);
  }

  async updateMany(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<number> {
    const db = this.getDb();
    const where = translateFilter(applyAllFilters(filter, schema), schema);
    const { setClauses, values } = prepareUpdateData(schema, data);

    if (setClauses.length === 0) return 0;

    const sql = `UPDATE "${schema.collection}" SET ${setClauses.join(', ')} WHERE ${where.sql}`;
    const allValues = [...values, ...where.params];
    logQuery('UPDATE_MANY', schema.collection, { sql, params: allValues });

    const result = db.prepare(sql).run(...allValues);
    return result.changes;
  }

  async delete(schema: EntitySchema, id: string): Promise<boolean> {
    const db = this.getDb();
    const idWhere = translateFilter(applyDiscriminator({ id }, schema), schema);

    if (schema.softDelete) {
      const sql = `UPDATE "${schema.collection}" SET "deletedAt" = ? WHERE ${idWhere.sql}`;
      logQuery('SOFT_DELETE', schema.collection, { id });
      const result = db.prepare(sql).run(new Date().toISOString(), ...idWhere.params);
      return result.changes > 0;
    }

    const sql = `DELETE FROM "${schema.collection}" WHERE ${idWhere.sql}`;
    logQuery('DELETE', schema.collection, { id });
    const result = db.prepare(sql).run(...idWhere.params);
    return result.changes > 0;
  }

  async deleteMany(schema: EntitySchema, filter: DALFilter): Promise<number> {
    const db = this.getDb();
    const effectiveFilter = applyDiscriminator(filter, schema);

    if (schema.softDelete) {
      const where = translateFilter(applySoftDeleteFilter(effectiveFilter, schema), schema);
      const sql = `UPDATE "${schema.collection}" SET "deletedAt" = ? WHERE ${where.sql}`;
      logQuery('SOFT_DELETE_MANY', schema.collection, { sql });
      const result = db.prepare(sql).run(new Date().toISOString(), ...where.params);
      return result.changes;
    }

    const where = translateFilter(effectiveFilter, schema);
    const sql = `DELETE FROM "${schema.collection}" WHERE ${where.sql}`;
    logQuery('DELETE_MANY', schema.collection, { sql, params: where.params });
    const result = db.prepare(sql).run(...where.params);
    return result.changes;
  }

  // --- Queries ---

  async count(schema: EntitySchema, filter: DALFilter): Promise<number> {
    const db = this.getDb();
    const where = translateFilter(applyAllFilters(filter, schema), schema);

    const sql = `SELECT COUNT(*) as cnt FROM "${schema.collection}" WHERE ${where.sql}`;
    logQuery('COUNT', schema.collection, { sql, params: where.params });

    const row = db.prepare(sql).get(...where.params) as { cnt: number };
    return row.cnt;
  }

  async distinct(schema: EntitySchema, field: string, filter: DALFilter): Promise<unknown[]> {
    const db = this.getDb();
    const where = translateFilter(applyAllFilters(filter, schema), schema);

    const sql = `SELECT DISTINCT ${quoteCol(field)} FROM "${schema.collection}" WHERE ${where.sql}`;
    logQuery('DISTINCT', schema.collection, { sql, params: where.params });

    const rows = db.prepare(sql).all(...where.params) as Record<string, unknown>[];
    return rows.map(r => {
      const val = r[field];
      const fieldDef = schema.fields[field];
      if (fieldDef) return deserializeField(val, fieldDef);
      return val;
    });
  }

  async aggregate<T>(schema: EntitySchema, stages: AggregateStage[]): Promise<T[]> {
    const db = this.getDb();

    // Build SQL from aggregate stages
    // Strategy: translate $match → WHERE, $group → GROUP BY, $sort → ORDER BY, $limit → LIMIT
    let whereClause = '1=1';
    let whereParams: unknown[] = [];
    let groupBy: string | null = null;
    let selectCols: string[] = [];
    let orderBy = '';
    let limit = '';

    for (const stage of stages) {
      if ('$match' in stage) {
        const effectiveMatch = applyAllFilters(stage.$match, schema);
        const w = translateFilter(effectiveMatch, schema);
        whereClause = w.sql;
        whereParams = w.params;
      } else if ('$group' in stage) {
        const group = stage as AggregateGroupStage;
        const groupDef = group.$group;
        selectCols = [];

        for (const [key, val] of Object.entries(groupDef)) {
          if (key === '_by') {
            if (val) {
              groupBy = quoteCol(val as string);
              selectCols.push(`${groupBy} as "_id"`);
            } else {
              selectCols.push(`NULL as "_id"`);
            }
          } else if (val && typeof val === 'object') {
            const acc = val as Record<string, unknown>;
            if ('$sum' in acc) {
              if (typeof acc.$sum === 'string') {
                selectCols.push(`SUM(${quoteCol(acc.$sum.replace(/^\$/, ''))}) as ${quoteCol(key)}`);
              } else {
                selectCols.push(`SUM(${acc.$sum}) as ${quoteCol(key)}`);
              }
            }
            if ('$count' in acc) {
              selectCols.push(`COUNT(*) as ${quoteCol(key)}`);
            }
            if ('$avg' in acc && typeof acc.$avg === 'string') {
              selectCols.push(`AVG(${quoteCol(acc.$avg.replace(/^\$/, ''))}) as ${quoteCol(key)}`);
            }
            if ('$min' in acc && typeof acc.$min === 'string') {
              selectCols.push(`MIN(${quoteCol(acc.$min.replace(/^\$/, ''))}) as ${quoteCol(key)}`);
            }
            if ('$max' in acc && typeof acc.$max === 'string') {
              selectCols.push(`MAX(${quoteCol(acc.$max.replace(/^\$/, ''))}) as ${quoteCol(key)}`);
            }
          }
        }
      } else if ('$sort' in stage) {
        const sortClauses = Object.entries(stage.$sort)
          .map(([f, dir]) => `${quoteCol(f)} ${dir === -1 ? 'DESC' : 'ASC'}`);
        orderBy = ` ORDER BY ${sortClauses.join(', ')}`;
      } else if ('$limit' in stage) {
        limit = ` LIMIT ${stage.$limit}`;
      }
    }

    if (selectCols.length === 0) {
      selectCols = ['*'];
    }

    let sql = `SELECT ${selectCols.join(', ')} FROM "${schema.collection}" WHERE ${whereClause}`;
    if (groupBy) sql += ` GROUP BY ${groupBy}`;
    sql += orderBy + limit;

    logQuery('AGGREGATE', schema.collection, { sql, params: whereParams });
    const rows = db.prepare(sql).all(...whereParams) as T[];
    return rows;
  }

  // --- Relations (N+1 strategy — SELECT principal + 1 query par relation) ---

  async findWithRelations<T>(
    schema: EntitySchema,
    filter: DALFilter,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T[]> {
    // 1. Main query
    const rows = await this.find<Record<string, unknown>>(schema, filter, options);
    if (rows.length === 0) return [] as T[];

    // 2. Populate each relation
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

      // Find the target schema in our stored schemas
      const targetSchema = this.schemas.find(s => s.name === relDef.target);
      if (!targetSchema) continue;

      const selectOpts: QueryOptions | undefined = relDef.select
        ? { select: relDef.select }
        : undefined;

      if (relDef.type === 'many-to-many' && relDef.through) {
        // SELECT from junction table then fetch each related entity
        const db = this.getDb();
        const sourceKey = `${schema.name.toLowerCase()}Id`;
        const targetKey = `${relDef.target.toLowerCase()}Id`;
        const junctionRows = db.prepare(
          `SELECT "${targetKey}" FROM "${relDef.through}" WHERE "${sourceKey}" = ?`
        ).all(result.id) as Record<string, string>[];

        const populated: Record<string, unknown>[] = [];
        for (const jr of junctionRows) {
          const related = await this.findById<Record<string, unknown>>(targetSchema, jr[targetKey], selectOpts);
          if (related) populated.push(related);
        }
        result[relName] = populated;
      } else if (relDef.type === 'one-to-many') {
        // The field stores a JSON array of IDs
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
        // many-to-one or one-to-one — the field stores a single ID
        const refId = result[relName];
        if (refId) {
          const related = await this.findById<Record<string, unknown>>(targetSchema, String(refId), selectOpts);
          result[relName] = related ?? refId;
        }
      }
    }

    return result;
  }

  // --- Upsert (equivalent Hibernate saveOrUpdate) ---

  async upsert<T>(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<T> {
    const existing = await this.findOne<Record<string, unknown>>(schema, filter);

    if (existing) {
      const updated = await this.update<T>(schema, existing.id as string, data);
      return updated!;
    } else {
      return this.create<T>(schema, data);
    }
  }

  // --- Atomic operations ---

  async increment(
    schema: EntitySchema,
    id: string,
    field: string,
    amount: number,
  ): Promise<Record<string, unknown>> {
    const db = this.getDb();

    // Upsert: insert if not exists, increment if exists
    const existing = await this.findById<Record<string, unknown>>(schema, id);

    if (existing) {
      const sql = `UPDATE "${schema.collection}" SET ${quoteCol(field)} = COALESCE(${quoteCol(field)}, 0) + ?${schema.timestamps ? ', "updatedAt" = ?' : ''} WHERE "id" = ?`;
      const params: unknown[] = [amount];
      if (schema.timestamps) params.push(new Date().toISOString());
      params.push(id);

      logQuery('INCREMENT', schema.collection, { id, field, amount });
      db.prepare(sql).run(...params);
    } else {
      // Create with this ID and the incremented field
      const data: Record<string, unknown> = { id, [field]: amount };
      await this.create(schema, data);
    }

    return (await this.findById<Record<string, unknown>>(schema, id))!;
  }

  // --- Array operations (equivalent Hibernate @ElementCollection management) ---

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
      const db = this.getDb();
      const sourceKey = `${schema.name.toLowerCase()}Id`;
      const targetKey = `${relDef.target.toLowerCase()}Id`;
      logQuery('ADD_TO_SET_M2M', relDef.through, { id, field, value });
      db.prepare(
        `INSERT OR IGNORE INTO "${relDef.through}" ("${sourceKey}", "${targetKey}") VALUES (?, ?)`
      ).run(id, value);
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

      const db = this.getDb();
      const sql = `UPDATE "${schema.collection}" SET ${quoteCol(field)} = ?${schema.timestamps ? ', "updatedAt" = ?' : ''} WHERE "id" = ?`;
      const params: unknown[] = [JSON.stringify(arr)];
      if (schema.timestamps) params.push(new Date().toISOString());
      params.push(id);

      logQuery('ADD_TO_SET', schema.collection, { id, field, value });
      db.prepare(sql).run(...params);
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
      const db = this.getDb();
      const sourceKey = `${schema.name.toLowerCase()}Id`;
      const targetKey = `${relDef.target.toLowerCase()}Id`;
      logQuery('PULL_M2M', relDef.through, { id, field, value });
      db.prepare(
        `DELETE FROM "${relDef.through}" WHERE "${sourceKey}" = ? AND "${targetKey}" = ?`
      ).run(id, value);
      return this.findById<Record<string, unknown>>(schema, id);
    }

    // Get current array and remove matching element
    let arr: unknown[] = [];
    const currentVal = row[field];
    if (Array.isArray(currentVal)) {
      arr = [...currentVal];
    }

    const serialized = JSON.stringify(value);
    const filtered = arr.filter(item => JSON.stringify(item) !== serialized);

    if (filtered.length !== arr.length) {
      const db = this.getDb();
      const sql = `UPDATE "${schema.collection}" SET ${quoteCol(field)} = ?${schema.timestamps ? ', "updatedAt" = ?' : ''} WHERE "id" = ?`;
      const params: unknown[] = [JSON.stringify(filtered)];
      if (schema.timestamps) params.push(new Date().toISOString());
      params.push(id);

      logQuery('PULL', schema.collection, { id, field, value });
      db.prepare(sql).run(...params);
    }

    return this.findById<Record<string, unknown>>(schema, id);
  }

  // --- Text search ---

  async search<T>(
    schema: EntitySchema,
    query: string,
    fields: string[],
    options?: QueryOptions,
  ): Promise<T[]> {
    const db = this.getDb();

    // Build OR conditions with LIKE for each field (case-insensitive)
    const conditions = fields.map(f => `${quoteCol(f)} LIKE ?`);
    const pattern = `%${query}%`;
    const params: unknown[] = fields.map(() => pattern);

    const cols = buildSelectColumns(schema, options);
    const orderBy = buildOrderBy(options);
    const limitOffset = buildLimitOffset(options);

    // Apply discriminator + soft-delete
    const extraFilter = applyAllFilters({}, schema);
    const extra = translateFilter(extraFilter, schema);
    const extraWhere = extra.sql !== '1=1' ? ` AND ${extra.sql}` : '';
    params.push(...extra.params);

    const sql = `SELECT ${cols} FROM "${schema.collection}" WHERE (${conditions.join(' OR ')})${extraWhere}${orderBy}${limitOffset}`;
    logQuery('SEARCH', schema.collection, { sql, query, fields });

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => deserializeRow(row, schema) as T);
  }

  // --- Private helpers ---

  private getDb(): Database.Database {
    if (!this.db) throw new Error('SQLite not connected. Call connect() first.');
    return this.db;
  }

  // ── Schema management (truncate / drop) ────────────

  async truncateTable(tableName: string): Promise<void> {
    this.getDb().exec(`DELETE FROM "${tableName}"`);
  }

  async truncateAll(schemas: import('../core/types.js').EntitySchema[]): Promise<string[]> {
    const db = this.getDb();
    const truncated: string[] = [];
    db.pragma('foreign_keys = OFF');
    // Junction tables first
    for (const schema of schemas) {
      for (const [, rel] of Object.entries(schema.relations || {})) {
        if (rel.type === 'many-to-many' && rel.through) {
          try { db.exec(`DELETE FROM "${rel.through}"`); truncated.push(rel.through); } catch {}
        }
      }
    }
    for (const schema of schemas) {
      try { db.exec(`DELETE FROM "${schema.collection}"`); truncated.push(schema.collection); } catch {}
    }
    db.pragma('foreign_keys = ON');
    return truncated;
  }

  async dropTable(tableName: string): Promise<void> {
    this.getDb().exec(`DROP TABLE IF EXISTS "${tableName}"`);
  }

  async dropAllTables(): Promise<void> {
    const db = this.getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    db.pragma('foreign_keys = OFF');
    for (const t of tables) {
      db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    }
    db.pragma('foreign_keys = ON');
  }

  async dropSchema(schemas: import('../core/types.js').EntitySchema[]): Promise<string[]> {
    const db = this.getDb();
    const dropped: string[] = [];
    db.pragma('foreign_keys = OFF');
    // Junction tables first
    for (const schema of schemas) {
      for (const [, rel] of Object.entries(schema.relations || {})) {
        if (rel.type === 'many-to-many' && rel.through) {
          try { db.exec(`DROP TABLE IF EXISTS "${rel.through}"`); dropped.push(rel.through); } catch {}
        }
      }
    }
    for (const schema of schemas) {
      try { db.exec(`DROP TABLE IF EXISTS "${schema.collection}"`); dropped.push(schema.collection); } catch {}
    }
    db.pragma('foreign_keys = ON');
    return dropped;
  }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new SQLiteDialect();
}

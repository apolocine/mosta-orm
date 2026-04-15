// Oracle Database Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.OracleDialect (Hibernate ORM 6.4)
// Driver: npm install oracledb
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
  QueryOptions,
  RelationDef,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → Oracle column type
// ============================================================

const ORACLE_TYPE_MAP: Record<string, string> = {
  string:  'VARCHAR2(4000)',
  text:    'CLOB',
  number:  'NUMBER',
  boolean: 'NUMBER(1)',
  date:    'TIMESTAMP',
  json:    'CLOB',
  array:   'CLOB',
};

// ============================================================
// OracleDialect
// ============================================================

class OracleDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'oracle';
  private pool: unknown = null;
  private oracledb: unknown = null;

  // Mutex to serialize concurrent queries (oracledb thin mode buffer safety)
  private _mutex: Promise<void> = Promise.resolve();
  private acquireMutex(): Promise<() => void> {
    let release: () => void;
    const prev = this._mutex;
    this._mutex = new Promise<void>(resolve => { release = resolve; });
    return prev.then(() => release!);
  }

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  // Oracle uses :1, :2, ... bind variables
  getPlaceholder(index: number): string {
    return `:${index}`;
  }

  fieldToSqlType(field: FieldDef): string {
    return ORACLE_TYPE_MAP[field.type] || 'VARCHAR2(4000)';
  }

  getIdColumnType(): string {
    return 'VARCHAR2(36)';
  }

  getTableListQuery(): string {
    return "SELECT table_name as name FROM user_tables";
  }

  /**
   * Oracle keeps identifiers in their original case when CREATE TABLE quoted
   * them with double-quotes ("users", "userId"). user_tab_columns stores them
   * verbatim. Pass the table name as-is — the bound parameter is matched
   * case-sensitively by Oracle.
   */
  /**
   * Oracle-correct DROP TABLE :
   * - `IF EXISTS` is not supported → wrap in PL/SQL block and ignore ORA-00942
   * - cascade keyword is `CASCADE CONSTRAINTS`, not just `CASCADE`
   * - `PURGE` skips the recycle bin so the table can be recreated immediately
   */
  /**
   * Oracle has implicit transactions — there is no SQL `BEGIN` keyword.
   * The default `AbstractSqlDialect.beginSql()` returns "BEGIN" which on
   * Oracle is interpreted as a PL/SQL block opener — `BEGIN ;` alone is
   * malformed → ORA-06550 PLS-00103. Override to skip BEGIN entirely
   * (return null) ; SET TRANSACTION ISOLATION LEVEL is used only when
   * the caller asks for a specific isolation.
   */
  protected beginSql(opts?: { isolation?: string }): string | null {
    if (opts?.isolation) return `SET TRANSACTION ISOLATION LEVEL ${opts.isolation}`;
    return null;
  }

  async dropTable(tableName: string): Promise<void> {
    const sql =
      `BEGIN ` +
      `  EXECUTE IMMEDIATE 'DROP TABLE ${this.quoteIdentifier(tableName)} CASCADE CONSTRAINTS PURGE'; ` +
      `EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; ` +
      `END;`;
    await this.executeRun(sql, []);
    this.log('DROP_TABLE', tableName);
  }

  protected async getExistingColumns(tableName: string): Promise<Set<string>> {
    try {
      // Oracle stores unquoted identifiers in upper case (USERS) and quoted
      // identifiers verbatim ("users"). Match both : try the raw name first,
      // then upper-case fallback if nothing came back.
      const fetch = async (name: string) =>
        this.executeQuery<{ COLUMN_NAME?: string; column_name?: string }>(
          `SELECT column_name FROM user_tab_columns WHERE table_name = :1`,
          [name],
        );
      let rows = await fetch(tableName);
      if (rows.length === 0 && tableName !== tableName.toUpperCase()) {
        rows = await fetch(tableName.toUpperCase());
      }
      const set = new Set<string>();
      for (const r of rows) {
        const c = (r.COLUMN_NAME ?? r.column_name) as string | undefined;
        if (c) set.add(c);
      }
      return set;
    } catch { return new Set(); }
  }

  // --- Hooks ---

  // Oracle prior to 23c doesn't support IF NOT EXISTS
  protected supportsIfNotExists(): boolean { return false; }
  protected supportsReturning(): boolean { return false; }

  // Oracle: pass native Date objects — oracledb handles binding correctly
  protected serializeDate(value: unknown): unknown {
    if (value === 'now' || value === '__MOSTA_NOW__') return new Date();
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
      return value;
    }
    return null;
  }

  // Oracle NUMBER(1): 1 = true, 0 = false
  protected serializeBoolean(v: boolean): unknown { return v ? 1 : 0; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === 1 || v === true || v === '1';
  }

  /** Oracle LIKE is case-sensitive — use UPPER() for case-insensitive search */
  protected buildRegexCondition(col: string, flags?: string): string {
    if (flags?.includes('i')) {
      return `UPPER(${col}) LIKE UPPER(${this.nextPlaceholder()})`;
    }
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  // Oracle uses OFFSET n ROWS FETCH FIRST m ROWS ONLY (12c+)
  protected buildLimitOffset(options?: QueryOptions): string {
    if (!options?.limit && !options?.skip) return '';

    const offset = options.skip ?? 0;
    const limit = options.limit;

    let sql = ` OFFSET ${offset} ROWS`;
    if (limit) sql += ` FETCH FIRST ${limit} ROWS ONLY`;
    return sql;
  }

  // Oracle: use PL/SQL block to check existence before CREATE TABLE
  protected getCreateTablePrefix(tableName: string): string {
    const q = this.quoteIdentifier(tableName);
    return `CREATE TABLE ${q}`;
  }

  protected getCreateIndexPrefix(indexName: string, unique: boolean): string {
    const u = unique ? 'UNIQUE ' : '';
    return `CREATE ${u}INDEX ${this.quoteIdentifier(indexName)}`;
  }

  // --- Connection ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const oracledb = await import(/* webpackIgnore: true */ 'oracledb' as string);
      this.oracledb = oracledb.default || oracledb;
      (this.oracledb as { outFormat: number }).outFormat = (this.oracledb as { OUT_FORMAT_OBJECT: number }).OUT_FORMAT_OBJECT;
      (this.oracledb as { autoCommit: boolean }).autoCommit = true;
      // Fetch CLOB columns as strings — without this, oracledb returns Lob objects
      // that carry circular references (ConnectDescription) and break JSON.stringify()
      const DB_TYPE_CLOB = (this.oracledb as { DB_TYPE_CLOB?: number }).DB_TYPE_CLOB;
      if (DB_TYPE_CLOB) {
        (this.oracledb as { fetchAsString: number[] }).fetchAsString = [DB_TYPE_CLOB];
      }

      // Parse oracle:// URI to extract user, password, connectString
      const poolOpts: Record<string, unknown> = {
        poolMax: config.poolSize ?? 10,
        poolMin: 2,
      };
      const uriMatch = config.uri.match(/^oracle:\/\/([^:]+):([^@]+)@(.+)$/);
      if (uriMatch) {
        poolOpts.user = uriMatch[1];
        poolOpts.password = uriMatch[2];
        poolOpts.connectString = uriMatch[3]; // host:port/service
      } else {
        poolOpts.connectString = config.uri;
      }

      this.pool = await (this.oracledb as { createPool(opts: unknown): Promise<unknown> }).createPool(poolOpts);
    } catch (e: unknown) {
      throw new Error(
        `Oracle driver not found. Install it: npm install oracledb\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.pool) {
      await (this.pool as { close(force: number): Promise<void> }).close(0);
      this.pool = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.pool) return false;
    const conn = await (this.pool as { getConnection(): Promise<{ execute(sql: string): Promise<unknown>; close(): Promise<void> }> }).getConnection();
    try {
      await conn.execute('SELECT 1 FROM DUAL');
      return true;
    } finally {
      await conn.close();
    }
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('Oracle not connected. Call connect() first.');
    const release = await this.acquireMutex();
    try {
      const conn = await (this.pool as {
        getConnection(): Promise<{
          execute(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
          close(): Promise<void>;
        }>;
      }).getConnection();
      try {
        const result = await conn.execute(sql, params);
        const rows = result.rows ?? [];
        // oracledb rows may carry internal driver objects (ConnectDescription etc.)
        // with circular references — extract only own enumerable properties
        // Oracle returns UPPERCASE column names — normalize to lowercase
        // This is the Oracle normalizer: same principle as Mongo _id → id
        return rows.map(row => {
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            const clean: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
              clean[k.toLowerCase()] = v;
            }
            return clean as T;
          }
          return row;
        });
      } finally {
        await conn.close();
      }
    } finally {
      release();
    }
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('Oracle not connected. Call connect() first.');
    const release = await this.acquireMutex();
    try {
      const conn = await (this.pool as {
        getConnection(): Promise<{
          execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number }>;
          close(): Promise<void>;
        }>;
      }).getConnection();
      try {
        const result = await conn.execute(sql, params);
        return { changes: result.rowsAffected ?? 0 };
      } finally {
        await conn.close();
      }
    } finally {
      release();
    }
  }

  // Override initSchema to handle Oracle's lack of IF NOT EXISTS
  async initSchema(schemas: import('../core/types.js').EntitySchema[]): Promise<void> {
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

    // For 'update' strategy: create tables only if they don't exist, and
    // ALTER existing ones to add fields that appear in the schema but are
    // missing from the live table.
    for (const schema of schemas) {
      const exists = await this.tableExists(schema.collection);
      if (!exists) {
        const createSql = this.generateCreateTable(schema);
        this.log('DDL', schema.collection, createSql);
        await this.executeRun(createSql, []);
      } else if (strategy === 'update') {
        await this.addMissingColumns(schema);
      }

      // Indexes: check existence before creating
      const indexStatements = this.generateIndexes(schema);
      for (const stmt of indexStatements) {
        try {
          await this.executeRun(stmt, []);
        } catch {
          // Index may already exist — ignore
        }
      }
    }

    // Junction tables
    for (const schema of schemas) {
      for (const [, rel] of Object.entries(schema.relations || {}) as [string, RelationDef][]) {
        if (rel.type === 'many-to-many' && rel.through) {
          const exists = await this.tableExists(rel.through);
          if (exists) continue;

          const targetSchema = schemas.find(s => s.name === rel.target);
          if (!targetSchema) continue;
          const sourceKey = `${schema.name.toLowerCase()}Id`;
          const targetKey = `${rel.target.toLowerCase()}Id`;
          const q = (n: string) => this.quoteIdentifier(n);
          const idType = this.getIdColumnType();
          const ddl = `CREATE TABLE ${q(rel.through)} (
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

  // Oracle returns column names in UPPERCASE by default
  // Override count to handle CNT vs cnt
  async count(schema: import('../core/types.js').EntitySchema, filter: import('../core/types.js').FilterQuery): Promise<number> {
    this.resetParams();
    const effectiveFilter = this.applySoftDeleteFilter(this.applyDiscriminator(filter, schema), schema);
    const where = this.translateFilter(effectiveFilter, schema);
    const table = this.quoteIdentifier(schema.collection);
    const sql = `SELECT COUNT(*) as cnt FROM ${table} WHERE ${where.sql}`;
    this.log('COUNT', schema.collection, { sql, params: where.params });
    const rows = await this.executeQuery<Record<string, unknown>>(sql, where.params);
    if (rows.length === 0) return 0;
    // doExecuteQuery normalizes to lowercase
    const row = rows[0];
    const val = row.cnt ?? row['count(*)'] ?? row.CNT ?? row.COUNT;
    return Number(val) || 0;
  }

  // Oracle column mapping: doExecuteQuery normalizes to lowercase,
  // but camelCase fields (createdAt, updatedAt) arrive as createdat, updatedat.
  // Map lowercase → original camelCase schema field names.
  // IMPORTANT: only copy known fields — Oracle oracledb may attach internal
  // objects (ConnectDescription, etc.) with circular references to result rows
  protected deserializeRow(row: Record<string, unknown>, schema: import('../core/types.js').EntitySchema): Record<string, unknown> {
    if (!row) return row;
    // Build map: lowercase key → schema field name (camelCase)
    const lowerToField: Record<string, string> = { id: 'id', createdat: 'createdAt', updatedat: 'updatedAt' };
    for (const fieldName of Object.keys(schema.fields || {})) {
      lowerToField[fieldName.toLowerCase()] = fieldName;
    }
    for (const [relName] of Object.entries(schema.relations || {})) {
      lowerToField[relName.toLowerCase()] = relName;
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const mapped = lowerToField[key] ?? lowerToField[key.toLowerCase()];
      if (mapped) {
        normalized[mapped] = value;
      }
    }
    return super.deserializeRow(normalized, schema);
  }

  protected getDialectLabel(): string { return 'Oracle'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new OracleDialect();
}

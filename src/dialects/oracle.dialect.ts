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

  // --- Hooks ---

  // Oracle prior to 23c doesn't support IF NOT EXISTS
  protected supportsIfNotExists(): boolean { return false; }
  protected supportsReturning(): boolean { return false; }

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

      this.pool = await (this.oracledb as { createPool(opts: unknown): Promise<unknown> }).createPool({
        connectString: config.uri,
        poolMax: config.poolSize ?? 10,
        poolMin: 2,
      });
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
    const conn = await (this.pool as {
      getConnection(): Promise<{
        execute(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
        close(): Promise<void>;
      }>;
    }).getConnection();
    try {
      const result = await conn.execute(sql, params);
      return result.rows ?? [];
    } finally {
      await conn.close();
    }
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.pool) throw new Error('Oracle not connected. Call connect() first.');
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

    // For 'update' strategy: create tables only if they don't exist
    for (const schema of schemas) {
      const exists = await this.tableExists(schema.collection);
      if (!exists) {
        const createSql = this.generateCreateTable(schema);
        this.log('DDL', schema.collection, createSql);
        await this.executeRun(createSql, []);
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
      for (const [, rel] of Object.entries(schema.relations) as [string, RelationDef][]) {
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

  protected getDialectLabel(): string { return 'Oracle'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new OracleDialect();
}

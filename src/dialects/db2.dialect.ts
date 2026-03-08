// IBM DB2 Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.DB2Dialect (Hibernate ORM 6.4)
// Driver: npm install ibm_db
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
// Type Mapping — DAL FieldType → DB2 column type
// ============================================================

const DB2_TYPE_MAP: Record<string, string> = {
  string:  'VARCHAR(4000)',
  number:  'DOUBLE',
  boolean: 'BOOLEAN',
  date:    'TIMESTAMP',
  json:    'CLOB',
  array:   'CLOB',
};

// ============================================================
// DB2Dialect
// ============================================================

class DB2Dialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'db2';
  private conn: unknown = null;
  private ibmDb: unknown = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(_index: number): string {
    return '?';
  }

  fieldToSqlType(field: FieldDef): string {
    return DB2_TYPE_MAP[field.type] || 'VARCHAR(4000)';
  }

  getIdColumnType(): string {
    return 'VARCHAR(36)';
  }

  getTableListQuery(): string {
    return "SELECT tabname as name FROM syscat.tables WHERE tabschema = CURRENT SCHEMA AND type = 'T'";
  }

  // --- Hooks ---

  // DB2 11.5+ supports IF NOT EXISTS, but we stay safe
  protected supportsIfNotExists(): boolean { return false; }
  protected supportsReturning(): boolean { return false; }

  protected serializeBoolean(v: boolean): unknown { return v; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === true || v === 1 || v === '1' || v === 'true';
  }

  /** DB2 LIKE is case-sensitive — use UPPER() for case-insensitive search */
  protected buildRegexCondition(col: string, flags?: string): string {
    if (flags?.includes('i')) {
      return `UPPER(${col}) LIKE UPPER(${this.nextPlaceholder()})`;
    }
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  // DB2 uses FETCH FIRST n ROWS ONLY
  protected buildLimitOffset(options?: QueryOptions): string {
    if (!options?.limit && !options?.skip) return '';

    let sql = '';
    if (options.skip) sql += ` OFFSET ${options.skip} ROWS`;
    if (options.limit) sql += ` FETCH FIRST ${options.limit} ROWS ONLY`;
    return sql;
  }

  // DB2: no IF NOT EXISTS, wrap with existence check
  protected getCreateTablePrefix(tableName: string): string {
    return `CREATE TABLE ${this.quoteIdentifier(tableName)}`;
  }

  protected getCreateIndexPrefix(indexName: string, unique: boolean): string {
    const u = unique ? 'UNIQUE ' : '';
    return `CREATE ${u}INDEX ${this.quoteIdentifier(indexName)}`;
  }

  // --- Connection ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      this.ibmDb = await import(/* webpackIgnore: true */ 'ibm_db' as string);
      const open = (this.ibmDb as { open(connStr: string): Promise<unknown> }).open
        || (this.ibmDb as { default: { open(connStr: string): Promise<unknown> } }).default.open;
      this.conn = await open(config.uri);
    } catch (e: unknown) {
      throw new Error(
        `IBM DB2 driver not found. Install it: npm install ibm_db\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.conn) {
      await (this.conn as { close(): Promise<void> }).close();
      this.conn = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.conn) return false;
    const rows = await (this.conn as {
      query(sql: string): Promise<unknown[]>;
    }).query('SELECT 1 FROM SYSIBM.SYSDUMMY1');
    return Array.isArray(rows);
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.conn) throw new Error('DB2 not connected. Call connect() first.');
    return new Promise<T[]>((resolve, reject) => {
      (this.conn as {
        query(sql: string, params: unknown[], cb: (err: Error | null, rows: T[]) => void): void;
      }).query(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows ?? []);
      });
    });
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.conn) throw new Error('DB2 not connected. Call connect() first.');
    return new Promise<{ changes: number }>((resolve, reject) => {
      (this.conn as {
        query(sql: string, params: unknown[], cb: (err: Error | null, result: unknown) => void): void;
      }).query(sql, params, (err) => {
        if (err) reject(err);
        else resolve({ changes: 0 }); // ibm_db doesn't directly return affected rows from query
      });
    });
  }

  // Override initSchema to handle DB2's lack of IF NOT EXISTS
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

    for (const schema of schemas) {
      const exists = await this.tableExists(schema.collection);
      if (!exists) {
        const createSql = this.generateCreateTable(schema);
        this.log('DDL', schema.collection, createSql);
        await this.executeRun(createSql, []);
      }

      const indexStatements = this.generateIndexes(schema);
      for (const stmt of indexStatements) {
        try {
          await this.executeRun(stmt, []);
        } catch {
          // Index may already exist
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

  protected getDialectLabel(): string { return 'DB2'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new DB2Dialect();
}

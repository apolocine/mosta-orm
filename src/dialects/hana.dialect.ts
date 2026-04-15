// SAP HANA Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.HANADialect (Hibernate ORM 6.4)
// Driver: npm install @sap/hana-client
// Author: Dr Hamid MADANI drmdh@msn.com

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  FieldDef,
  RelationDef,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → HANA column type
// ============================================================

const HANA_TYPE_MAP: Record<string, string> = {
  string:  'NVARCHAR(5000)',
  text:    'NCLOB',
  number:  'DOUBLE',
  boolean: 'BOOLEAN',
  date:    'TIMESTAMP',
  json:    'NCLOB',
  array:   'NCLOB',
};

// ============================================================
// HANADialect
// ============================================================

class HANADialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'hana';
  private conn: unknown = null;
  private hanaClient: unknown = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    return `"${name}"`;
  }

  getPlaceholder(_index: number): string {
    return '?';
  }

  fieldToSqlType(field: FieldDef): string {
    return HANA_TYPE_MAP[field.type] || 'NVARCHAR(5000)';
  }

  getIdColumnType(): string {
    return 'NVARCHAR(36)';
  }

  getTableListQuery(): string {
    return "SELECT table_name as name FROM tables WHERE schema_name = CURRENT_SCHEMA";
  }

  /**
   * HANA supports `CASCADE` on DROP but not `IF EXISTS`. Catch error 259
   * "invalid table name" so calling drop on a missing table is a no-op.
   */
  async dropTable(tableName: string): Promise<void> {
    try {
      await this.executeRun(`DROP TABLE ${this.quoteIdentifier(tableName)} CASCADE`, []);
      this.log('DROP_TABLE', tableName);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (/invalid table name|not found|259/i.test(msg)) {
        this.log('DROP_TABLE_SKIP', tableName, 'not found');
        return;
      }
      throw e;
    }
  }

  // --- Hooks ---

  // HANA doesn't support IF NOT EXISTS for tables
  protected supportsIfNotExists(): boolean { return false; }
  protected supportsReturning(): boolean { return false; }

  protected serializeBoolean(v: boolean): unknown { return v; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === true || v === 1 || v === '1' || v === 'TRUE' || v === 'true';
  }

  /** HANA LIKE is case-sensitive — use UPPER() for case-insensitive search */
  protected buildRegexCondition(col: string, flags?: string): string {
    if (flags?.includes('i')) {
      return `UPPER(${col}) LIKE UPPER(${this.nextPlaceholder()})`;
    }
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  // HANA supports LIMIT/OFFSET natively
  // (default buildLimitOffset from AbstractSqlDialect works)

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
      this.hanaClient = await import(/* webpackIgnore: true */ '@sap/hana-client' as string);
      const createConnection = (this.hanaClient as { createConnection(): unknown }).createConnection
        || (this.hanaClient as { default: { createConnection(): unknown } }).default.createConnection;
      this.conn = createConnection();

      await new Promise<void>((resolve, reject) => {
        (this.conn as { connect(opts: unknown, cb: (err: Error | null) => void): void }).connect(
          this.parseHanaUri(config.uri),
          (err) => err ? reject(err) : resolve()
        );
      });
    } catch (e: unknown) {
      throw new Error(
        `SAP HANA driver not found. Install it: npm install @sap/hana-client\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.conn) {
      await new Promise<void>((resolve) => {
        (this.conn as { disconnect(cb: () => void): void }).disconnect(() => resolve());
      });
      this.conn = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.conn) return false;
    const rows = await this.executeQuery('SELECT 1 FROM DUMMY', []);
    return Array.isArray(rows);
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.conn) throw new Error('HANA not connected. Call connect() first.');
    return new Promise<T[]>((resolve, reject) => {
      (this.conn as {
        exec(sql: string, params: unknown[], cb: (err: Error | null, rows: T[]) => void): void;
      }).exec(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows ?? []);
      });
    });
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.conn) throw new Error('HANA not connected. Call connect() first.');
    return new Promise<{ changes: number }>((resolve, reject) => {
      (this.conn as {
        exec(sql: string, params: unknown[], cb: (err: Error | null, affectedRows: number) => void): void;
      }).exec(sql, params, (err, affectedRows) => {
        if (err) reject(err);
        else resolve({ changes: affectedRows ?? 0 });
      });
    });
  }

  // Override initSchema to handle HANA's lack of IF NOT EXISTS
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
      } else if (strategy === 'update') {
        await this.addMissingColumns(schema);
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

  private parseHanaUri(uri: string): Record<string, unknown> {
    try {
      const url = new URL(uri.replace(/^hana:/, 'http:'));
      return {
        serverNode: `${url.hostname || 'localhost'}:${url.port || 30015}`,
        uid: url.username || 'SYSTEM',
        pwd: url.password || '',
        databaseName: url.pathname.replace(/^\//, '') || undefined,
      };
    } catch {
      return { serverNode: 'localhost:30015' };
    }
  }

  protected getDialectLabel(): string { return 'HANA'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new HANADialect();
}

// Google Cloud Spanner Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.SpannerDialect (Hibernate ORM 6.4)
// Driver: npm install @google-cloud/spanner
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
// Type Mapping — DAL FieldType → Spanner column type
// ============================================================

const SPANNER_TYPE_MAP: Record<string, string> = {
  string:  'STRING(MAX)',
  text:    'STRING(MAX)',
  number:  'FLOAT64',
  boolean: 'BOOL',
  date:    'TIMESTAMP',
  json:    'JSON',
  array:   'JSON',
};

// ============================================================
// SpannerDialect
// ============================================================

class SpannerDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'spanner';
  private instance: unknown = null;
  private database: unknown = null;
  private spannerClient: unknown = null;

  // Spanner does NOT support SAVEPOINTs — nested transactions must be
  // flattened by the caller. Return null → beginTx will throw a clear error.
  protected savepointBeginSql(_name: string): string | null { return null; }
  protected savepointReleaseSql(_name: string): string | null { return null; }
  protected savepointRollbackSql(_name: string): string | null { return null; }

  // --- Abstract implementations ---

  // Spanner uses backtick quoting
  quoteIdentifier(name: string): string {
    return `\`${name}\``;
  }

  // Spanner uses @p1, @p2, ... for named parameters
  getPlaceholder(index: number): string {
    return `@p${index}`;
  }

  fieldToSqlType(field: FieldDef): string {
    return SPANNER_TYPE_MAP[field.type] || 'STRING(MAX)';
  }

  getIdColumnType(): string {
    return 'STRING(36)';
  }

  getTableListQuery(): string {
    return "SELECT table_name as name FROM information_schema.tables WHERE table_schema = ''";
  }

  /**
   * Spanner has no `IF EXISTS` and no `CASCADE` on DROP. Indexes and
   * referencing FK constraints must be dropped beforehand. Catch
   * "Table not found" so a missing table is a no-op like other dialects.
   */
  async dropTable(tableName: string): Promise<void> {
    try {
      await this.executeRun(`DROP TABLE ${this.quoteIdentifier(tableName)}`, []);
      this.log('DROP_TABLE', tableName);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (/not found|not exist/i.test(msg)) {
        this.log('DROP_TABLE_SKIP', tableName, 'not found');
        return;
      }
      throw e;
    }
  }

  // --- Hooks ---

  // Spanner doesn't support IF NOT EXISTS
  protected supportsIfNotExists(): boolean { return false; }
  protected supportsReturning(): boolean { return false; }

  protected serializeBoolean(v: boolean): unknown { return v; }
  protected deserializeBoolean(v: unknown): boolean {
    return v === true || v === 1 || v === '1';
  }

  /** Spanner LIKE is case-sensitive — use LOWER() for case-insensitive search */
  protected buildRegexCondition(col: string, flags?: string): string {
    if (flags?.includes('i')) {
      return `LOWER(${col}) LIKE LOWER(${this.nextPlaceholder()})`;
    }
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  // Spanner supports LIMIT/OFFSET natively
  // (default buildLimitOffset from AbstractSqlDialect works)

  protected getCreateTablePrefix(tableName: string): string {
    return `CREATE TABLE ${this.quoteIdentifier(tableName)}`;
  }

  protected getCreateIndexPrefix(indexName: string, unique: boolean): string {
    const u = unique ? 'UNIQUE ' : '';
    return `CREATE ${u}INDEX ${this.quoteIdentifier(indexName)}`;
  }

  // Spanner requires PRIMARY KEY as a separate clause, not inline
  protected generateCreateTable(schema: import('../core/types.js').EntitySchema): string {
    const q = (name: string) => this.quoteIdentifier(name);
    const cols: string[] = [`  ${q('id')} ${this.getIdColumnType()} NOT NULL`];

    for (const [name, field] of Object.entries(schema.fields || {}) as [string, FieldDef][]) {
      let colDef = `  ${q(name)} ${this.fieldToSqlType(field)}`;
      if (field.required) colDef += ' NOT NULL';
      // Spanner doesn't support UNIQUE in column definition — use unique index
      // Spanner doesn't support DEFAULT
      cols.push(colDef);
    }

    for (const [name, rel] of Object.entries(schema.relations || {}) as [string, RelationDef][]) {
      if (rel.type === 'many-to-many') continue;
      if (rel.type === 'one-to-many') {
        cols.push(`  ${q(name)} ${this.fieldToSqlType({ type: 'json' })}`);
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

    // Spanner: PRIMARY KEY is outside column definitions
    return `CREATE TABLE ${q(schema.collection)} (\n${cols.join(',\n')}\n) PRIMARY KEY (${q('id')})`;
  }

  // --- Connection ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      const spannerModule = await import(/* webpackIgnore: true */ '@google-cloud/spanner' as string);
      const Spanner = spannerModule.default?.Spanner || spannerModule.Spanner;

      // URI format: spanner://project/instance/database
      const parsed = this.parseSpannerUri(config.uri);

      this.spannerClient = new Spanner({ projectId: parsed.projectId });
      this.instance = (this.spannerClient as { instance(name: string): unknown }).instance(parsed.instanceId);
      this.database = (this.instance as { database(name: string): unknown }).database(parsed.databaseId);
    } catch (e: unknown) {
      throw new Error(
        `Google Cloud Spanner driver not found. Install it: npm install @google-cloud/spanner\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async doDisconnect(): Promise<void> {
    if (this.database) {
      await (this.database as { close(): Promise<void> }).close();
      this.database = null;
      this.instance = null;
    }
    if (this.spannerClient) {
      await (this.spannerClient as { close(): Promise<void> }).close();
      this.spannerClient = null;
    }
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.database) return false;
    try {
      const [rows] = await (this.database as {
        run(query: { sql: string }): Promise<[unknown[]]>;
      }).run({ sql: 'SELECT 1' });
      return Array.isArray(rows);
    } catch {
      return false;
    }
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!this.database) throw new Error('Spanner not connected. Call connect() first.');

    // Build named params object: { p1: val1, p2: val2, ... }
    const namedParams: Record<string, unknown> = {};
    for (let i = 0; i < params.length; i++) {
      namedParams[`p${i + 1}`] = params[i];
    }

    const [rows] = await (this.database as {
      run(query: { sql: string; params: Record<string, unknown> }): Promise<[Array<{ toJSON(): T }>]>;
    }).run({ sql, params: namedParams });

    // Spanner returns Row objects — convert to plain objects
    return rows.map(row => {
      if (typeof (row as { toJSON?: () => T }).toJSON === 'function') {
        return (row as { toJSON(): T }).toJSON();
      }
      return row as T;
    });
  }

  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    if (!this.database) throw new Error('Spanner not connected. Call connect() first.');

    // For DML operations, Spanner requires using transactions
    let changes = 0;
    await (this.database as {
      runTransactionAsync(fn: (transaction: {
        runUpdate(opts: { sql: string; params: Record<string, unknown> }): Promise<[number]>;
        commit(): Promise<void>;
      }) => Promise<void>): Promise<void>;
    }).runTransactionAsync(async (transaction) => {
      const namedParams: Record<string, unknown> = {};
      for (let i = 0; i < params.length; i++) {
        namedParams[`p${i + 1}`] = params[i];
      }

      // DDL statements (CREATE TABLE, CREATE INDEX) go through updateSchema
      if (sql.trimStart().toUpperCase().startsWith('CREATE') || sql.trimStart().toUpperCase().startsWith('DROP')) {
        await transaction.commit();
        await this.executeDdl(sql);
        return;
      }

      const [count] = await transaction.runUpdate({ sql, params: namedParams });
      changes = count;
      await transaction.commit();
    });

    return { changes };
  }

  /** Execute DDL statements (CREATE TABLE, etc.) via updateSchema */
  private async executeDdl(sql: string): Promise<void> {
    const [operation] = await (this.database as {
      updateSchema(statements: string[]): Promise<[{ promise(): Promise<void> }]>;
    }).updateSchema([sql]);
    await operation.promise();
  }

  // Override initSchema for Spanner's DDL requirements
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

    // Batch DDL statements for Spanner (more efficient)
    const ddlStatements: string[] = [];

    for (const schema of schemas) {
      const exists = await this.tableExists(schema.collection);
      if (!exists) {
        ddlStatements.push(this.generateCreateTable(schema));
      } else if (strategy === 'update') {
        // ALTER TABLE statements run individually (executeRun) — outside the
        // batched DDL because they're cheap and we want introspection to be
        // current when building each ALTER.
        await this.addMissingColumns(schema);
      }

      const indexStatements = this.generateIndexes(schema);
      ddlStatements.push(...indexStatements);
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
          ddlStatements.push(`CREATE TABLE ${q(rel.through)} (
  ${q(sourceKey)} ${idType} NOT NULL,
  ${q(targetKey)} ${idType} NOT NULL
) PRIMARY KEY (${q(sourceKey)}, ${q(targetKey)})`);
        }
      }
    }

    if (ddlStatements.length > 0) {
      this.log('DDL_BATCH', 'all', ddlStatements);
      try {
        const [operation] = await (this.database as {
          updateSchema(statements: string[]): Promise<[{ promise(): Promise<void> }]>;
        }).updateSchema(ddlStatements);
        await operation.promise();
      } catch (e: unknown) {
        // Some statements may fail if objects already exist
        this.log('DDL_BATCH_WARN', 'partial', (e as Error).message);
      }
    }
  }

  private parseSpannerUri(uri: string): { projectId: string; instanceId: string; databaseId: string } {
    // Format: spanner://project/instance/database
    const cleaned = uri.replace(/^spanner:\/\//, '');
    const parts = cleaned.split('/');
    return {
      projectId: parts[0] || 'my-project',
      instanceId: parts[1] || 'my-instance',
      databaseId: parts[2] || 'my-database',
    };
  }

  protected getDialectLabel(): string { return 'Spanner'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new SpannerDialect();
}

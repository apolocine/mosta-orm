import type { IDialect, DialectType, ConnectionConfig, EntitySchema, FieldDef, FilterQuery as DALFilter, QueryOptions, AggregateStage, TxHandle } from '../core/types.js';
interface WhereClause {
    sql: string;
    params: unknown[];
}
export declare abstract class AbstractSqlDialect implements IDialect {
    abstract readonly dialectType: DialectType;
    /** Quote an identifier (column/table name) for this dialect */
    abstract quoteIdentifier(name: string): string;
    /**
     * Applique `config.tablePrefix` (si défini) à un nom logique. À utiliser
     * SYSTÉMATIQUEMENT côté dialect avant `quoteIdentifier()` pour toute
     * référence physique à une table — y compris junction tables (m2m through),
     * tableExists(), CREATE TABLE / DROP TABLE / ALTER TABLE / CREATE INDEX,
     * et toute clause `FROM x` / `INSERT INTO x` / `UPDATE x` / `DELETE FROM x`.
     *
     * Lecture seule (ne touche pas à `schema.collection`) : permet aux schémas
     * register de rester portables — seul le SQL physique est préfixé.
     * Backward-compatible : si tablePrefix est undefined ou vide, retourne `name`
     * inchangé.
     */
    protected getPrefixedName(name: string): string;
    /** Get the parameter placeholder for index (1-based). E.g. $1, ?, :1, @p1 */
    abstract getPlaceholder(index: number): string;
    /** Map a DAL FieldDef to the native SQL column type */
    abstract fieldToSqlType(field: FieldDef): string;
    /** Get the SQL column type for the primary key (id) column */
    abstract getIdColumnType(): string;
    /** Execute a SELECT query via the dialect's native driver (npm) */
    abstract doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    /** Execute a non-SELECT statement via the dialect's native driver (npm) */
    abstract doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
    /** Execute a SELECT query — routes to JDBC bridge or native driver */
    executeQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    /** Execute a non-SELECT statement — routes to JDBC bridge or native driver */
    executeRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
    /** Establish the actual database connection */
    abstract doConnect(config: ConnectionConfig): Promise<void>;
    /** Close the actual database connection */
    abstract doDisconnect(): Promise<void>;
    /** Test the connection is alive */
    abstract doTestConnection(): Promise<boolean>;
    /** Return a SQL query that lists table names. Result rows must have a 'name' column. */
    abstract getTableListQuery(): string;
    /**
     * List existing column names for a table. Default uses ANSI
     * `information_schema.columns` (Postgres, MySQL, MariaDB, MSSQL, HSQLDB,
     * Spanner, CockroachDB). Oracle / SQLite / DB2 override with their native
     * catalog views.
     */
    protected getExistingColumns(tableName: string): Promise<Set<string>>;
    protected config: ConnectionConfig | null;
    protected schemas: EntitySchema[];
    protected showSql: boolean;
    protected formatSql: boolean;
    protected highlightEnabled: boolean;
    private paramCounter;
    private bridgeInstance;
    private jdbcBridgeActive;
    /** Whether this dialect supports CREATE TABLE IF NOT EXISTS */
    protected supportsIfNotExists(): boolean;
    /** Whether this dialect supports RETURNING clause on INSERT */
    protected supportsReturning(): boolean;
    /**
     * Certains dialects (SQLite) ne supportent pas
     * `ALTER TABLE … ADD CONSTRAINT FOREIGN KEY` — les FK doivent être
     * déclarées dans le `CREATE TABLE` initial. Override à `false` dans
     * ces dialects pour basculer en mode FK in-line.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §6.
     */
    protected supportsAlterTableAddForeignKey(): boolean;
    /**
     * Certains dialects (MySQL ≤ 8.x, MariaDB) ne supportent pas
     * `CREATE UNIQUE INDEX … WHERE …` (partial unique index).
     * Override à `false` dans ces dialects ; les `sparse: true` sur softDelete
     * seront alors loggés en warning au lieu d'émettre le WHERE.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §10.
     */
    protected supportsPartialIndex(): boolean;
    /** Serialize a JS boolean to a DB value (default: 1/0) */
    protected serializeBoolean(v: boolean): unknown;
    /** Deserialize a DB value to a JS boolean */
    protected deserializeBoolean(v: unknown): boolean;
    /** Build the LIMIT/OFFSET clause (dialect-specific override) */
    protected buildLimitOffset(options?: QueryOptions): string;
    /** Get the CREATE TABLE prefix, including IF NOT EXISTS when supported */
    protected getCreateTablePrefix(tableName: string): string;
    /** Get the CREATE INDEX prefix, including IF NOT EXISTS when supported */
    protected getCreateIndexPrefix(indexName: string, unique: boolean): string;
    /** Execute a CREATE INDEX statement — overridable for dialects needing try/catch */
    protected executeIndexStatement(stmt: string): Promise<void>;
    /**
     * Dialect-specific override hook — SQL syntax for starting a transaction.
     * Most engines accept plain `BEGIN`; Oracle/DB2 use autocommit=off instead.
     * Override in a concrete dialect for non-standard syntax.
     */
    protected beginSql(opts?: {
        isolation?: string;
    }): string | null;
    /** Dialect-specific override — returns null to skip (engine without explicit BEGIN). */
    protected commitSql(): string | null;
    protected rollbackSql(): string | null;
    /** Emit a SAVEPOINT statement. Return null to signal "no savepoint support". */
    protected savepointBeginSql(name: string): string | null;
    /** Release a savepoint (= nested commit). `null` means auto-release on successful path. */
    protected savepointReleaseSql(name: string): string | null;
    /** Rollback to a savepoint (= nested rollback). */
    protected savepointRollbackSql(name: string): string | null;
    /** Stack of active transaction levels — for nested-transaction bookkeeping. */
    private txStack;
    /**
     * **Manual transaction API (public, since 1.11.0).**
     *
     * Opens a transaction and returns an opaque handle. Supports nesting :
     * the outermost call emits a real `BEGIN` ; subsequent nested calls emit
     * a `SAVEPOINT` (which all SQL engines except Spanner support). Pair
     * every `beginTx()` with exactly one `commitTx(tx)` or `rollbackTx(tx)`
     * in LIFO order.
     */
    beginTx(opts?: {
        isolation?: string;
    }): Promise<TxHandle>;
    commitTx(tx: TxHandle): Promise<void>;
    rollbackTx(tx: TxHandle): Promise<void>;
    /**
     * Run `cb` inside a BEGIN/COMMIT/ROLLBACK block. The same dialect instance
     * is passed to `cb` — all queries keep working without modification.
     *
     * Implementation detail : since 1.11.0 this delegates to the manual API
     * (`beginTx` / `commitTx` / `rollbackTx`) so that dialects only need to
     * override one of them to get both flavours consistent.
     *
     * For single-connection dialects (SQLite, HSQLDB embedded) this is strictly
     * ACID. For pool-based dialects (Postgres, MySQL, …) this serialises
     * correctly when `poolSize: 1`, and best-effort with a larger pool (queries
     * may land on different connections). Concrete dialects should override to
     * implement client checkout for strict correctness.
     */
    $transaction<T>(cb: (tx: IDialect) => Promise<T>, opts?: {
        isolation?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
    }): Promise<T>;
    /** Serialize date values to a format suitable for this dialect */
    protected serializeDate(value: unknown): unknown;
    /** Serialize JSON/array values */
    protected serializeJson(value: unknown): unknown;
    /**
     * Build a regex/LIKE condition. Override for case-sensitive dialects.
     * Default: LIKE (case-insensitive in MySQL, SQLite, MSSQL; case-sensitive in Postgres, Oracle, DB2, HANA).
     * Postgres overrides to use ILIKE when flags contain 'i'.
     */
    protected buildRegexCondition(col: string, flags?: string): string;
    /** Dialect label for logging */
    protected getDialectLabel(): string;
    protected log(operation: string, table: string, details?: unknown): void;
    /** Reset the parameter counter (call before building a new statement) */
    protected resetParams(): void;
    /** Get the next placeholder and increment the counter */
    protected nextPlaceholder(): string;
    protected serializeValue(value: unknown, field?: FieldDef): unknown;
    protected deserializeRow(row: Record<string, unknown>, schema: EntitySchema): Record<string, unknown>;
    protected deserializeField(val: unknown, field: FieldDef): unknown;
    /**
     * Inject discriminator filter into any query.
     * If the schema has discriminator + discriminatorValue, adds: AND _type = 'article'
     */
    protected applyDiscriminator(filter: DALFilter, schema: EntitySchema): DALFilter;
    /**
     * Inject discriminator field into INSERT data.
     * If the schema has discriminator + discriminatorValue, adds _type: 'article' to the row.
     */
    protected applyDiscriminatorToData(data: Record<string, unknown>, schema: EntitySchema): Record<string, unknown>;
    /**
     * Add discriminator column to CREATE TABLE DDL if schema uses single-table inheritance.
     */
    protected getDiscriminatorColumnDDL(schema: EntitySchema): string | null;
    /**
     * Inject soft-delete filter: WHERE deletedAt IS NULL
     * Automatically applied to find/count/distinct/search queries.
     *
     * Bypass explicite : `options.includeDeleted === true` retourne le filter
     * inchangé (les lignes soft-deletées sont alors visibles).
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §1.
     */
    protected applySoftDeleteFilter(filter: DALFilter, schema: EntitySchema, options?: {
        includeDeleted?: boolean;
    }): DALFilter;
    protected translateFilter(filter: DALFilter, schema: EntitySchema): WhereClause;
    protected serializeForFilter(value: unknown, fieldName: string, schema: EntitySchema): unknown;
    protected buildSelectColumns(schema: EntitySchema, options?: QueryOptions): string;
    protected getAllColumns(schema: EntitySchema): string[];
    protected buildOrderBy(options?: QueryOptions): string;
    protected prepareInsertData(schema: EntitySchema, data: Record<string, unknown>): {
        columns: string[];
        placeholders: string[];
        values: unknown[];
    };
    protected prepareUpdateData(schema: EntitySchema, data: Record<string, unknown>): {
        setClauses: string[];
        values: unknown[];
    };
    protected generateCreateTable(schema: EntitySchema, allSchemas?: EntitySchema[]): string;
    /**
     * Ensemble des colonnes physiques d'un schéma, dans le même référentiel que
     * `generateCreateTable` / `addMissingColumns` : `id`, les `fields`, les
     * colonnes FK (`joinColumn` des relations M2O/O2O), et les colonnes système
     * (`createdAt`/`updatedAt` si `timestamps`, `deletedAt` si `softDelete`, la
     * colonne discriminator si `discriminator`). Sert à valider qu'un champ
     * d'index pointe une colonne réelle AVANT d'émettre le DDL — sinon le
     * `CREATE INDEX` échoue ("no such column") et avorte tout l'initSchema.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §18.
     */
    protected getKnownColumns(schema: EntitySchema): Set<string>;
    protected generateIndexes(schema: EntitySchema): string[];
    connect(config: ConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(): Promise<boolean>;
    /**
     * Execute a SELECT query via the JDBC bridge.
     * Called transparently when jdbcBridgeActive is true.
     */
    protected bridgeExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    /**
     * Execute a non-SELECT statement via the JDBC bridge.
     * Called transparently when jdbcBridgeActive is true.
     */
    protected bridgeExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
    /** Whether the JDBC bridge is active for this dialect instance */
    protected get isJdbcBridgeActive(): boolean;
    /**
     * For an existing table, add any fields/relations that are declared in the
     * schema but missing from the live table. Works in `update` strategy.
     * Skipped silently if the dialect can't list its columns (best-effort).
     */
    protected addMissingColumns(schema: EntitySchema): Promise<void>;
    initSchema(schemas: EntitySchema[]): Promise<void>;
    /**
     * Generate FK constraints for M2O/O2O relations and junction tables.
     *
     * Sur les dialects sans support ALTER TABLE ADD CONSTRAINT FK (SQLite),
     * les FK sont déjà déclarées in-line dans `generateCreateTable` — on skip
     * cette phase pour éviter une avalanche d'erreurs swallowed.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §6.
     */
    protected generateForeignKeys(schemas: EntitySchema[]): Promise<void>;
    find<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T[]>;
    findOne<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T | null>;
    findById<T>(schema: EntitySchema, id: string, options?: QueryOptions): Promise<T | null>;
    create<T>(schema: EntitySchema, data: Record<string, unknown>): Promise<T>;
    update<T>(schema: EntitySchema, id: string, data: Record<string, unknown>): Promise<T | null>;
    updateMany(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<number>;
    delete(schema: EntitySchema, id: string): Promise<boolean>;
    deleteMany(schema: EntitySchema, filter: DALFilter): Promise<number>;
    count(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<number>;
    distinct(schema: EntitySchema, field: string, filter: DALFilter, options?: QueryOptions): Promise<unknown[]>;
    aggregate<T>(schema: EntitySchema, stages: AggregateStage[], options?: QueryOptions): Promise<T[]>;
    /**
     * Get relations that should be eagerly loaded.
     *
     * Default = `lazy` pour TOUTES les relations (M2O, O2O, O2M, M2M).
     * Le caller doit explicitement opt-in via `rel.fetch = 'eager'` pour
     * qu'une relation soit auto-populée à la lecture.
     *
     * Aligne `@mostajs/orm` sur le comportement moderne (Prisma, Drizzle,
     * TypeORM 0.3+, MikroORM, SQLAlchemy) — opposé au comportement Hibernate
     * historique EAGER par défaut pour M2O (anti-pattern documenté).
     *
     * Migration depuis < v2.0 : si tu dépendais du populate auto M2O/O2O,
     * passe `findByIdWithRelations(id, ['project', 'contact'])` ou marque
     * la relation `fetch: 'eager'` dans son EntitySchema.
     */
    protected getEagerRelations(schema: EntitySchema): string[];
    findWithRelations<T>(schema: EntitySchema, filter: DALFilter, relations: string[], options?: QueryOptions): Promise<T[]>;
    findByIdWithRelations<T>(schema: EntitySchema, id: string, relations: string[], options?: QueryOptions): Promise<T | null>;
    private populateRelations;
    upsert<T>(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<T>;
    increment(schema: EntitySchema, id: string, field: string, amount: number): Promise<Record<string, unknown>>;
    addToSet(schema: EntitySchema, id: string, field: string, value: unknown): Promise<Record<string, unknown> | null>;
    pull(schema: EntitySchema, id: string, field: string, value: unknown): Promise<Record<string, unknown> | null>;
    search<T>(schema: EntitySchema, query: string, fields: string[], options?: QueryOptions): Promise<T[]>;
    /**
     * Check if a table exists. Accepts the logical name (`schema.collection` ou
     * `rel.through`) — applique `tablePrefix` en interne avant la comparaison
     * avec le catalogue du dialect.
     */
    protected tableExists(tableName: string): Promise<boolean>;
    /** Drop all tables (used by 'create' and 'create-drop' strategies) */
    /** Truncate (empty) a single table — keeps structure, deletes all data */
    truncateTable(tableName: string): Promise<void>;
    /** Truncate all registered schema tables — junction tables first, then entities */
    truncateAll(schemas: import('../core/types.js').EntitySchema[]): Promise<string[]>;
    /**
     * SQL string to drop a single table — dialect-specific so subclasses can
     * adapt the CASCADE keyword (Postgres/MySQL : CASCADE, Oracle : CASCADE
     * CONSTRAINTS, SQLite : pas de CASCADE supporté du tout).
     */
    protected getDropTableSql(tableName: string): string;
    /** Drop a single table by name */
    dropTable(tableName: string): Promise<void>;
    /** Drop all tables in the database (dangerous) */
    dropAllTables(): Promise<void>;
    /** Drop tables for registered schemas + their junction tables */
    dropSchema(schemas: import('../core/types.js').EntitySchema[]): Promise<string[]>;
}
export {};

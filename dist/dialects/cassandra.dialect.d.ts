import type { IDialect, DialectType, ConnectionConfig, EntitySchema, FieldDef, QueryOptions } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
interface CassClient {
    connect(): Promise<void>;
    execute(query: string, params?: unknown[], options?: Record<string, unknown>): Promise<{
        rows: Record<string, unknown>[];
    }>;
    shutdown(): Promise<void>;
}
export declare class CassandraDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    db: CassClient | null;
    private keyspace;
    quoteIdentifier(name: string): string;
    getPlaceholder(_index: number): string;
    fieldToSqlType(field: FieldDef): string;
    getIdColumnType(): string;
    getTableListQuery(): string;
    protected getExistingColumns(tableName: string): Promise<Set<string>>;
    protected supportsIfNotExists(): boolean;
    protected supportsReturning(): boolean;
    protected supportsAlterTableAddForeignKey(): boolean;
    protected supportsPartialIndex(): boolean;
    protected serializeBoolean(v: boolean): unknown;
    protected deserializeBoolean(v: unknown): boolean;
    protected serializeDate(value: unknown): unknown;
    /** CQL n'a pas d'ILIKE/regex serveur ; LIKE nécessite un index SASI. On reste sur LIKE. */
    protected buildRegexCondition(col: string, _flags?: string): string;
    protected buildLimitOffset(options?: QueryOptions): string;
    protected buildOrderBy(): string;
    protected generateIndexes(): string[];
    protected generateCreateTable(schema: EntitySchema): string;
    protected getDropTableSql(tableName: string): string;
    private normalizeRow;
    doConnect(config: ConnectionConfig): Promise<void>;
    doDisconnect(): Promise<void>;
    doTestConnection(): Promise<boolean>;
    /** CQL n'accepte pas la tautologie `WHERE 1=1` émise pour les filtres vides. */
    private stripTautology;
    /** Ajoute ALLOW FILTERING aux SELECT filtrés sur colonne non-clé. */
    private withAllowFiltering;
    doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
}
export declare function createDialect(): IDialect;
export {};

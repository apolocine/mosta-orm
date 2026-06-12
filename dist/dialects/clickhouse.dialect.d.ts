import type { IDialect, DialectType, ConnectionConfig, EntitySchema, FieldDef } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
/** Forme minimale du client @clickhouse/client. */
interface ChClient {
    query(p: {
        query: string;
        query_params?: Record<string, unknown>;
        format?: string;
    }): Promise<{
        json<T>(): Promise<T>;
    }>;
    command(p: {
        query: string;
        query_params?: Record<string, unknown>;
    }): Promise<unknown>;
    ping(): Promise<{
        success: boolean;
    }>;
    close(): Promise<void>;
}
export declare class ClickHouseDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    db: ChClient | null;
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
    /** ClickHouse DateTime : 'YYYY-MM-DD HH:MM:SS' (UTC). Gère les sentinels "now". */
    protected serializeDate(value: unknown): unknown;
    /** insensible à la casse : ClickHouse a ILIKE. */
    protected buildRegexCondition(col: string, flags?: string): string;
    protected generateIndexes(): string[];
    protected generateCreateTable(schema: EntitySchema): string;
    protected getDropTableSql(tableName: string): string;
    private bind;
    /** Réécrit UPDATE/DELETE en mutations ClickHouse (ALTER TABLE … UPDATE/DELETE). */
    private toMutation;
    doConnect(config: ConnectionConfig): Promise<void>;
    doDisconnect(): Promise<void>;
    doTestConnection(): Promise<boolean>;
    doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
}
export declare function createDialect(): IDialect;
export {};

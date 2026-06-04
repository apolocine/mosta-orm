import type { IDialect, DialectType, ConnectionConfig, FieldDef, QueryOptions } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
export declare class MSSQLDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    protected pool: unknown;
    protected beginSql(opts?: {
        isolation?: string;
    }): string | null;
    protected savepointBeginSql(name: string): string | null;
    protected savepointReleaseSql(_name: string): string | null;
    protected savepointRollbackSql(name: string): string | null;
    quoteIdentifier(name: string): string;
    getPlaceholder(index: number): string;
    fieldToSqlType(field: FieldDef): string;
    getIdColumnType(): string;
    getTableListQuery(): string;
    protected supportsIfNotExists(): boolean;
    protected supportsReturning(): boolean;
    protected serializeBoolean(v: boolean): unknown;
    protected deserializeBoolean(v: unknown): boolean;
    protected buildLimitOffset(options?: QueryOptions): string;
    protected getCreateTablePrefix(tableName: string): string;
    protected getCreateIndexPrefix(indexName: string, unique: boolean): string;
    doConnect(config: ConnectionConfig): Promise<void>;
    doDisconnect(): Promise<void>;
    doTestConnection(): Promise<boolean>;
    doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
    dropAllTables(): Promise<void>;
    protected getDialectLabel(): string;
}
export declare function createDialect(): IDialect;

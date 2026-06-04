import type { IDialect, DialectType, ConnectionConfig, FieldDef } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
export declare class PostgresDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    protected pool: unknown;
    quoteIdentifier(name: string): string;
    getPlaceholder(index: number): string;
    fieldToSqlType(field: FieldDef): string;
    getIdColumnType(): string;
    getTableListQuery(): string;
    protected supportsIfNotExists(): boolean;
    protected supportsReturning(): boolean;
    protected serializeBoolean(v: boolean): unknown;
    protected deserializeBoolean(v: unknown): boolean;
    /** PostgreSQL LIKE is case-sensitive — use ILIKE when flags contain 'i' */
    protected buildRegexCondition(col: string, flags?: string): string;
    doConnect(config: ConnectionConfig): Promise<void>;
    doDisconnect(): Promise<void>;
    doTestConnection(): Promise<boolean>;
    doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
    protected getDialectLabel(): string;
}
export declare function createDialect(): IDialect;

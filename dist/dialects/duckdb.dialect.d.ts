import type { IDialect, DialectType, ConnectionConfig, FieldDef } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
/** Forme minimale du driver classique `duckdb` (callback-based). */
interface DuckDbDatabase {
    all(sql: string, ...args: unknown[]): void;
    close(cb: (err: Error | null) => void): void;
}
export declare class DuckDBDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    /** Exposé pour accès brut en test. */
    db: DuckDbDatabase | null;
    quoteIdentifier(name: string): string;
    getPlaceholder(_index: number): string;
    fieldToSqlType(field: FieldDef): string;
    getIdColumnType(): string;
    getTableListQuery(): string;
    /** DuckDB expose `information_schema.columns` (ANSI). */
    protected getExistingColumns(tableName: string): Promise<Set<string>>;
    protected supportsIfNotExists(): boolean;
    protected supportsReturning(): boolean;
    protected serializeBoolean(v: boolean): unknown;
    protected deserializeBoolean(v: unknown): boolean;
    /** DuckDB supporte ILIKE (comme PostgreSQL) pour le insensible à la casse. */
    protected buildRegexCondition(col: string, flags?: string): string;
    private allAsync;
    doConnect(config: ConnectionConfig): Promise<void>;
    doDisconnect(): Promise<void>;
    doTestConnection(): Promise<boolean>;
    doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    /**
     * Les instructions DML DuckDB renvoient une ligne unique avec une colonne
     * `Count` (BigInt) = nombre de lignes affectées — on la lit pour `{ changes }`.
     */
    doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
}
export declare function createDialect(): IDialect;
export {};

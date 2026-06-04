import type Database from 'better-sqlite3';
import type { IDialect, DialectType, ConnectionConfig, FieldDef } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
export declare class SQLiteDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    /** Exposed for raw access in tests (same pattern as before refactoring) */
    db: Database.Database | null;
    quoteIdentifier(name: string): string;
    getPlaceholder(_index: number): string;
    fieldToSqlType(field: FieldDef): string;
    getIdColumnType(): string;
    getTableListQuery(): string;
    /** SQLite uses `PRAGMA table_info(name)` — the result column is `name`. */
    protected getExistingColumns(tableName: string): Promise<Set<string>>;
    protected supportsIfNotExists(): boolean;
    protected supportsReturning(): boolean;
    protected serializeBoolean(v: boolean): unknown;
    protected deserializeBoolean(v: unknown): boolean;
    /**
     * SQLite ne supporte pas `ALTER TABLE … ADD CONSTRAINT FOREIGN KEY` —
     * les FK doivent être déclarées dans le `CREATE TABLE` initial.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §6.
     */
    protected supportsAlterTableAddForeignKey(): boolean;
    /**
     * SQLite ne supporte pas la syntaxe `DROP TABLE ... CASCADE` (syntax error).
     * Les FK SQLite sont OFF par défaut et déclarées dans CREATE TABLE — drop
     * d'une table parent ne casse rien automatiquement, donc CASCADE est inutile.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §14.
     */
    protected getDropTableSql(tableName: string): string;
    /**
     * SQLite ne supporte pas la syntaxe ANSI `SET TRANSACTION ISOLATION LEVEL`.
     * Mapping des 4 niveaux ANSI vers les 3 modes SQLite (DEFERRED/IMMEDIATE/EXCLUSIVE).
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §5.
     */
    protected beginSql(opts?: {
        isolation?: string;
    }): string | null;
    doConnect(config: ConnectionConfig): Promise<void>;
    doDisconnect(): Promise<void>;
    doTestConnection(): Promise<boolean>;
    doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
    dropAllTables(): Promise<void>;
}
export declare function createDialect(): IDialect;

import type { IDialect, DialectType, ConnectionConfig, FieldDef } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
export declare class MySQLDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    protected pool: unknown;
    quoteIdentifier(name: string): string;
    getPlaceholder(_index: number): string;
    fieldToSqlType(field: FieldDef): string;
    getIdColumnType(): string;
    getTableListQuery(): string;
    protected supportsIfNotExists(): boolean;
    protected supportsReturning(): boolean;
    /**
     * MySQL/MariaDB ne supportent pas `CREATE UNIQUE INDEX … WHERE …`
     * (partial unique index). Sur ces dialects, `sparse: true` est
     * loggé en warning et la contrainte unique reste globale (réinsertion
     * après soft-delete bloquée par la contrainte).
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §10.
     */
    protected supportsPartialIndex(): boolean;
    /**
     * MySQL/MariaDB : `SET SESSION TRANSACTION ISOLATION LEVEL` doit précéder
     * `START TRANSACTION` (ou `BEGIN`). La syntaxe ANSI par défaut
     * `BEGIN; SET TRANSACTION ISOLATION LEVEL X` produit un ordre invalide
     * (l'isolation set après BEGIN affecte la transaction suivante, pas
     * la transaction en cours).
     *
     * Les 4 niveaux ANSI sont supportés nativement par MySQL/MariaDB.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §5.
     * Audit live amia recommandé pour confirmation.
     */
    protected beginSql(opts?: {
        isolation?: string;
    }): string | null;
    protected getCreateIndexPrefix(indexName: string, unique: boolean): string;
    protected executeIndexStatement(stmt: string): Promise<void>;
    protected serializeDate(value: unknown): unknown;
    protected serializeBoolean(v: boolean): unknown;
    protected deserializeBoolean(v: unknown): boolean;
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

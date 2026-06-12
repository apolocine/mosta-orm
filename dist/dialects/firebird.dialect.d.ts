import type { IDialect, DialectType, ConnectionConfig, EntitySchema, FieldDef, QueryOptions } from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
/** Forme minimale du driver `node-firebird` (callback-based). */
interface FbDatabase {
    query(sql: string, params: unknown[], cb: (err: unknown, result: unknown) => void): void;
    detach(cb?: (err: unknown) => void): void;
}
export declare class FirebirdDialect extends AbstractSqlDialect {
    readonly dialectType: DialectType;
    /** Exposé pour accès brut en test. */
    db: FbDatabase | null;
    quoteIdentifier(name: string): string;
    getPlaceholder(_index: number): string;
    fieldToSqlType(field: FieldDef): string;
    getIdColumnType(): string;
    /** Liste des tables utilisateur via la table système RDB$RELATIONS. */
    getTableListQuery(): string;
    /** Colonnes existantes via RDB$RELATION_FIELDS (introspection pour ALTER ADD COLUMN). */
    protected getExistingColumns(tableName: string): Promise<Set<string>>;
    protected supportsIfNotExists(): boolean;
    protected supportsReturning(): boolean;
    /** Firebird n'a pas d'ILIKE : insensible à la casse via UPPER(col) LIKE UPPER(?). */
    protected buildRegexCondition(col: string, flags?: string): string;
    /**
     * Pagination Firebird : `ROWS <m> TO <n>` (1-based, en SUFFIXE après ORDER BY).
     * Pas de LIMIT/OFFSET avant FB 4. Couvre limit seul, skip seul, et les deux.
     */
    protected buildLimitOffset(options?: QueryOptions): string;
    private queryAsync;
    private toError;
    doConnect(config: ConnectionConfig): Promise<void>;
    doDisconnect(): Promise<void>;
    doTestConnection(): Promise<boolean>;
    doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]>;
    /**
     * node-firebird n'expose pas de compteur d'affected-rows fiable pour les DML
     * (INSERT/UPDATE/DELETE → result généralement undefined ; RETURNING → tableau).
     * LIMITATION connue : updateMany()/deleteMany() peuvent renvoyer un compte approximatif.
     * À revisiter en validation live (parsing isc_info_sql_records ou RETURNING).
     */
    doExecuteRun(sql: string, params: unknown[]): Promise<{
        changes: number;
    }>;
    protected getDropTableSql(tableName: string): string;
    /**
     * Sans `DROP ... CASCADE`, on supprime en PLUSIEURS PASSES pour résoudre l'ordre
     * des clés étrangères (table référençante avant référencée). Idempotent : une
     * erreur (FK bloquante OU table absente) est ignorée et retentée à la passe suivante.
     */
    dropSchema(schemas: EntitySchema[]): Promise<string[]>;
}
export declare function createDialect(): IDialect;
export {};

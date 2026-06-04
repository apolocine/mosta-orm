import type { IRepository, IDialect, EntitySchema, FilterQuery, QueryOptions, AggregateStage } from './types.js';
export declare class BaseRepository<T extends {
    id: string;
}> implements IRepository<T> {
    protected readonly schema: EntitySchema;
    protected readonly dialect: IDialect;
    constructor(schema: EntitySchema, dialect: IDialect);
    findAll(filter?: FilterQuery, options?: QueryOptions): Promise<T[]>;
    findOne(filter: FilterQuery, options?: QueryOptions): Promise<T | null>;
    /**
     * Find an entity by its primary key OR by a natural key matching a
     * unique index of the schema.
     *
     * Accepted inputs :
     * - `string` (or `number`) → primary key lookup (legacy behavior).
     * - `Record<string, unknown>` with `id` field → primary key lookup
     *   (useful when caller has a populated relation object).
     * - `Record<string, unknown>` matching all fields of a unique index
     *   → natural key lookup (e.g. `findById({ slug: 'foo' })`).
     * - `null` / `undefined` / `''` → returns `null`.
     *
     * Throws `OrmIntrospectionError` if the input is a non-empty object
     * that matches neither `id` nor a unique index.
     *
     * @see docs/TECHNIQUE-INTROSPECTION-FINDONEBYID.md
     */
    findById(idOrEntity: string | number | Record<string, unknown> | null | undefined, options?: QueryOptions): Promise<T | null>;
    findByIdWithRelations(id: string, relations?: string[], options?: QueryOptions): Promise<T | null>;
    create(data: Partial<T>): Promise<T>;
    update(id: string, data: Partial<T>): Promise<T | null>;
    updateMany(filter: FilterQuery, data: Partial<T>): Promise<number>;
    delete(id: string): Promise<boolean>;
    deleteMany(filter: FilterQuery): Promise<number>;
    count(filter?: FilterQuery, options?: QueryOptions): Promise<number>;
    search(query: string, options?: QueryOptions): Promise<T[]>;
    distinct(field: string, filter?: FilterQuery, options?: QueryOptions): Promise<unknown[]>;
    aggregate<R = Record<string, unknown>>(stages: AggregateStage[], options?: QueryOptions): Promise<R[]>;
    upsert(filter: FilterQuery, data: Partial<T>): Promise<T>;
    increment(id: string, field: string, amount: number): Promise<T | null>;
    addToSet(id: string, field: string, value: unknown): Promise<T | null>;
    pull(id: string, field: string, value: unknown): Promise<T | null>;
    findWithRelations(filter: FilterQuery, relations: string[], options?: QueryOptions): Promise<T[]>;
}

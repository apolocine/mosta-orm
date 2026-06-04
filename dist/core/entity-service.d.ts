import { EventEmitter } from 'events';
import type { IDialect, EntitySchema, FilterQuery, QueryOptions } from './types.js';
import type { OrmRequest, OrmResponse } from './orm-request.js';
import { BaseRepository } from './base-repository.js';
export declare class EntityService extends EventEmitter {
    private repos;
    private dialect;
    constructor(dialect: IDialect);
    /** Get or create a BaseRepository for the given entity */
    getRepo(entityName: string): BaseRepository<any>;
    /** Get all registered entity names */
    getEntityNames(): string[];
    /** Get an entity schema by name */
    getEntitySchema(entityName: string): EntitySchema;
    /** Check if an entity is registered */
    hasEntity(entityName: string): boolean;
    findAll(entityName: string, filter?: FilterQuery, options?: QueryOptions): Promise<any[]>;
    findOne(entityName: string, filter: FilterQuery, options?: QueryOptions): Promise<any | null>;
    findById(entityName: string, id: string, options?: QueryOptions): Promise<any | null>;
    create(entityName: string, data: Record<string, unknown>): Promise<any>;
    update(entityName: string, id: string, data: Record<string, unknown>): Promise<any | null>;
    delete(entityName: string, id: string): Promise<boolean>;
    count(entityName: string, filter?: FilterQuery): Promise<number>;
    /** Execute an OrmRequest and return an OrmResponse */
    execute(req: OrmRequest): Promise<OrmResponse>;
}

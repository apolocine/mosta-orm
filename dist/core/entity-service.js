// EntityService — Facade CRUD + EventEmitter for @mostajs/net consumption
// Sits between transport adapters and the ORM dialect layer
// Processes OrmRequest → OrmResponse using BaseRepository
// Author: Dr Hamid MADANI drmdh@msn.com
import { EventEmitter } from 'events';
import { BaseRepository } from './base-repository.js';
import { getSchema, getAllSchemas, hasSchema } from './registry.js';
export class EntityService extends EventEmitter {
    repos = new Map();
    dialect;
    constructor(dialect) {
        super();
        this.dialect = dialect;
    }
    // ============================================================
    // Repository access
    // ============================================================
    /** Get or create a BaseRepository for the given entity */
    getRepo(entityName) {
        if (!this.repos.has(entityName)) {
            const schema = getSchema(entityName); // throws if not registered
            this.repos.set(entityName, new BaseRepository(schema, this.dialect));
        }
        return this.repos.get(entityName);
    }
    /** Get all registered entity names */
    getEntityNames() {
        return getAllSchemas().map(s => s.name);
    }
    /** Get an entity schema by name */
    getEntitySchema(entityName) {
        return getSchema(entityName);
    }
    /** Check if an entity is registered */
    hasEntity(entityName) {
        return hasSchema(entityName);
    }
    // ============================================================
    // Direct CRUD methods (typed, for programmatic use)
    // ============================================================
    async findAll(entityName, filter = {}, options) {
        const repo = this.getRepo(entityName);
        return repo.findAll(filter, options);
    }
    async findOne(entityName, filter, options) {
        const repo = this.getRepo(entityName);
        return repo.findOne(filter, options);
    }
    async findById(entityName, id, options) {
        const repo = this.getRepo(entityName);
        return repo.findById(id, options);
    }
    async create(entityName, data) {
        const repo = this.getRepo(entityName);
        const entity = await repo.create(data);
        this.emit('entity.created', { entity: entityName, data: entity });
        return entity;
    }
    async update(entityName, id, data) {
        const repo = this.getRepo(entityName);
        const entity = await repo.update(id, data);
        if (entity) {
            this.emit('entity.updated', { entity: entityName, id, data: entity });
        }
        return entity;
    }
    async delete(entityName, id) {
        const repo = this.getRepo(entityName);
        const ok = await repo.delete(id);
        if (ok) {
            this.emit('entity.deleted', { entity: entityName, id });
        }
        return ok;
    }
    async count(entityName, filter = {}) {
        const repo = this.getRepo(entityName);
        return repo.count(filter);
    }
    // ============================================================
    // OrmRequest → OrmResponse (canonical format for @mostajs/net)
    // ============================================================
    /** Execute an OrmRequest and return an OrmResponse */
    async execute(req) {
        try {
            if (!this.hasEntity(req.entity)) {
                return {
                    status: 'error',
                    error: {
                        code: 'ENTITY_NOT_FOUND',
                        message: `Entity "${req.entity}" is not registered`,
                    },
                };
            }
            const repo = this.getRepo(req.entity);
            switch (req.op) {
                case 'findAll': {
                    const data = req.relations?.length
                        ? await repo.findWithRelations(req.filter || {}, req.relations, req.options)
                        : await repo.findAll(req.filter || {}, req.options);
                    return { status: 'ok', data, metadata: { count: data.length } };
                }
                case 'findOne': {
                    // findOne with relations: findWithRelations + limit 1
                    if (req.relations?.length) {
                        const rows = await repo.findWithRelations(req.filter || {}, req.relations, { ...req.options, limit: 1 });
                        return { status: 'ok', data: rows[0] ?? null };
                    }
                    const data = await repo.findOne(req.filter || {}, req.options);
                    return { status: 'ok', data };
                }
                case 'findById': {
                    if (!req.id) {
                        return { status: 'error', error: { code: 'MISSING_ID', message: 'id is required for findById' } };
                    }
                    const data = req.relations?.length
                        ? await repo.findByIdWithRelations(req.id, req.relations, req.options)
                        : await repo.findById(req.id, req.options);
                    return { status: 'ok', data };
                }
                case 'create': {
                    if (!req.data) {
                        return { status: 'error', error: { code: 'MISSING_DATA', message: 'data is required for create' } };
                    }
                    let data = await repo.create(req.data);
                    // Populate relations on the created entity if requested
                    if (req.relations?.length && data && data.id) {
                        const populated = await repo.findByIdWithRelations(data.id, req.relations);
                        if (populated)
                            data = populated;
                    }
                    this.emit('entity.created', { entity: req.entity, data });
                    return { status: 'ok', data };
                }
                case 'update': {
                    if (!req.id) {
                        return { status: 'error', error: { code: 'MISSING_ID', message: 'id is required for update' } };
                    }
                    if (!req.data) {
                        return { status: 'error', error: { code: 'MISSING_DATA', message: 'data is required for update' } };
                    }
                    let data = await repo.update(req.id, req.data);
                    // Populate relations on the updated entity if requested
                    if (req.relations?.length && data) {
                        const populated = await repo.findByIdWithRelations(req.id, req.relations);
                        if (populated)
                            data = populated;
                    }
                    if (data)
                        this.emit('entity.updated', { entity: req.entity, id: req.id, data });
                    return { status: 'ok', data };
                }
                case 'delete': {
                    if (!req.id) {
                        return { status: 'error', error: { code: 'MISSING_ID', message: 'id is required for delete' } };
                    }
                    const ok = await repo.delete(req.id);
                    if (ok)
                        this.emit('entity.deleted', { entity: req.entity, id: req.id });
                    return { status: 'ok', data: ok };
                }
                case 'deleteMany': {
                    const n = await repo.deleteMany(req.filter || {});
                    return { status: 'ok', data: n, metadata: { count: n } };
                }
                case 'count': {
                    const total = await repo.count(req.filter || {});
                    return { status: 'ok', data: total, metadata: { total } };
                }
                case 'search': {
                    if (!req.query) {
                        return { status: 'error', error: { code: 'MISSING_QUERY', message: 'query is required for search' } };
                    }
                    const data = await repo.search(req.query, req.options);
                    // Populate relations on search results if requested
                    if (req.relations?.length && data.length > 0) {
                        const populated = await repo.findWithRelations({ id: { $in: data.map((d) => d.id) } }, req.relations, req.options);
                        return { status: 'ok', data: populated, metadata: { count: populated.length } };
                    }
                    return { status: 'ok', data, metadata: { count: data.length } };
                }
                case 'aggregate': {
                    if (!req.stages) {
                        return { status: 'error', error: { code: 'MISSING_STAGES', message: 'stages is required for aggregate' } };
                    }
                    const data = await repo.aggregate(req.stages);
                    return { status: 'ok', data };
                }
                case 'upsert': {
                    if (!req.filter || !req.data) {
                        return { status: 'error', error: { code: 'MISSING_PARAMS', message: 'filter and data are required for upsert' } };
                    }
                    let data = await repo.upsert(req.filter, req.data);
                    // Populate relations on the upserted entity if requested
                    if (req.relations?.length && data && data.id) {
                        const populated = await repo.findByIdWithRelations(data.id, req.relations);
                        if (populated)
                            data = populated;
                    }
                    this.emit('entity.upserted', { entity: req.entity, data });
                    return { status: 'ok', data };
                }
                case 'updateMany': {
                    if (!req.filter || !req.data) {
                        return { status: 'error', error: { code: 'MISSING_PARAMS', message: 'filter and data are required for updateMany' } };
                    }
                    const count = await repo.updateMany(req.filter, req.data);
                    return { status: 'ok', metadata: { count } };
                }
                case 'addToSet': {
                    if (!req.id || !req.field) {
                        return { status: 'error', error: { code: 'MISSING_PARAMS', message: 'id and field are required for addToSet' } };
                    }
                    const data = await repo.addToSet(req.id, req.field, req.value);
                    this.emit('entity.updated', { entity: req.entity, id: req.id, data });
                    return { status: 'ok', data };
                }
                case 'pull': {
                    if (!req.id || !req.field) {
                        return { status: 'error', error: { code: 'MISSING_PARAMS', message: 'id and field are required for pull' } };
                    }
                    const data = await repo.pull(req.id, req.field, req.value);
                    this.emit('entity.updated', { entity: req.entity, id: req.id, data });
                    return { status: 'ok', data };
                }
                case 'increment': {
                    if (!req.id || !req.field || req.amount === undefined) {
                        return { status: 'error', error: { code: 'MISSING_PARAMS', message: 'id, field and amount are required for increment' } };
                    }
                    const data = await repo.increment(req.id, req.field, req.amount);
                    this.emit('entity.updated', { entity: req.entity, id: req.id, data });
                    return { status: 'ok', data };
                }
                default:
                    return {
                        status: 'error',
                        error: { code: 'UNKNOWN_OP', message: `Unknown operation: ${req.op}` },
                    };
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const code = err?.name || 'ORM_ERROR';
            return { status: 'error', error: { code, message } };
        }
    }
}

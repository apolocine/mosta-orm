// EntityService — Facade CRUD + EventEmitter for @mostajs/net consumption
// Sits between transport adapters and the ORM dialect layer
// Processes OrmRequest → OrmResponse using BaseRepository
// Author: Dr Hamid MADANI drmdh@msn.com

import { EventEmitter } from 'events';
import type { IDialect, EntitySchema, FilterQuery, QueryOptions } from './types.js';
import type { OrmRequest, OrmResponse } from './orm-request.js';
import { BaseRepository } from './base-repository.js';
import { getSchema, getAllSchemas, hasSchema } from './registry.js';

export class EntityService extends EventEmitter {
  private repos = new Map<string, BaseRepository<any>>();
  private dialect: IDialect;

  constructor(dialect: IDialect) {
    super();
    this.dialect = dialect;
  }

  // ============================================================
  // Repository access
  // ============================================================

  /** Get or create a BaseRepository for the given entity */
  getRepo(entityName: string): BaseRepository<any> {
    if (!this.repos.has(entityName)) {
      const schema = getSchema(entityName); // throws if not registered
      this.repos.set(entityName, new BaseRepository(schema, this.dialect));
    }
    return this.repos.get(entityName)!;
  }

  /** Get all registered entity names */
  getEntityNames(): string[] {
    return getAllSchemas().map(s => s.name);
  }

  /** Get an entity schema by name */
  getEntitySchema(entityName: string): EntitySchema {
    return getSchema(entityName);
  }

  /** Check if an entity is registered */
  hasEntity(entityName: string): boolean {
    return hasSchema(entityName);
  }

  // ============================================================
  // Direct CRUD methods (typed, for programmatic use)
  // ============================================================

  async findAll(entityName: string, filter: FilterQuery = {}, options?: QueryOptions): Promise<any[]> {
    const repo = this.getRepo(entityName);
    return repo.findAll(filter, options);
  }

  async findOne(entityName: string, filter: FilterQuery, options?: QueryOptions): Promise<any | null> {
    const repo = this.getRepo(entityName);
    return repo.findOne(filter, options);
  }

  async findById(entityName: string, id: string, options?: QueryOptions): Promise<any | null> {
    const repo = this.getRepo(entityName);
    return repo.findById(id, options);
  }

  async create(entityName: string, data: Record<string, unknown>): Promise<any> {
    const repo = this.getRepo(entityName);
    const entity = await repo.create(data);
    this.emit('entity.created', { entity: entityName, data: entity });
    return entity;
  }

  async update(entityName: string, id: string, data: Record<string, unknown>): Promise<any | null> {
    const repo = this.getRepo(entityName);
    const entity = await repo.update(id, data);
    if (entity) {
      this.emit('entity.updated', { entity: entityName, id, data: entity });
    }
    return entity;
  }

  async delete(entityName: string, id: string): Promise<boolean> {
    const repo = this.getRepo(entityName);
    const ok = await repo.delete(id);
    if (ok) {
      this.emit('entity.deleted', { entity: entityName, id });
    }
    return ok;
  }

  async count(entityName: string, filter: FilterQuery = {}): Promise<number> {
    const repo = this.getRepo(entityName);
    return repo.count(filter);
  }

  // ============================================================
  // OrmRequest → OrmResponse (canonical format for @mostajs/net)
  // ============================================================

  /** Execute an OrmRequest and return an OrmResponse */
  async execute(req: OrmRequest): Promise<OrmResponse> {
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
          const data = await repo.findAll(req.filter || {}, req.options);
          return { status: 'ok', data, metadata: { count: data.length } };
        }

        case 'findOne': {
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
          const data = await repo.create(req.data);
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
          const data = await repo.update(req.id, req.data);
          if (data) this.emit('entity.updated', { entity: req.entity, id: req.id, data });
          return { status: 'ok', data };
        }

        case 'delete': {
          if (!req.id) {
            return { status: 'error', error: { code: 'MISSING_ID', message: 'id is required for delete' } };
          }
          const ok = await repo.delete(req.id);
          if (ok) this.emit('entity.deleted', { entity: req.entity, id: req.id });
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
          const data = await repo.upsert(req.filter, req.data);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as any)?.name || 'ORM_ERROR';
      return { status: 'error', error: { code, message } };
    }
  }
}

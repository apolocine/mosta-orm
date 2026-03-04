// BaseRepository — Generic repository implementing IRepository
// Equivalent to Spring Data JpaRepository<T, ID>
// Author: Dr Hamid MADANI drmdh@msn.com
import type {
  IRepository,
  IDialect,
  EntitySchema,
  FilterQuery,
  QueryOptions,
  AggregateStage,
} from './types.js';
import { normalizeDoc, normalizeDocs } from './normalizer.js';

export class BaseRepository<T extends { id: string }> implements IRepository<T> {
  constructor(
    protected readonly schema: EntitySchema,
    protected readonly dialect: IDialect,
  ) {}

  async findAll(filter: FilterQuery = {}, options?: QueryOptions): Promise<T[]> {
    const docs = await this.dialect.find(this.schema, filter, options);
    return normalizeDocs<T>(docs);
  }

  async findOne(filter: FilterQuery, options?: QueryOptions): Promise<T | null> {
    const doc = await this.dialect.findOne(this.schema, filter, options);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async findById(id: string, options?: QueryOptions): Promise<T | null> {
    const doc = await this.dialect.findById(this.schema, id, options);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async findByIdWithRelations(id: string, relations?: string[], options?: QueryOptions): Promise<T | null> {
    if (!relations || relations.length === 0) {
      return this.findById(id, options);
    }
    const doc = await this.dialect.findByIdWithRelations(this.schema, id, relations, options);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async create(data: Partial<T>): Promise<T> {
    const doc = await this.dialect.create(this.schema, data as Record<string, unknown>);
    return normalizeDoc<T>(doc);
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const doc = await this.dialect.update(this.schema, id, data as Record<string, unknown>);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async updateMany(filter: FilterQuery, data: Partial<T>): Promise<number> {
    return this.dialect.updateMany(this.schema, filter, data as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    return this.dialect.delete(this.schema, id);
  }

  async deleteMany(filter: FilterQuery): Promise<number> {
    return this.dialect.deleteMany(this.schema, filter);
  }

  async count(filter: FilterQuery = {}): Promise<number> {
    return this.dialect.count(this.schema, filter);
  }

  async search(query: string, options?: QueryOptions): Promise<T[]> {
    // Default: search all string fields — subclasses override with specific fields
    const fields = Object.entries(this.schema.fields)
      .filter(([, f]) => f.type === 'string')
      .map(([name]) => name);
    const docs = await this.dialect.search(this.schema, query, fields, options);
    return normalizeDocs<T>(docs);
  }

  async distinct(field: string, filter: FilterQuery = {}): Promise<unknown[]> {
    return this.dialect.distinct(this.schema, field, filter);
  }

  async aggregate<R = Record<string, unknown>>(stages: AggregateStage[]): Promise<R[]> {
    return this.dialect.aggregate<R>(this.schema, stages);
  }

  async upsert(filter: FilterQuery, data: Partial<T>): Promise<T> {
    const doc = await this.dialect.upsert(this.schema, filter, data as Record<string, unknown>);
    return normalizeDoc<T>(doc);
  }

  async increment(id: string, field: string, amount: number): Promise<T | null> {
    const doc = await this.dialect.increment(this.schema, id, field, amount);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async addToSet(id: string, field: string, value: unknown): Promise<T | null> {
    const doc = await this.dialect.addToSet(this.schema, id, field, value);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async pull(id: string, field: string, value: unknown): Promise<T | null> {
    const doc = await this.dialect.pull(this.schema, id, field, value);
    return doc ? normalizeDoc<T>(doc) : null;
  }

  async findWithRelations(
    filter: FilterQuery,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T[]> {
    const docs = await this.dialect.findWithRelations(this.schema, filter, relations, options);
    return normalizeDocs<T>(docs);
  }
}

// MongoDB Dialect - Wraps Mongoose to implement IDialect
// Equivalent to org.hibernate.dialect.MongoDBDialect
// Author: Dr Hamid MADANI drmdh@msn.com
import mongoose, { Schema, Model, type ConnectOptions } from 'mongoose';
import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  EntitySchema,
  FilterQuery as DALFilter,
  QueryOptions,
  AggregateStage,
} from '../core/types.js';

// ============================================================
// Model Registry — lazy-built from EntitySchema definitions
// ============================================================

const modelCache = new Map<string, Model<any>>();

/**
 * Get or build a Mongoose model from an EntitySchema.
 * Models are cached per entity name (singleton per schema).
 */
function getModel(schema: EntitySchema): Model<any> {
  if (modelCache.has(schema.name)) {
    return modelCache.get(schema.name)!;
  }

  // Return existing registered model if available
  if (mongoose.models[schema.name]) {
    modelCache.set(schema.name, mongoose.models[schema.name]);
    return mongoose.models[schema.name];
  }

  const mongSchema = buildMongooseSchema(schema);
  const model = mongoose.model(schema.name, mongSchema, schema.collection);
  modelCache.set(schema.name, model);
  return model;
}

/**
 * Build a Mongoose Schema from an EntitySchema definition.
 * Translates our generic FieldDef → Mongoose SchemaType.
 */
function buildMongooseSchema(entity: EntitySchema): Schema {
  const definition: Record<string, any> = {};

  // --- Fields ---
  for (const [name, field] of Object.entries(entity.fields)) {
    const schemaDef: any = {};

    // Type mapping
    switch (field.type) {
      case 'string':  schemaDef.type = String; break;
      case 'number':  schemaDef.type = Number; break;
      case 'boolean': schemaDef.type = Boolean; break;
      case 'date':    schemaDef.type = Date; break;
      case 'json':    schemaDef.type = Schema.Types.Mixed; break;
      case 'array': {
        if (!field.arrayOf) {
          schemaDef.type = [Schema.Types.Mixed];
        } else if (typeof field.arrayOf === 'string') {
          // Primitive array
          const typeMap: Record<string, any> = {
            string: String, number: Number, boolean: Boolean, date: Date,
          };
          schemaDef.type = [typeMap[field.arrayOf] || Schema.Types.Mixed];
        } else if (field.arrayOf.kind === 'embedded') {
          // Embedded subdocument array
          const subFields: Record<string, any> = {};
          for (const [sf, sd] of Object.entries(field.arrayOf.fields)) {
            const typeMap: Record<string, any> = {
              string: String, number: Number, boolean: Boolean, date: Date,
            };
            subFields[sf] = {
              type: typeMap[sd.type] || Schema.Types.Mixed,
              ...(sd.required && { required: true }),
              ...(sd.default !== undefined && { default: sd.default }),
            };
          }
          schemaDef.type = [new Schema(subFields, { _id: false })];
        }
        if (field.default === undefined) schemaDef.default = undefined;
        break;
      }
    }

    if (field.required) schemaDef.required = true;
    if (field.unique) {
      schemaDef.unique = true;
      // MongoDB treats null as a value in unique indexes — if the field
      // is not required, auto-enable sparse so multiple nulls are allowed.
      if (!field.required) schemaDef.sparse = true;
    }
    if (field.sparse) schemaDef.sparse = true;
    if (field.lowercase) schemaDef.lowercase = true;
    if (field.trim) schemaDef.trim = true;
    if (field.enum) schemaDef.enum = field.enum;
    if (field.default !== undefined && field.type !== 'array') {
      schemaDef.default = field.default === 'now' ? Date.now : field.default;
    }

    definition[name] = schemaDef;
  }

  // --- Relations → ObjectId refs ---
  for (const [name, rel] of Object.entries(entity.relations)) {
    if (rel.type === 'one-to-many' || rel.type === 'many-to-many') {
      // Array of refs (e.g. Role.permissions, User.roles)
      definition[name] = [{ type: Schema.Types.ObjectId, ref: rel.target }];
    } else {
      // many-to-one or one-to-one → single ref
      definition[name] = {
        type: Schema.Types.ObjectId,
        ref: rel.target,
        ...(rel.required && { required: true }),
        ...(rel.nullable && { default: null }),
      };
    }
  }

  const mongoSchema = new Schema(definition, {
    timestamps: entity.timestamps,
    collection: entity.collection,
  });

  // --- Indexes ---
  for (const idx of entity.indexes) {
    const mongoIndex: Record<string, any> = {};
    for (const [field, dir] of Object.entries(idx.fields)) {
      if (dir === 'text') mongoIndex[field] = 'text';
      else if (dir === 'desc') mongoIndex[field] = -1;
      else mongoIndex[field] = 1;
    }
    mongoSchema.index(mongoIndex, {
      ...(idx.unique && { unique: true }),
      ...(idx.sparse && { sparse: true }),
    });
  }

  return mongoSchema;
}

// ============================================================
// Query Translation — DAL FilterQuery → Mongoose filter
// ============================================================

/**
 * Translate a DAL FilterQuery to a Mongoose-compatible filter object.
 */
function translateFilter(filter: DALFilter): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(value)) {
      result.$or = value.map(translateFilter);
    } else if (key === '$and' && Array.isArray(value)) {
      result.$and = value.map(translateFilter);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // FilterOperator
      const op = value as Record<string, any>;
      const mongoOp: Record<string, any> = {};
      if ('$eq' in op) mongoOp.$eq = op.$eq;
      if ('$ne' in op) mongoOp.$ne = op.$ne;
      if ('$gt' in op) mongoOp.$gt = op.$gt;
      if ('$gte' in op) mongoOp.$gte = op.$gte;
      if ('$lt' in op) mongoOp.$lt = op.$lt;
      if ('$lte' in op) mongoOp.$lte = op.$lte;
      if ('$in' in op) mongoOp.$in = op.$in;
      if ('$nin' in op) mongoOp.$nin = op.$nin;
      if ('$exists' in op) mongoOp.$exists = op.$exists;
      if ('$regex' in op) {
        mongoOp.$regex = op.$regex;
        if (op.$regexFlags) mongoOp.$options = op.$regexFlags;
      }
      // If no operator keys matched, pass through as-is (raw Mongoose filter)
      result[key] = Object.keys(mongoOp).length > 0 ? mongoOp : value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Apply QueryOptions to a Mongoose query chain.
 */
function applyOptions(query: any, options?: QueryOptions): any {
  if (!options) return query;
  if (options.sort) query = query.sort(options.sort);
  if (options.skip) query = query.skip(options.skip);
  if (options.limit) query = query.limit(options.limit);
  if (options.select) query = query.select(options.select.join(' '));
  if (options.exclude) query = query.select(options.exclude.map((f: string) => `-${f}`).join(' '));
  return query;
}

// ============================================================
// SQL Logging — inspired by hibernate.show_sql / hibernate.format_sql
// ============================================================

let showSql = false;
let formatSql = false;

function logQuery(operation: string, collection: string, details?: any): void {
  if (!showSql) return;
  const prefix = `[DAL:MongoDB] ${operation} ${collection}`;
  if (formatSql && details) {
    console.log(prefix);
    console.log(JSON.stringify(details, null, 2));
  } else if (details) {
    console.log(`${prefix} ${JSON.stringify(details)}`);
  } else {
    console.log(prefix);
  }
}

// ============================================================
// MongoDialect — implements IDialect
// ============================================================

class MongoDialect implements IDialect {
  readonly dialectType: DialectType = 'mongodb';
  private config: ConnectionConfig | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config;
    showSql = config.showSql ?? false;
    formatSql = config.formatSql ?? false;

    const options: ConnectOptions = {
      bufferCommands: false,
    };

    // hibernate.connection.pool_size equivalent
    if (config.poolSize) {
      options.maxPoolSize = config.poolSize;
    }

    // Reuse existing connection if already connected
    if (mongoose.connection.readyState === 1) {
      logQuery('REUSE', 'connection');
      return;
    }

    await mongoose.connect(config.uri, options);
    logQuery('CONNECT', config.uri.replace(/\/\/.*@/, '//<credentials>@'));

    // hibernate.hbm2ddl.auto equivalent
    if (config.schemaStrategy === 'create') {
      logQuery('SCHEMA', 'create — dropping existing collections');
      await mongoose.connection.db!.dropDatabase();
    }
  }

  async disconnect(): Promise<void> {
    // hibernate.hbm2ddl.auto=create-drop
    if (this.config?.schemaStrategy === 'create-drop') {
      logQuery('SCHEMA', 'create-drop — dropping database on shutdown');
      await mongoose.connection.db!.dropDatabase();
    }

    modelCache.clear();
    // Clear mongoose model registry to allow clean reconnection
    for (const name of Object.keys(mongoose.models)) {
      delete mongoose.models[name];
    }
    for (const name of mongoose.modelNames()) {
      mongoose.deleteModel(name);
    }
    await mongoose.disconnect();
    logQuery('DISCONNECT', '');
  }

  async testConnection(): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) return false;
      await mongoose.connection.db!.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  // --- Schema management (hibernate.hbm2ddl.auto) ---

  async initSchema(schemas: EntitySchema[]): Promise<void> {
    const strategy = this.config?.schemaStrategy ?? 'none';
    logQuery('INIT_SCHEMA', `strategy=${strategy}`, { entities: schemas.map(s => s.name) });

    for (const schema of schemas) {
      // Always register models so .populate() can resolve refs (User→Role→Permission)
      const model = getModel(schema);

      if (strategy === 'update' || strategy === 'create') {
        // Ensure indexes exist (like hbm2ddl.auto=update)
        await model.ensureIndexes();
      }

      if (strategy === 'validate') {
        // Validate that collection exists
        const collections = await mongoose.connection.db!.listCollections({ name: schema.collection }).toArray();
        if (collections.length === 0) {
          throw new Error(
            `Schema validation failed: collection "${schema.collection}" does not exist ` +
            `(entity: ${schema.name}). Set schemaStrategy to "update" or "create".`
          );
        }
      }
    }
  }

  // --- CRUD ---

  async find<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T[]> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('FIND', schema.collection, { filter: mongoFilter, options });
    let query = model.find(mongoFilter);
    query = applyOptions(query, options);
    return query.lean() as Promise<T[]>;
  }

  async findOne<T>(schema: EntitySchema, filter: DALFilter, options?: QueryOptions): Promise<T | null> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('FIND_ONE', schema.collection, { filter: mongoFilter });
    let query = model.findOne(mongoFilter);
    query = applyOptions(query, options);
    return query.lean() as Promise<T | null>;
  }

  async findById<T>(schema: EntitySchema, id: string, options?: QueryOptions): Promise<T | null> {
    const model = getModel(schema);
    logQuery('FIND_BY_ID', schema.collection, { id });
    let query = model.findById(id);
    query = applyOptions(query, options);
    return query.lean() as Promise<T | null>;
  }

  async create<T>(schema: EntitySchema, data: Record<string, unknown>): Promise<T> {
    const model = getModel(schema);
    logQuery('CREATE', schema.collection, data);
    const doc = await model.create(data);
    return doc.toObject() as T;
  }

  async update<T>(schema: EntitySchema, id: string, data: Record<string, unknown>): Promise<T | null> {
    const model = getModel(schema);
    logQuery('UPDATE', schema.collection, { id, data });
    return model.findByIdAndUpdate(id, data, { returnDocument: 'after' }).lean() as Promise<T | null>;
  }

  async updateMany(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<number> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('UPDATE_MANY', schema.collection, { filter: mongoFilter, data });
    const result = await model.updateMany(mongoFilter, data);
    return result.modifiedCount;
  }

  async delete(schema: EntitySchema, id: string): Promise<boolean> {
    const model = getModel(schema);
    logQuery('DELETE', schema.collection, { id });
    const result = await model.findByIdAndDelete(id);
    return result !== null;
  }

  async deleteMany(schema: EntitySchema, filter: DALFilter): Promise<number> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('DELETE_MANY', schema.collection, { filter: mongoFilter });
    const result = await model.deleteMany(mongoFilter);
    return result.deletedCount;
  }

  // --- Queries ---

  async count(schema: EntitySchema, filter: DALFilter): Promise<number> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('COUNT', schema.collection, { filter: mongoFilter });
    return model.countDocuments(mongoFilter);
  }

  async distinct(schema: EntitySchema, field: string, filter: DALFilter): Promise<unknown[]> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('DISTINCT', schema.collection, { field, filter: mongoFilter });
    return model.distinct(field, mongoFilter);
  }

  async aggregate<T>(schema: EntitySchema, stages: AggregateStage[]): Promise<T[]> {
    const model = getModel(schema);

    // Translate our aggregate stages to Mongoose pipeline
    const pipeline = stages.map(stage => {
      if ('$match' in stage) {
        return { $match: translateFilter(stage.$match) };
      }
      if ('$group' in stage) {
        const group: Record<string, any> = {};
        for (const [key, val] of Object.entries(stage.$group)) {
          if (key === '_by') {
            group._id = val ? `$${val}` : null;
          } else {
            group[key] = val;
          }
        }
        return { $group: group };
      }
      if ('$sort' in stage) {
        return { $sort: stage.$sort };
      }
      if ('$limit' in stage) {
        return { $limit: stage.$limit };
      }
      return stage;
    });

    logQuery('AGGREGATE', schema.collection, pipeline);
    return model.aggregate(pipeline) as unknown as Promise<T[]>;
  }

  // --- Relations (equivalent Hibernate eager/lazy loading via populate) ---

  async findWithRelations<T>(
    schema: EntitySchema,
    filter: DALFilter,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T[]> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('FIND_WITH_RELATIONS', schema.collection, { filter: mongoFilter, relations });

    let query = model.find(mongoFilter);
    query = applyOptions(query, options);

    for (const rel of relations) {
      const relDef = schema.relations[rel];
      if (relDef?.select) {
        query = query.populate(rel, relDef.select.join(' '));
      } else {
        query = query.populate(rel);
      }
    }

    return query.lean() as Promise<T[]>;
  }

  async findByIdWithRelations<T>(
    schema: EntitySchema,
    id: string,
    relations: string[],
    options?: QueryOptions,
  ): Promise<T | null> {
    const model = getModel(schema);
    logQuery('FIND_BY_ID_WITH_RELATIONS', schema.collection, { id, relations });

    let query = model.findById(id);
    query = applyOptions(query, options);

    for (const rel of relations) {
      const relDef = schema.relations[rel];
      if (relDef?.select) {
        query = query.populate(rel, relDef.select.join(' '));
      } else {
        query = query.populate(rel);
      }
    }

    return query.lean() as Promise<T | null>;
  }

  // --- Upsert (equivalent Hibernate saveOrUpdate / merge) ---

  async upsert<T>(schema: EntitySchema, filter: DALFilter, data: Record<string, unknown>): Promise<T> {
    const model = getModel(schema);
    const mongoFilter = translateFilter(filter);
    logQuery('UPSERT', schema.collection, { filter: mongoFilter, data });
    const result = await model.findOneAndUpdate(mongoFilter, data, {
      upsert: true,
      returnDocument: 'after',
    }).lean();
    return result as T;
  }

  // --- Atomic operations ---

  async increment(
    schema: EntitySchema,
    id: string,
    field: string,
    amount: number,
  ): Promise<Record<string, unknown>> {
    const model = getModel(schema);
    logQuery('INCREMENT', schema.collection, { id, field, amount });
    // Determine if id is a valid ObjectId or a plain string (e.g. counter keys)
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = { _id: isObjectId ? new mongoose.Types.ObjectId(id) : id } as any;
    const result = await model.collection.findOneAndUpdate(
      filter,
      { $inc: { [field]: amount } },
      { returnDocument: 'after', upsert: true },
    );
    return (result ?? {}) as Record<string, unknown>;
  }

  // --- Array operations (equivalent Hibernate @ElementCollection management) ---

  async addToSet(
    schema: EntitySchema,
    id: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown> | null> {
    const model = getModel(schema);
    logQuery('ADD_TO_SET', schema.collection, { id, field, value });
    return model.findByIdAndUpdate(
      id,
      { $addToSet: { [field]: value } },
      { returnDocument: 'after' },
    ).lean() as Promise<Record<string, unknown> | null>;
  }

  async pull(
    schema: EntitySchema,
    id: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown> | null> {
    const model = getModel(schema);
    logQuery('PULL', schema.collection, { id, field, value });
    return model.findByIdAndUpdate(
      id,
      { $pull: { [field]: value } },
      { returnDocument: 'after' },
    ).lean() as Promise<Record<string, unknown> | null>;
  }

  // --- Text search ---

  async search<T>(
    schema: EntitySchema,
    query: string,
    fields: string[],
    options?: QueryOptions,
  ): Promise<T[]> {
    const model = getModel(schema);

    // Build $or with $regex for each field (works with or without text index)
    const orConditions = fields.map(field => ({
      [field]: { $regex: query, $options: 'i' },
    }));

    const filter = { $or: orConditions };
    logQuery('SEARCH', schema.collection, { query, fields, filter });

    let q = model.find(filter);
    q = applyOptions(q, options);
    return q.lean() as Promise<T[]>;
  }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new MongoDialect();
}

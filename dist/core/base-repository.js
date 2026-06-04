import { normalizeDoc, normalizeDocs } from './normalizer.js';
import { resolveLookup } from './introspection.js';
export class BaseRepository {
    schema;
    dialect;
    constructor(schema, dialect) {
        this.schema = schema;
        this.dialect = dialect;
    }
    async findAll(filter = {}, options) {
        const docs = await this.dialect.find(this.schema, filter, options);
        return normalizeDocs(docs);
    }
    async findOne(filter, options) {
        const doc = await this.dialect.findOne(this.schema, filter, options);
        return doc ? normalizeDoc(doc) : null;
    }
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
    async findById(idOrEntity, options) {
        const resolved = resolveLookup(this.schema, idOrEntity);
        if (resolved.kind === 'empty')
            return null;
        if (resolved.kind === 'pk') {
            const doc = await this.dialect.findById(this.schema, resolved.id, options);
            return doc ? normalizeDoc(doc) : null;
        }
        // natural key — délègue à findOne avec le filtre construit
        const doc = await this.dialect.findOne(this.schema, resolved.filter, options);
        return doc ? normalizeDoc(doc) : null;
    }
    async findByIdWithRelations(id, relations, options) {
        if (!relations || relations.length === 0) {
            return this.findById(id, options);
        }
        const doc = await this.dialect.findByIdWithRelations(this.schema, id, relations, options);
        return doc ? normalizeDoc(doc) : null;
    }
    async create(data) {
        const doc = await this.dialect.create(this.schema, data);
        return normalizeDoc(doc);
    }
    async update(id, data) {
        const doc = await this.dialect.update(this.schema, id, data);
        return doc ? normalizeDoc(doc) : null;
    }
    async updateMany(filter, data) {
        return this.dialect.updateMany(this.schema, filter, data);
    }
    async delete(id) {
        return this.dialect.delete(this.schema, id);
    }
    async deleteMany(filter) {
        return this.dialect.deleteMany(this.schema, filter);
    }
    async count(filter = {}, options) {
        return this.dialect.count(this.schema, filter, options);
    }
    async search(query, options) {
        // Default: search all string fields — subclasses override with specific fields
        const fields = Object.entries(this.schema.fields)
            .filter(([, f]) => f.type === 'string')
            .map(([name]) => name);
        const docs = await this.dialect.search(this.schema, query, fields, options);
        return normalizeDocs(docs);
    }
    async distinct(field, filter = {}, options) {
        return this.dialect.distinct(this.schema, field, filter, options);
    }
    async aggregate(stages, options) {
        return this.dialect.aggregate(this.schema, stages, options);
    }
    async upsert(filter, data) {
        const doc = await this.dialect.upsert(this.schema, filter, data);
        return normalizeDoc(doc);
    }
    async increment(id, field, amount) {
        const doc = await this.dialect.increment(this.schema, id, field, amount);
        return doc ? normalizeDoc(doc) : null;
    }
    async addToSet(id, field, value) {
        const doc = await this.dialect.addToSet(this.schema, id, field, value);
        return doc ? normalizeDoc(doc) : null;
    }
    async pull(id, field, value) {
        const doc = await this.dialect.pull(this.schema, id, field, value);
        return doc ? normalizeDoc(doc) : null;
    }
    async findWithRelations(filter, relations, options) {
        const docs = await this.dialect.findWithRelations(this.schema, filter, relations, options);
        return normalizeDocs(docs);
    }
}

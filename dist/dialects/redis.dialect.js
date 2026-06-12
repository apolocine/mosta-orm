// Redis Dialect — implements IDialect (NoSQL documentaire, façon Mongo) sur Redis Stack.
// Stockage : RedisJSON (JSON.SET/GET/NUMINCRBY) ; requêtes : RediSearch (FT.CREATE/FT.SEARCH).
//   - chaque entité = document JSON à la clé `<prefix><collection>:<id>` ;
//   - un index FT par entité (créé à initSchema) → filtre/tri/count côté serveur (O(log n)) ;
//   - relations M2O par lookup (JSON.GET), façon populate Mongo/Firestore.
// Driver : npm install ioredis (Redis Stack : redis-stack-server, modules search + ReJSON).
// Cf. docs/EXTENSIONS-REDIS-ELASTICSEARCH-EMBARQUE.md
// Author: Dr Hamid MADANI <drmdh@msn.com>
function ftTypeOf(field) {
    switch (field.type) {
        case 'number': return 'NUMERIC';
        case 'text': return 'TEXT';
        case 'boolean':
        case 'string':
        case 'date':
        default: return 'TAG';
    }
}
// Échappe les caractères spéciaux RediSearch dans une valeur TAG (UUID `-`, etc.).
function escTag(v) {
    return String(v).replace(/[ ,.<>{}\[\]"':;!@#$%^&*()\-+=~/\\]/g, '\\$&');
}
export class RedisDialect {
    dialectType = 'redis';
    config = null;
    db = null;
    /** Cache des types de champs par collection (pour traduire les filtres en FT). */
    fieldTypes = new Map();
    // --- Helpers ---
    prefix() { return this.config?.tablePrefix ?? ''; }
    keyOf(schema, id) { return `${this.prefix()}${schema.collection}:${id}`; }
    keyPrefix(collection) { return `${this.prefix()}${collection}:`; }
    indexOf(collection) { return `idx:${this.prefix()}${collection}`; }
    client() {
        if (!this.db)
            throw new Error('Redis not connected. Call connect() first.');
        return this.db;
    }
    genId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.floor(this.rnd() * 16);
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    }
    _seed = 987654321;
    rnd() { this._seed = (this._seed * 1103515245 + 12345 + Date.now()) % 2147483648; return this._seed / 2147483648; }
    withTimestamps(data, schema, isCreate) {
        if (!schema.timestamps)
            return data;
        const now = new Date().toISOString();
        return isCreate ? { createdAt: now, updatedAt: now, ...data } : { ...data, updatedAt: now };
    }
    typesFor(schema) {
        let t = this.fieldTypes.get(schema.collection);
        if (t)
            return t;
        t = {};
        for (const [name, f] of Object.entries(schema.fields || {})) {
            if (f.type === 'json' || f.type === 'array')
                continue; // non indexés
            t[name] = ftTypeOf(f);
        }
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                continue;
            t[rel.joinColumn || name] = 'TAG';
        }
        if (schema.timestamps) {
            t.createdAt = 'TAG';
            t.updatedAt = 'TAG';
        }
        if (schema.softDelete)
            t._deleted = 'NUMERIC';
        this.fieldTypes.set(schema.collection, t);
        return t;
    }
    // --- Traduction filtre @mostajs → requête RediSearch ---
    clauseFor(field, ftType, cond) {
        const tag = (v) => `@${field}:{${escTag(v)}}`;
        const num = (lo, hi) => `@${field}:[${lo} ${hi}]`;
        if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
            const parts = [];
            for (const [op, val] of Object.entries(cond)) {
                switch (op) {
                    case '$eq':
                        parts.push(ftType === 'NUMERIC' ? num(String(val), String(val)) : tag(val));
                        break;
                    case '$ne':
                        parts.push(`-(${ftType === 'NUMERIC' ? num(String(val), String(val)) : tag(val)})`);
                        break;
                    case '$gt':
                        parts.push(num(`(${Number(val)}`, '+inf'));
                        break;
                    case '$gte':
                        parts.push(num(`${Number(val)}`, '+inf'));
                        break;
                    case '$lt':
                        parts.push(num('-inf', `(${Number(val)}`));
                        break;
                    case '$lte':
                        parts.push(num('-inf', `${Number(val)}`));
                        break;
                    case '$in':
                        parts.push(`@${field}:{${val.map(escTag).join('|')}}`);
                        break;
                    case '$nin':
                        parts.push(`-@${field}:{${val.map(escTag).join('|')}}`);
                        break;
                    case '$exists':
                        parts.push(val ? `@${field}:*` : `-@${field}:*`);
                        break;
                    case '$regex':
                        parts.push(`@${field}:*${escTag(val)}*`);
                        break;
                    default: throw new Error(`Redis: opérateur de filtre inconnu "${op}".`);
                }
            }
            return parts.join(' ');
        }
        return ftType === 'NUMERIC' ? num(String(cond), String(cond)) : tag(cond);
    }
    buildQuery(schema, filter, options) {
        const types = this.typesFor(schema);
        const parts = [];
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '$or') {
                const cls = cond.map(c => `(${this.buildQuery(schema, c)})`);
                parts.push(`(${cls.join(' | ')})`);
                continue;
            }
            const ft = types[field] ?? 'TAG';
            parts.push(this.clauseFor(field, ft, cond));
        }
        // soft-delete : exclure les supprimés sauf includeDeleted
        if (schema.softDelete && !options?.includeDeleted && !('_deleted' in filter)) {
            parts.push('@_deleted:[0 0]');
        }
        return parts.length ? parts.join(' ') : '*';
    }
    /** Exécute FT.SEARCH et renvoie les documents JSON. */
    async ftSearch(schema, query, options, countOnly = false) {
        const args = [this.indexOf(schema.collection), query, 'DIALECT', 2];
        if (countOnly) {
            args.push('LIMIT', 0, 0);
        }
        else {
            if (options?.sort) {
                const [f, dir] = Object.entries(options.sort)[0];
                args.push('SORTBY', f, (String(dir) === 'desc' || String(dir) === '-1') ? 'DESC' : 'ASC');
            }
            args.push('LIMIT', options?.skip ?? 0, options?.limit ?? 10000);
            // RETURN <count> : count = nombre TOTAL de tokens suivants ($, AS, __doc = 3).
            args.push('RETURN', 3, '$', 'AS', '__doc');
        }
        const reply = await this.client().call('FT.SEARCH', ...args);
        const total = Number(reply[0]);
        const rows = [];
        if (!countOnly) {
            // reply = [total, key1, [ '__doc', '<json>' ], key2, [...], ...]
            for (let i = 1; i < reply.length; i += 2) {
                const fields = reply[i + 1];
                const idx = fields.indexOf('__doc');
                if (idx !== -1) {
                    let doc = JSON.parse(fields[idx + 1]);
                    if (options?.select?.length) {
                        const sel = new Set(['id', ...options.select]);
                        doc = Object.fromEntries(Object.entries(doc).filter(([k]) => sel.has(k)));
                    }
                    rows.push(doc);
                }
            }
        }
        return { total, rows };
    }
    // --- Lifecycle ---
    async connect(config) {
        this.config = config;
        let Redis;
        try {
            const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ 'ioredis');
            Redis = (mod.default ?? mod);
        }
        catch (e) {
            throw new Error(`Redis driver not found. Install it: npm install ioredis\nOriginal error: ${e instanceof Error ? e.message : String(e)}`);
        }
        this.db = new Redis(config.uri);
    }
    async disconnect() {
        try {
            await this.db?.quit();
        }
        catch { /* ignore */ }
        this.db = null;
    }
    async testConnection() {
        try {
            return (await this.db?.ping()) === 'PONG';
        }
        catch {
            return false;
        } // scan-ignore: testConnection retourne explicitement boolean
    }
    // --- Schema : crée un index RediSearch par entité ---
    async initSchema(schemas) {
        const strategy = this.config?.schemaStrategy ?? 'none';
        for (const schema of schemas) {
            if (strategy === 'create' || strategy === 'create-drop') {
                try {
                    await this.client().call('FT.DROPINDEX', this.indexOf(schema.collection));
                }
                catch { /* pas d'index */ }
                await this.truncateTable(schema.collection);
            }
            if (strategy === 'none' || strategy === 'validate')
                continue;
            await this.ensureIndex(schema);
        }
    }
    async ensureIndex(schema) {
        const types = this.typesFor(schema);
        const schemaArgs = [];
        for (const [field, ft] of Object.entries(types)) {
            schemaArgs.push(`$.${field}`, 'AS', field, ft);
            if (ft !== 'TEXT')
                schemaArgs.push('SORTABLE');
        }
        try {
            await this.client().call('FT.CREATE', this.indexOf(schema.collection), 'ON', 'JSON', 'PREFIX', 1, this.keyPrefix(schema.collection), 'SCHEMA', ...schemaArgs);
        }
        catch (e) {
            if (!/already exists/i.test(e.message))
                throw e;
        }
    }
    // --- CRUD ---
    async find(schema, filter, options) {
        const { rows } = await this.ftSearch(schema, this.buildQuery(schema, filter, options), options);
        return rows;
    }
    async findOne(schema, filter, options) {
        const rows = await this.find(schema, filter, { ...options, limit: 1 });
        return rows[0] ?? null;
    }
    async findById(schema, id, options) {
        const raw = await this.client().call('JSON.GET', this.keyOf(schema, id));
        if (!raw)
            return null;
        const doc = JSON.parse(raw);
        if (schema.softDelete && !options?.includeDeleted && doc.deletedAt != null)
            return null;
        return doc;
    }
    async create(schema, data) {
        const id = data.id ?? this.genId();
        const payload = this.withTimestamps({ ...data, id }, schema, true);
        if (schema.softDelete) {
            payload.deletedAt = payload.deletedAt ?? null;
            payload._deleted = 0;
        }
        await this.client().call('JSON.SET', this.keyOf(schema, id), '$', JSON.stringify(payload));
        return payload;
    }
    async update(schema, id, data) {
        const raw = await this.client().call('JSON.GET', this.keyOf(schema, id));
        if (!raw)
            return null;
        const cur = JSON.parse(raw);
        const { id: _ig, ...rest } = data;
        void _ig;
        const next = this.withTimestamps({ ...cur, ...rest }, schema, false);
        await this.client().call('JSON.SET', this.keyOf(schema, id), '$', JSON.stringify(next));
        return next;
    }
    async updateMany(schema, filter, data) {
        const rows = await this.find(schema, filter);
        let n = 0;
        for (const r of rows)
            if (await this.update(schema, r.id, data))
                n++;
        return n;
    }
    async delete(schema, id) {
        if (schema.softDelete) {
            return (await this.update(schema, id, { deletedAt: new Date().toISOString(), _deleted: 1 })) != null;
        }
        return (await this.client().del(this.keyOf(schema, id))) > 0;
    }
    async deleteMany(schema, filter) {
        const rows = await this.find(schema, filter);
        let n = 0;
        for (const r of rows)
            if (await this.delete(schema, r.id))
                n++;
        return n;
    }
    // --- Queries ---
    async count(schema, filter, options) {
        const { total } = await this.ftSearch(schema, this.buildQuery(schema, filter, options), options, true);
        return total;
    }
    async distinct(schema, field, filter, options) {
        const rows = await this.find(schema, filter, options);
        return [...new Set(rows.map(r => r[field]))];
    }
    async aggregate(_schema, _stages, _options) {
        throw new Error('Redis: aggregate() non implémenté (utiliser FT.AGGREGATE — évolution).');
    }
    // --- Relations (lookup M2O) ---
    async populate(schema, doc, relations) {
        for (const relName of relations) {
            const rel = schema.relations?.[relName];
            if (!rel || rel.type === 'one-to-many' || rel.type === 'many-to-many')
                continue;
            const fk = rel.joinColumn ?? relName;
            const refId = doc[fk] ?? doc[relName];
            if (typeof refId === 'string') {
                const raw = await this.client().call('JSON.GET', `${this.prefix()}${rel.target.toLowerCase()}s:${refId}`);
                if (raw)
                    doc[relName] = JSON.parse(raw);
            }
        }
        return doc;
    }
    async findWithRelations(schema, filter, relations, options) {
        const rows = await this.find(schema, filter, options);
        return Promise.all(rows.map(r => this.populate(schema, r, relations)));
    }
    async findByIdWithRelations(schema, id, relations, options) {
        const doc = await this.findById(schema, id, options);
        return doc ? this.populate(schema, doc, relations) : null;
    }
    // --- Upsert ---
    async upsert(schema, filter, data) {
        const existing = await this.findOne(schema, filter);
        if (existing)
            return (await this.update(schema, existing.id, data));
        return this.create(schema, data);
    }
    // --- Atomic / array ops (RedisJSON) ---
    async increment(schema, id, field, amount) {
        await this.client().call('JSON.NUMINCRBY', this.keyOf(schema, id), `$.${field}`, amount);
        if (schema.timestamps)
            await this.client().call('JSON.SET', this.keyOf(schema, id), '$.updatedAt', JSON.stringify(new Date().toISOString()));
        return (await this.findById(schema, id));
    }
    async addToSet(schema, id, field, value) {
        const doc = await this.findById(schema, id);
        if (!doc)
            return null;
        const arr = Array.isArray(doc[field]) ? doc[field] : [];
        if (!arr.includes(value))
            arr.push(value);
        return this.update(schema, id, { [field]: arr });
    }
    async pull(schema, id, field, value) {
        const doc = await this.findById(schema, id);
        if (!doc)
            return null;
        const arr = Array.isArray(doc[field]) ? doc[field] : [];
        return this.update(schema, id, { [field]: arr.filter(x => x !== value) });
    }
    // --- Text search : RediSearch full-text sur les champs TEXT ---
    async search(schema, query, fields, options) {
        const types = this.typesFor(schema);
        const textFields = fields.filter(f => types[f]); // indexés
        const q = textFields.length
            ? textFields.map(f => `@${f}:*${escTag(query)}*`).join(' | ')
            : `*${escTag(query)}*`;
        const { rows } = await this.ftSearch(schema, q, options);
        return rows;
    }
    // --- Transactions : pass-through (multi-clés non atomique ici) ---
    async $transaction(cb) { return cb(this); }
    async beginTx() {
        throw new Error('Redis: API tx manuelle non supportée — utiliser $transaction(cb).');
    }
    // --- Drops / truncate ---
    async dropTable(tableName) { await this.truncateTable(tableName); }
    async truncateTable(tableName) {
        const c = this.client();
        let cursor = '0';
        do {
            const [next, batch] = await c.call('SCAN', cursor, 'MATCH', `${this.keyPrefix(tableName)}*`, 'COUNT', 200);
            if (batch.length)
                await c.del(...batch);
            cursor = next;
        } while (cursor !== '0');
    }
    async dropSchema(schemas) {
        const dropped = [];
        for (const s of schemas) {
            try {
                await this.client().call('FT.DROPINDEX', this.indexOf(s.collection));
            }
            catch { /* pas d'index */ }
            await this.truncateTable(s.collection);
            dropped.push(s.collection);
        }
        return dropped;
    }
    async truncateAll(schemas) { return this.dropSchema(schemas); }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new RedisDialect();
}

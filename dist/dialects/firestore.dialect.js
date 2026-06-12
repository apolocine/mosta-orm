// Firestore Dialect — implements IDialect (NoSQL documentaire, façon MongoDB).
// Base NoSQL MANAGÉE Google Cloud : accès TOUJOURS distant (gRPC/TLS) ou émulateur local.
// Driver : npm install @google-cloud/firestore  (pur-JS ; mode preferRest = edge/WebContainer-safe).
// NB : Firestore n'a pas de JOIN/SQL/full-text → relations par lookup (N+1), recherche déléguée
//      au module storage Elasticsearch/OpenSearch (cf. EXTENSIONS-REDIS-ELASTICSEARCH-EMBARQUE.md §2).
// Étude : docs/DIALECTE-FIRESTORE.md · Gabarit : src/dialects/mongo.dialect.ts
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Opérateurs de filtre @mostajs → Firestore where()
const OP_MAP = {
    $eq: '==', $ne: '!=', $gt: '>', $gte: '>=', $lt: '<', $lte: '<=',
    $in: 'in', $nin: 'not-in', $contains: 'array-contains',
};
// ============================================================
// FirestoreDialect
// ============================================================
class FirestoreDialect {
    dialectType = 'firestore';
    config = null;
    db = null;
    static txWarned = false;
    // --- Helpers ---
    collName(schema) {
        return `${this.config?.tablePrefix ?? ''}${schema.collection}`;
    }
    coll(schema) {
        if (!this.db)
            throw new Error('Firestore not connected. Call connect() first.');
        return this.db.collection(this.collName(schema));
    }
    /** snapshot → { id, ...data } (équivalent normalize Mongo _id→id) */
    normalize(snap) {
        return { id: snap.id, ...(snap.data() ?? {}) };
    }
    stripId(data) {
        const { id, ...rest } = data;
        void id;
        return rest;
    }
    withTimestamps(data, schema, isCreate) {
        if (!schema.timestamps)
            return data;
        const now = new Date();
        return isCreate ? { createdAt: now, updatedAt: now, ...data } : { ...data, updatedAt: now };
    }
    /** Applique les contraintes de filtre @mostajs à une FsQuery. Lève sur opérateur non supporté. */
    applyFilter(q, schema, filter, options) {
        let query = q;
        // soft-delete : par défaut, exclure les documents supprimés
        if (schema.softDelete && !options?.includeDeleted && !('deletedAt' in filter)) {
            query = query.where('deletedAt', '==', null);
        }
        for (const [field, cond] of Object.entries(filter)) {
            if (field === '$or') {
                // Firestore n'a pas de OR inter-champs (utiliser `in`/`array-contains-any`, ≤30).
                throw new Error('Firestore: `$or` inter-champs non supporté nativement (cf. DIALECTE-FIRESTORE.md §4).');
            }
            if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
                for (const [op, val] of Object.entries(cond)) {
                    if (op === '$regex' || op === '$exists') {
                        throw new Error(`Firestore: opérateur ${op} non supporté (pas de full-text/exists ; déléguer la recherche au module storage ES/OpenSearch).`);
                    }
                    const fsOp = OP_MAP[op];
                    if (!fsOp)
                        throw new Error(`Firestore: opérateur de filtre inconnu "${op}".`);
                    query = query.where(field, fsOp, val);
                }
            }
            else {
                query = query.where(field, '==', cond);
            }
        }
        return query;
    }
    applyOptions(q, options) {
        let query = q;
        if (options?.sort)
            for (const [f, dir] of Object.entries(options.sort))
                query = query.orderBy(f, (String(dir) === 'desc' || String(dir) === '-1') ? 'desc' : 'asc');
        if (options?.skip)
            query = query.offset(options.skip);
        if (options?.limit)
            query = query.limit(options.limit);
        if (options?.select?.length)
            query = query.select(...options.select);
        return query;
    }
    // --- Lifecycle ---
    async connect(config) {
        this.config = config;
        let Firestore;
        try {
            const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ '@google-cloud/firestore');
            Firestore = (mod.Firestore ?? mod.default);
        }
        catch (e) {
            throw new Error(`Firestore driver not found. Install it: npm install @google-cloud/firestore\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
        // URI : firestore://<projectId>?keyFile=/chemin/sa.json&rest=true
        const u = new URL(config.uri.replace(/^firestore:\/\//, 'http://'));
        const projectId = u.hostname || u.pathname.replace(/^\//, '') || process.env.GOOGLE_CLOUD_PROJECT;
        const keyFile = u.searchParams.get('keyFile') ?? undefined;
        const preferRest = u.searchParams.get('rest') === 'true';
        if (keyFile)
            process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;
        // Si FIRESTORE_EMULATOR_HOST est posé, le SDK route vers l'émulateur (aucune clé requise).
        const opts = { projectId };
        if (preferRest)
            opts.preferRest = true;
        this.db = new Firestore(opts);
        if (config.schemaStrategy === 'create' || config.schemaStrategy === 'create-drop') {
            // schemaless : rien à créer ; le drop éventuel se fait à initSchema/disconnect.
        }
    }
    async disconnect() {
        await this.db?.terminate?.();
        this.db = null;
    }
    async testConnection() {
        try {
            if (!this.db)
                return false;
            // NB : Firestore RÉSERVE tout identifiant au motif __…__ (double underscore) → un nom
            // de sonde comme "__ping__" lève INVALID_ARGUMENT. On utilise un nom non réservé.
            await this.db.collection('mostajs_health_check').limit(1).get();
            return true;
        }
        catch {
            return false; // scan-ignore: testConnection retourne explicitement boolean
        }
    }
    // --- Schema management (Firestore est schemaless : pas de DDL) ---
    async initSchema(schemas) {
        const strategy = this.config?.schemaStrategy ?? 'none';
        if (strategy === 'create' || strategy === 'create-drop') {
            // create = repartir propre : vider les collections déclarées (coûteux — facturé par doc).
            for (const s of schemas)
                await this.truncateTable(this.collName(s));
        }
        // Pas d'index à créer ici : Firestore gère les index simples automatiquement ;
        // les index composites se déclarent côté GCP (firestore.indexes.json) — hors scaffold.
    }
    // --- CRUD ---
    async find(schema, filter, options) {
        let q = this.coll(schema);
        q = this.applyFilter(q, schema, filter, options);
        q = this.applyOptions(q, options);
        const snap = await q.get();
        return snap.docs.map(d => this.normalize(d));
    }
    async findOne(schema, filter, options) {
        const rows = await this.find(schema, filter, { ...options, limit: 1 });
        return rows[0] ?? null;
    }
    async findById(schema, id, options) {
        const snap = await this.coll(schema).doc(id).get();
        if (!snap.exists)
            return null;
        const doc = this.normalize(snap);
        if (schema.softDelete && !options?.includeDeleted && doc.deletedAt != null)
            return null;
        return doc;
    }
    async create(schema, data) {
        const coll = this.coll(schema);
        const id = data.id ?? coll.doc().id;
        const payload = this.withTimestamps(this.stripId(data), schema, true);
        // soft-delete : poser explicitement deletedAt:null. Sinon le champ est ABSENT et la requête
        // de visibilité where('deletedAt','==',null) NE le matche PAS (Firestore ignore les champs
        // manquants sur == null) → le document serait invisible dès sa création.
        if (schema.softDelete && payload.deletedAt === undefined)
            payload.deletedAt = null;
        await coll.doc(id).set(payload);
        return { id, ...payload };
    }
    async update(schema, id, data) {
        const ref = this.coll(schema).doc(id);
        const snap = await ref.get();
        if (!snap.exists)
            return null;
        const payload = this.withTimestamps(this.stripId(data), schema, false);
        await ref.update(payload);
        const after = await ref.get();
        return this.normalize(after);
    }
    async updateMany(schema, filter, data) {
        const rows = await this.find(schema, filter);
        let n = 0;
        for (const r of rows) {
            if (await this.update(schema, r.id, data))
                n++;
        }
        return n;
    }
    async delete(schema, id) {
        const ref = this.coll(schema).doc(id);
        if (schema.softDelete) {
            const snap = await ref.get();
            if (!snap.exists)
                return false;
            await ref.update({ deletedAt: new Date() });
            return true;
        }
        const snap = await ref.get();
        if (!snap.exists)
            return false;
        await ref.delete();
        return true;
    }
    async deleteMany(schema, filter) {
        const rows = await this.find(schema, filter);
        if (!this.db)
            return 0;
        // batch ≤ 500 writes
        let n = 0;
        for (let i = 0; i < rows.length; i += 450) {
            const batch = this.db.batch();
            for (const r of rows.slice(i, i + 450)) {
                // soft-delete : update() (merge) et NON set() qui écraserait tout le document.
                if (schema.softDelete)
                    batch.update(this.coll(schema).doc(r.id), { deletedAt: new Date() });
                else
                    batch.delete(this.coll(schema).doc(r.id));
                n++;
            }
            await batch.commit();
        }
        return n;
    }
    // --- Queries ---
    async count(schema, filter, options) {
        let q = this.coll(schema);
        q = this.applyFilter(q, schema, filter, options);
        const agg = await q.count().get();
        return agg.data().count;
    }
    async distinct(schema, field, filter, options) {
        const rows = await this.find(schema, filter, options);
        return [...new Set(rows.map(r => r[field]))];
    }
    async aggregate(_schema, _stages, _options) {
        // TODO scaffold : pipeline d'agrégation ($group/$match/$sort) non câblé.
        // Firestore n'a pas de pipeline serveur → agrégation côté client ou via API count/sum/avg.
        throw new Error('Firestore: aggregate() non implémenté (scaffold) — cf. DIALECTE-FIRESTORE.md §3.');
    }
    // --- Relations (lookup N+1, façon populate Mongo) ---
    async populate(schema, doc, relations) {
        for (const relName of relations) {
            const rel = schema.relations?.[relName];
            if (!rel)
                continue;
            const fk = rel.joinColumn ?? relName;
            const refId = doc[fk] ?? doc[relName];
            if (typeof refId === 'string') {
                // target collection = nom de collection de l'entité cible (convention : pluriel/role applicatif)
                const targetColl = `${this.config?.tablePrefix ?? ''}${rel.target.toLowerCase()}s`;
                if (!this.db)
                    break;
                const snap = await this.db.collection(targetColl).doc(refId).get();
                if (snap.exists)
                    doc[relName] = this.normalize(snap);
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
    // --- Atomic / array ops (FieldValue) ---
    async increment(schema, id, field, amount) {
        const ref = this.coll(schema).doc(id);
        await ref.update({ [field]: await this.fieldValue('increment', amount) });
        return this.normalize(await ref.get());
    }
    async addToSet(schema, id, field, value) {
        const ref = this.coll(schema).doc(id);
        await ref.update({ [field]: await this.fieldValue('arrayUnion', value) });
        return this.normalize(await ref.get());
    }
    async pull(schema, id, field, value) {
        const ref = this.coll(schema).doc(id);
        await ref.update({ [field]: await this.fieldValue('arrayRemove', value) });
        return this.normalize(await ref.get());
    }
    async fieldValue(kind, v) {
        const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ '@google-cloud/firestore');
        const FV = mod.FieldValue;
        return FV[kind](v);
    }
    // --- Text search : DÉLÉGUÉ au module storage (Firestore n'a pas de full-text) ---
    async search(_schema, _query, _fields, _options) {
        throw new Error('Firestore: pas de recherche full-text native. Déléguer au module storage Elasticsearch/OpenSearch ' +
            '(EXTENSIONS-REDIS-ELASTICSEARCH-EMBARQUE.md §2), alimenté en CDC.');
    }
    // --- Transactions : closure-scoped (runTransaction). Manuel non supporté. ---
    async $transaction(cb) {
        // Firestore = transactions par closure. Limite scaffold : les ops internes utilisent
        // this.db (pas l'objet tx Firestore) → pass-through non strictement atomique.
        if (!FirestoreDialect.txWarned) {
            FirestoreDialect.txWarned = true;
            console.warn('[firestore] $transaction(cb) : pass-through non atomique (scaffold). Voir DIALECTE-FIRESTORE.md §4.');
        }
        return cb(this);
    }
    async beginTx() {
        throw new Error('Firestore: API tx manuelle (beginTx/commitTx/rollbackTx) non supportée — utiliser $transaction(cb).');
    }
    // --- Schema drops / truncate ---
    async dropTable(tableName) { await this.truncateTable(tableName); }
    async truncateTable(tableName) {
        if (!this.db)
            return;
        const snap = await this.db.collection(tableName).get();
        for (let i = 0; i < snap.docs.length; i += 450) {
            const batch = this.db.batch();
            for (const d of snap.docs.slice(i, i + 450))
                batch.delete(this.db.collection(tableName).doc(d.id));
            await batch.commit();
        }
    }
    async dropSchema(schemas) {
        const dropped = [];
        for (const s of schemas) {
            await this.truncateTable(this.collName(s));
            dropped.push(this.collName(s));
        }
        return dropped;
    }
    async truncateAll(schemas) { return this.dropSchema(schemas); }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new FirestoreDialect();
}

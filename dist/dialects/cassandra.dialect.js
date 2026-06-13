// Cassandra Dialect — extends AbstractSqlDialect (CQL : SQL-like, placeholders `?`).
// NoSQL wide-column distribué. R&D / périmètre borné (cf. roadmap §A6, doc §3).
// Driver : npm install cassandra-driver (DataStax, officiel).
//
// ⚠ PARADIGME CQL (query-first) :
//  - pas de JOIN ; requêtes pilotées par la PARTITION KEY (ici `id`) ;
//  - WHERE sur colonne non-clé ⇒ `ALLOW FILTERING` (coûteux — OK petit volume) ;
//  - pas de UNIQUE/FK ; pas de DEFAULT/NOT NULL ; pas d'OFFSET ni d'ORDER BY arbitraire ;
//  - upsert natif (INSERT = upsert) ; pas de compteur d'affected-rows.
//
// ✅ STATUT : VALIDÉ LIVE sur amia (test-sgbd 20/20, 2026-06-12). NB : Cassandra 4.1 exige
//   Java 11 (option JVM CMS retirée en Java 14+ → ne démarre pas sous Java 17). CQL n'accepte
//   pas la tautologie `WHERE 1=1` des filtres vides → on la retire (stripTautology).
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
const CASSANDRA_TYPE_MAP = {
    string: 'text',
    text: 'text',
    number: 'double',
    boolean: 'boolean',
    date: 'timestamp',
    json: 'text',
    array: 'text',
};
export class CassandraDialect extends AbstractSqlDialect {
    dialectType = 'cassandra';
    db = null;
    keyspace = 'mostajs_dev';
    // --- Abstract implementations ---
    quoteIdentifier(name) { return `"${name.replace(/"/g, '""')}"`; }
    getPlaceholder(_index) { return '?'; }
    fieldToSqlType(field) { return CASSANDRA_TYPE_MAP[field.type] || 'text'; }
    getIdColumnType() { return 'text'; }
    getTableListQuery() {
        return `SELECT table_name AS name FROM system_schema.tables WHERE keyspace_name = '${this.keyspace}'`;
    }
    async getExistingColumns(tableName) {
        try {
            const rows = await this.executeQuery(`SELECT column_name AS name FROM system_schema.columns WHERE keyspace_name = '${this.keyspace}' AND table_name = ? ALLOW FILTERING`, [tableName]);
            return new Set(rows.map(r => r.name).filter(Boolean));
        }
        catch {
            return new Set();
        }
    }
    // --- Hooks ---
    supportsIfNotExists() { return true; }
    supportsReturning() { return false; }
    supportsAlterTableAddForeignKey() { return false; }
    supportsPartialIndex() { return false; }
    serializeBoolean(v) { return v; } // boolean natif CQL
    deserializeBoolean(v) { return v === true || v === 1 || v === '1'; }
    serializeDate(value) {
        if (value === 'now' || value === '__MOSTA_NOW__')
            return new Date();
        if (value instanceof Date)
            return value;
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d; // timestamp CQL = Date JS
    }
    /** CQL n'a pas d'ILIKE/regex serveur ; LIKE nécessite un index SASI. On reste sur LIKE. */
    buildRegexCondition(col, _flags) {
        return `${col} LIKE ${this.nextPlaceholder()}`;
    }
    // CQL : LIMIT seulement (pas d'OFFSET) ; ORDER BY arbitraire non supporté.
    buildLimitOffset(options) {
        return options?.limit ? ` LIMIT ${options.limit}` : '';
    }
    buildOrderBy() { return ''; }
    generateIndexes() { return []; }
    // --- DDL : CREATE TABLE (id PRIMARY KEY ; ni NOT NULL/UNIQUE/FK/DEFAULT) ---
    generateCreateTable(schema) {
        const q = (n) => this.quoteIdentifier(n);
        const cols = [`  ${q('id')} ${this.getIdColumnType()} PRIMARY KEY`];
        const fkCols = new Set();
        for (const [rn, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                continue;
            fkCols.add(rel.joinColumn || rn);
        }
        for (const [name, field] of Object.entries(schema.fields || {})) {
            if (name === 'id' || fkCols.has(name))
                continue;
            cols.push(`  ${q(name)} ${this.fieldToSqlType(field)}`);
        }
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                continue;
            cols.push(`  ${q(rel.joinColumn || name)} ${this.getIdColumnType()}`);
        }
        if (schema.timestamps) {
            cols.push(`  ${q('createdAt')} timestamp`);
            cols.push(`  ${q('updatedAt')} timestamp`);
        }
        if (schema.softDelete)
            cols.push(`  ${q('deletedAt')} timestamp`);
        return `CREATE TABLE IF NOT EXISTS ${q(this.getPrefixedName(schema.collection))} (\n${cols.join(',\n')}\n)`;
    }
    getDropTableSql(tableName) {
        return `DROP TABLE IF EXISTS ${this.quoteIdentifier(this.getPrefixedName(tableName))}`;
    }
    // --- Normalisation des valeurs renvoyées (Long → number) ---
    normalizeRow(row) {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
            if (v && typeof v.toNumber === 'function'
                && v.constructor?.name === 'Long') {
                out[k] = v.toNumber();
            }
            else
                out[k] = v;
        }
        return out;
    }
    // --- Connection lifecycle ---
    async doConnect(config) {
        let Client;
        try {
            const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ 'cassandra-driver');
            Client = mod.Client;
        }
        catch (e) {
            throw new Error(`Cassandra driver not found. Install it: npm install cassandra-driver\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
        // URI : cassandra://host:port/keyspace[?dc=datacenter1]
        const u = new URL(config.uri.replace(/^cassandra:\/\//, 'http://'));
        this.keyspace = u.pathname.replace(/^\//, '') || 'mostajs_dev';
        const dc = u.searchParams.get('dc') || 'datacenter1';
        this.db = new Client({
            contactPoints: [u.hostname || '127.0.0.1'],
            protocolOptions: { port: u.port ? Number(u.port) : 9042 },
            localDataCenter: dc,
            keyspace: this.keyspace,
        });
        await this.db.connect();
    }
    async doDisconnect() {
        const db = this.db;
        this.db = null;
        if (db)
            await db.shutdown();
    }
    async doTestConnection() {
        if (!this.db)
            return false;
        try {
            await this.db.execute('SELECT now() FROM system.local');
            return true;
        }
        catch (e) {
            this.log('TEST_CONNECTION', `down: ${e.message}`);
            return false;
        }
    }
    // --- Query execution ---
    /** CQL n'accepte pas la tautologie `WHERE 1=1` émise pour les filtres vides. */
    stripTautology(sql) {
        return sql
            .replace(/\bWHERE\s+1\s*=\s*1\s+AND\s+/i, 'WHERE ')
            .replace(/\bWHERE\s+1\s*=\s*1\b/i, '');
    }
    /** Ajoute ALLOW FILTERING aux SELECT filtrés sur colonne non-clé. */
    withAllowFiltering(sql) {
        if (/^\s*SELECT/i.test(sql) && /\sWHERE\s/i.test(sql) && !/ALLOW\s+FILTERING/i.test(sql)) {
            return `${sql} ALLOW FILTERING`;
        }
        return sql;
    }
    async doExecuteQuery(sql, params) {
        if (!this.db)
            throw new Error('Cassandra not connected. Call connect() first.');
        const res = await this.db.execute(this.withAllowFiltering(this.stripTautology(sql)), params, { prepare: true });
        return res.rows.map(r => this.normalizeRow(r));
    }
    async doExecuteRun(sql, params) {
        if (!this.db)
            throw new Error('Cassandra not connected. Call connect() first.');
        await this.db.execute(this.stripTautology(sql), params, { prepare: true });
        return { changes: 1 }; // CQL n'expose pas d'affected-rows
    }
}
export function createDialect() {
    return new CassandraDialect();
}

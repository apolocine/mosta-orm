// ClickHouse Dialect — extends AbstractSqlDialect (scope « append/analytique »).
// OLAP colonnaire distribué (MergeTree), interface HTTP. Driver: npm install @clickhouse/client
//
// ⚠ PARADIGME NON-OLTP (cf. docs/NOUVEAUX-DIALECTES-…-FIREBIRD.md §2) :
//  - pas de contrainte PK / UNIQUE / FK (la « primary key » MergeTree = clé de tri) ;
//  - UPDATE/DELETE = MUTATIONS `ALTER TABLE … UPDATE/DELETE` (rendues SYNCHRONES via
//    le réglage mutations_sync) — coûteuses, à réserver à un usage append-mostly ;
//  - INSERT par batch privilégié ; unicité NON garantie.
//
// Spécificités driver gérées :
//  - paramètres TYPÉS `{pN:Type}` (pas de `?`) → conversion dans doExecuteQuery/Run ;
//  - `ENGINE = MergeTree() ORDER BY id` obligatoire au CREATE → generateCreateTable surchargé ;
//  - colonnes Nullable(T) (sauf id) ; dates au format 'YYYY-MM-DD HH:MM:SS'.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
const CLICKHOUSE_TYPE_MAP = {
    string: 'String',
    text: 'String',
    number: 'Float64',
    boolean: 'UInt8',
    date: 'DateTime',
    json: 'String',
    array: 'String',
};
export class ClickHouseDialect extends AbstractSqlDialect {
    dialectType = 'clickhouse';
    db = null;
    // --- Abstract implementations ---
    quoteIdentifier(name) {
        return `\`${name.replace(/`/g, '``')}\``; // ClickHouse : backticks
    }
    getPlaceholder(_index) { return '?'; } // converti en {pN:Type} à l'exécution
    fieldToSqlType(field) {
        return `Nullable(${CLICKHOUSE_TYPE_MAP[field.type] || 'String'})`;
    }
    getIdColumnType() { return 'String'; } // non-nullable (clé de tri MergeTree)
    getTableListQuery() {
        return 'SELECT name FROM system.tables WHERE database = currentDatabase()';
    }
    async getExistingColumns(tableName) {
        try {
            const rows = await this.executeQuery('SELECT name FROM system.columns WHERE database = currentDatabase() AND table = ?', [tableName]);
            return new Set(rows.map(r => r.name).filter(Boolean));
        }
        catch {
            return new Set();
        }
    }
    // --- Hooks ---
    supportsIfNotExists() { return true; }
    supportsReturning() { return false; }
    supportsAlterTableAddForeignKey() { return false; } // pas de FK
    supportsPartialIndex() { return false; }
    serializeBoolean(v) { return v ? 1 : 0; }
    deserializeBoolean(v) { return v === 1 || v === '1' || v === true; }
    /** ClickHouse DateTime : 'YYYY-MM-DD HH:MM:SS' (UTC). Gère les sentinels "now". */
    serializeDate(value) {
        if (value === 'now' || value === '__MOSTA_NOW__')
            value = new Date();
        const d = value instanceof Date ? value : new Date(value);
        if (isNaN(d.getTime()))
            return value;
        return d.toISOString().slice(0, 19).replace('T', ' ');
    }
    /** insensible à la casse : ClickHouse a ILIKE. */
    buildRegexCondition(col, flags) {
        return `${col} ${flags?.includes('i') ? 'ILIKE' : 'LIKE'} ${this.nextPlaceholder()}`;
    }
    // ClickHouse n'a pas d'index « contrainte » SQL classique → pas de CREATE INDEX.
    generateIndexes() { return []; }
    // --- DDL : CREATE TABLE … ENGINE = MergeTree() ---
    generateCreateTable(schema) {
        const q = (n) => this.quoteIdentifier(n);
        const cols = [`  ${q('id')} ${this.getIdColumnType()}`];
        const fkCols = new Set();
        for (const [rn, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                continue;
            fkCols.add(rel.joinColumn || rn);
        }
        for (const [name, field] of Object.entries(schema.fields || {})) {
            if (name === 'id' || fkCols.has(name))
                continue;
            let c = `  ${q(name)} ${this.fieldToSqlType(field)}`;
            const isNow = field.default === 'now' || field.default === '__MOSTA_NOW__';
            if (field.default !== undefined && !isNow && field.default !== null) {
                const dv = this.serializeValue(field.default, field);
                if (typeof dv === 'string')
                    c += ` DEFAULT '${dv.replace(/'/g, "\\'")}'`;
                else if (typeof dv === 'number')
                    c += ` DEFAULT ${dv}`;
            }
            cols.push(c);
        }
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                continue;
            cols.push(`  ${q(rel.joinColumn || name)} Nullable(${this.getIdColumnType()})`);
        }
        if (schema.timestamps) {
            cols.push(`  ${q('createdAt')} ${this.fieldToSqlType({ type: 'date' })}`);
            cols.push(`  ${q('updatedAt')} ${this.fieldToSqlType({ type: 'date' })}`);
        }
        if (schema.softDelete)
            cols.push(`  ${q('deletedAt')} ${this.fieldToSqlType({ type: 'date' })}`);
        const tbl = q(this.getPrefixedName(schema.collection));
        return `CREATE TABLE IF NOT EXISTS ${tbl} (\n${cols.join(',\n')}\n) ENGINE = MergeTree() ORDER BY ${q('id')}`;
    }
    // --- DROP : ClickHouse n'a pas CASCADE ---
    getDropTableSql(tableName) {
        return `DROP TABLE IF EXISTS ${this.quoteIdentifier(this.getPrefixedName(tableName))}`;
    }
    // --- Conversion `?` positionnels → paramètres typés ClickHouse {pN:Type} ---
    bind(sql, params) {
        const query_params = {};
        let i = 0;
        const query = sql.replace(/\?/g, () => {
            const v = params[i++];
            if (v === null || v === undefined)
                return 'NULL';
            const name = `p${i - 1}`;
            let type, val = v;
            if (typeof v === 'boolean') {
                type = 'UInt8';
                val = v ? 1 : 0;
            }
            else if (typeof v === 'number') {
                type = Number.isInteger(v) ? 'Int64' : 'Float64';
            }
            else {
                type = 'String';
                val = String(v);
            }
            query_params[name] = val;
            return `{${name}:${type}}`;
        });
        return { query, query_params };
    }
    /** Réécrit UPDATE/DELETE en mutations ClickHouse (ALTER TABLE … UPDATE/DELETE). */
    toMutation(sql) {
        let s = sql.trim();
        let m = s.match(/^UPDATE\s+(.+?)\s+SET\s+([\s\S]+)$/i);
        if (m)
            return `ALTER TABLE ${m[1]} UPDATE ${m[2]}`;
        m = s.match(/^DELETE\s+FROM\s+(\S+)\s+WHERE\s+([\s\S]+)$/i);
        if (m)
            return `ALTER TABLE ${m[1]} DELETE WHERE ${m[2]}`;
        m = s.match(/^DELETE\s+FROM\s+(\S+)\s*$/i);
        if (m)
            return `ALTER TABLE ${m[1]} DELETE WHERE 1 = 1`;
        return s;
    }
    // --- Connection lifecycle ---
    async doConnect(config) {
        let createClient;
        try {
            const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ '@clickhouse/client');
            createClient = mod.createClient;
        }
        catch (e) {
            throw new Error(`ClickHouse driver not found. Install it: npm install @clickhouse/client\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
        // URI : http(s)://user:password@host:port/database
        const u = new URL(config.uri);
        const database = u.pathname.replace(/^\//, '') || 'default';
        this.db = createClient({
            url: `${u.protocol}//${u.hostname}:${u.port || 8123}`,
            username: decodeURIComponent(u.username) || 'default',
            password: decodeURIComponent(u.password) || '',
            database,
            // Mutations SYNCHRONES → update/delete visibles immédiatement (read-after-write).
            clickhouse_settings: { mutations_sync: '2' },
        });
    }
    async doDisconnect() {
        const db = this.db;
        this.db = null;
        if (db)
            await db.close();
    }
    async doTestConnection() {
        if (!this.db)
            return false;
        try {
            return (await this.db.ping()).success;
        }
        catch (e) {
            this.log('TEST_CONNECTION', `down: ${e.message}`);
            return false;
        }
    }
    // --- Query execution ---
    async doExecuteQuery(sql, params) {
        if (!this.db)
            throw new Error('ClickHouse not connected. Call connect() first.');
        const { query, query_params } = this.bind(sql, params);
        const rs = await this.db.query({ query, query_params, format: 'JSONEachRow' });
        return await rs.json();
    }
    async doExecuteRun(sql, params) {
        if (!this.db)
            throw new Error('ClickHouse not connected. Call connect() first.');
        const { query, query_params } = this.bind(this.toMutation(sql), params);
        await this.db.command({ query, query_params });
        // ClickHouse n'expose pas d'affected-rows fiable sur INSERT/mutation.
        return { changes: 1 };
    }
}
export function createDialect() {
    return new ClickHouseDialect();
}

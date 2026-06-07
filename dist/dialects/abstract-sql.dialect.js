// Abstract SQL Dialect — base class for all SQL dialects
// Inspired by org.hibernate.dialect.Dialect (Hibernate ORM 6.4)
// Extracts ~80% of shared SQL logic from sqlite.dialect.ts
// Includes JDBC bridge support via JdbcNormalizer (transparent interception)
// Author: Dr Hamid MADANI drmdh@msn.com
import { randomUUID } from 'crypto';
import { normalizeIndexFields } from '../core/types.js';
import { JdbcNormalizer } from '../bridge/JdbcNormalizer.js';
import { hasJdbcDriver } from '../bridge/jdbc-registry.js';
import { BridgeManager } from '../bridge/BridgeManager.js';
// ============================================================
// SQL Logging — inspired by hibernate.show_sql / hibernate.format_sql
// ============================================================
// ANSI colors for highlight_sql
const C = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m', // dialect label
    yellow: '\x1b[33m', // SQL keywords
    green: '\x1b[32m', // table/column names
    magenta: '\x1b[35m', // values/params
    blue: '\x1b[34m', // operation
    gray: '\x1b[90m', // secondary info
};
const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|IF|NOT|EXISTS|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|UNIQUE|NULL|AND|OR|AS|COUNT|DISTINCT|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|JOIN|ON|IN|LIKE|BETWEEN|IS|CASCADE|PURGE|DEFAULT|VARCHAR|TEXT|INTEGER|TIMESTAMP|TIMESTAMPTZ|BOOLEAN|HAVING|LEFT|RIGHT|INNER|OUTER)\b/gi;
function highlightSql(sql) {
    return sql.replace(SQL_KEYWORDS, (kw) => `${C.yellow}${kw.toUpperCase()}${C.reset}`);
}
function logQuery(dialect, showSql, formatSql, operation, table, details, highlightEnabled = false) {
    if (!showSql)
        return;
    const prefix = highlightEnabled
        ? `${C.dim}[DAL:${C.cyan}${dialect}${C.dim}]${C.reset} ${C.blue}${operation}${C.reset} ${C.green}${table}${C.reset}`
        : `[DAL:${dialect}] ${operation} ${table}`;
    if (formatSql && details) {
        const d = details;
        const sql = d.sql;
        const params = d.params ?? d.values;
        if (sql) {
            const formatted = highlightEnabled ? highlightSql(sql) : sql;
            console.log(prefix);
            console.log(`  ${formatted}`);
            if (params && Array.isArray(params) && params.length > 0) {
                const paramStr = highlightEnabled
                    ? params.map((p, i) => `${C.gray}$${i + 1}=${C.magenta}${JSON.stringify(p)}${C.reset}`).join(', ')
                    : params.map((p, i) => `$${i + 1}=${JSON.stringify(p)}`).join(', ');
                console.log(`  ${C.gray ?? ''}params: [${paramStr}${C.gray ?? ''}]${C.reset ?? ''}`);
            }
        }
        else {
            console.log(prefix);
            console.log(JSON.stringify(details, null, 2));
        }
    }
    else if (details) {
        const d = details;
        const sql = d.sql;
        if (sql && highlightEnabled) {
            console.log(`${prefix} ${highlightSql(sql)}`);
        }
        else {
            console.log(`${prefix} ${JSON.stringify(details)}`);
        }
    }
    else {
        console.log(prefix);
    }
}
// ============================================================
// Utility — safe JSON parse
// ============================================================
function parseJsonSafe(val, fallback) {
    if (val === null || val === undefined)
        return fallback;
    if (typeof val !== 'string')
        return val;
    try {
        return JSON.parse(val);
    }
    catch {
        return fallback;
    }
}
/**
 * Convert basic regex patterns to SQL LIKE patterns.
 * Handles common cases: ^prefix, suffix$, .*contains.*
 */
function regexToLike(regex) {
    let pattern = regex;
    const hasStart = pattern.startsWith('^');
    const hasEnd = pattern.endsWith('$');
    pattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
    pattern = pattern.replace(/\.\*/g, '%');
    pattern = pattern.replace(/\./g, '_');
    if (!hasStart)
        pattern = `%${pattern}`;
    if (!hasEnd)
        pattern = `${pattern}%`;
    return pattern;
}
// ============================================================
// AbstractSqlDialect — base for all SQL dialects
// ============================================================
export class AbstractSqlDialect {
    /**
     * Applique `config.tablePrefix` (si défini) à un nom logique. À utiliser
     * SYSTÉMATIQUEMENT côté dialect avant `quoteIdentifier()` pour toute
     * référence physique à une table — y compris junction tables (m2m through),
     * tableExists(), CREATE TABLE / DROP TABLE / ALTER TABLE / CREATE INDEX,
     * et toute clause `FROM x` / `INSERT INTO x` / `UPDATE x` / `DELETE FROM x`.
     *
     * Lecture seule (ne touche pas à `schema.collection`) : permet aux schémas
     * register de rester portables — seul le SQL physique est préfixé.
     * Backward-compatible : si tablePrefix est undefined ou vide, retourne `name`
     * inchangé.
     */
    getPrefixedName(name) {
        const prefix = this.config?.tablePrefix;
        if (!prefix)
            return name;
        return `${prefix}${name}`;
    }
    // --- Concrete query methods with JDBC bridge interception ---
    /** Execute a SELECT query — routes to JDBC bridge or native driver */
    async executeQuery(sql, params) {
        if (this.jdbcBridgeActive)
            return this.bridgeExecuteQuery(sql, params);
        return this.doExecuteQuery(sql, params);
    }
    /** Execute a non-SELECT statement — routes to JDBC bridge or native driver */
    async executeRun(sql, params) {
        if (this.jdbcBridgeActive)
            return this.bridgeExecuteRun(sql, params);
        return this.doExecuteRun(sql, params);
    }
    /**
     * List existing column names for a table. Default uses ANSI
     * `information_schema.columns` (Postgres, MySQL, MariaDB, MSSQL, HSQLDB,
     * Spanner, CockroachDB). Oracle / SQLite / DB2 override with their native
     * catalog views.
     */
    async getExistingColumns(tableName) {
        try {
            const rows = await this.executeQuery(`SELECT column_name FROM information_schema.columns WHERE table_name = ${this.getPlaceholder(1)}`, [tableName]);
            const set = new Set();
            for (const r of rows) {
                const c = (r.column_name ?? r.COLUMN_NAME);
                if (c)
                    set.add(c);
            }
            return set;
        }
        catch {
            // Best-effort : if the catalog query is not supported, return an empty
            // set so initSchema falls back to "no missing columns" (legacy behavior).
            return new Set();
        }
    }
    // --- Protected state ---
    config = null;
    schemas = [];
    showSql = false;
    formatSql = false;
    highlightEnabled = false;
    paramCounter = 0;
    // --- JDBC Bridge state (transparent interception) ---
    bridgeInstance = null;
    jdbcBridgeActive = false;
    // --- Hooks (overridable by subclasses) ---
    /** Whether this dialect supports CREATE TABLE IF NOT EXISTS */
    supportsIfNotExists() { return true; }
    /** Whether this dialect supports RETURNING clause on INSERT */
    supportsReturning() { return false; }
    /**
     * Certains dialects (SQLite) ne supportent pas
     * `ALTER TABLE … ADD CONSTRAINT FOREIGN KEY` — les FK doivent être
     * déclarées dans le `CREATE TABLE` initial. Override à `false` dans
     * ces dialects pour basculer en mode FK in-line.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §6.
     */
    supportsAlterTableAddForeignKey() { return true; }
    /**
     * Certains dialects (MySQL ≤ 8.x, MariaDB) ne supportent pas
     * `CREATE UNIQUE INDEX … WHERE …` (partial unique index).
     * Override à `false` dans ces dialects ; les `sparse: true` sur softDelete
     * seront alors loggés en warning au lieu d'émettre le WHERE.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §10.
     */
    supportsPartialIndex() { return true; }
    /** Serialize a JS boolean to a DB value (default: 1/0) */
    serializeBoolean(v) { return v ? 1 : 0; }
    /** Deserialize a DB value to a JS boolean */
    deserializeBoolean(v) { return v === 1 || v === true || v === '1'; }
    /** Build the LIMIT/OFFSET clause (dialect-specific override) */
    buildLimitOffset(options) {
        let sql = '';
        if (options?.limit)
            sql += ` LIMIT ${options.limit}`;
        if (options?.skip)
            sql += ` OFFSET ${options.skip}`;
        return sql;
    }
    /** Get the CREATE TABLE prefix, including IF NOT EXISTS when supported */
    getCreateTablePrefix(tableName) {
        const q = this.quoteIdentifier(this.getPrefixedName(tableName));
        return this.supportsIfNotExists()
            ? `CREATE TABLE IF NOT EXISTS ${q}`
            : `CREATE TABLE ${q}`;
    }
    /** Get the CREATE INDEX prefix, including IF NOT EXISTS when supported */
    getCreateIndexPrefix(indexName, unique) {
        const u = unique ? 'UNIQUE ' : '';
        const q = this.quoteIdentifier(indexName);
        return this.supportsIfNotExists()
            ? `CREATE ${u}INDEX IF NOT EXISTS ${q}`
            : `CREATE ${u}INDEX ${q}`;
    }
    /** Execute a CREATE INDEX statement — overridable for dialects needing try/catch */
    async executeIndexStatement(stmt) {
        await this.executeRun(stmt, []);
    }
    // ------------------------------------------------------------------
    // Transactions — default BEGIN / COMMIT / ROLLBACK
    // ------------------------------------------------------------------
    /**
     * Dialect-specific override hook — SQL syntax for starting a transaction.
     * Most engines accept plain `BEGIN`; Oracle/DB2 use autocommit=off instead.
     * Override in a concrete dialect for non-standard syntax.
     */
    beginSql(opts) {
        if (opts?.isolation)
            return `BEGIN; SET TRANSACTION ISOLATION LEVEL ${opts.isolation}`;
        return 'BEGIN';
    }
    /** Dialect-specific override — returns null to skip (engine without explicit BEGIN). */
    commitSql() { return 'COMMIT'; }
    rollbackSql() { return 'ROLLBACK'; }
    // --- Savepoint hooks (nested transactions) ---
    /** Emit a SAVEPOINT statement. Return null to signal "no savepoint support". */
    savepointBeginSql(name) {
        return `SAVEPOINT ${this.quoteIdentifier(name)}`;
    }
    /** Release a savepoint (= nested commit). `null` means auto-release on successful path. */
    savepointReleaseSql(name) {
        return `RELEASE SAVEPOINT ${this.quoteIdentifier(name)}`;
    }
    /** Rollback to a savepoint (= nested rollback). */
    savepointRollbackSql(name) {
        return `ROLLBACK TO SAVEPOINT ${this.quoteIdentifier(name)}`;
    }
    /** Stack of active transaction levels — for nested-transaction bookkeeping. */
    txStack = [];
    /**
     * **Manual transaction API (public, since 1.11.0).**
     *
     * Opens a transaction and returns an opaque handle. Supports nesting :
     * the outermost call emits a real `BEGIN` ; subsequent nested calls emit
     * a `SAVEPOINT` (which all SQL engines except Spanner support). Pair
     * every `beginTx()` with exactly one `commitTx(tx)` or `rollbackTx(tx)`
     * in LIFO order.
     */
    async beginTx(opts) {
        const depth = this.txStack.length + 1;
        const id = `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        if (depth === 1) {
            const sql = this.beginSql(opts);
            if (sql)
                await this.executeRun(sql, []);
            this.txStack.push({ id });
            return { id, startedAt: Date.now(), depth };
        }
        // Nested : SAVEPOINT
        const savepointName = `mosta_sp_${depth}_${Math.random().toString(36).slice(2, 6)}`;
        const sql = this.savepointBeginSql(savepointName);
        if (!sql) {
            throw new Error(`[${this.dialectType}] nested transactions (savepoints) are not supported by this dialect. ` +
                `Flatten your flow, or use $transaction(cb) once at the outer level.`);
        }
        await this.executeRun(sql, []);
        this.txStack.push({ id, savepointName });
        return { id, startedAt: Date.now(), depth, savepointName };
    }
    async commitTx(tx) {
        const top = this.txStack[this.txStack.length - 1];
        if (!top || top.id !== tx.id) {
            throw new Error(`commitTx : out-of-order commit (expected ${top?.id ?? '(none)'}, got ${tx.id}). ` +
                `Nested transactions must be committed/rolled-back in LIFO order.`);
        }
        if (tx.depth === 1) {
            const sql = this.commitSql();
            if (sql)
                await this.executeRun(sql, []);
        }
        else if (tx.savepointName) {
            const sql = this.savepointReleaseSql(tx.savepointName);
            if (sql)
                await this.executeRun(sql, []);
        }
        this.txStack.pop();
    }
    async rollbackTx(tx) {
        const top = this.txStack[this.txStack.length - 1];
        if (!top || top.id !== tx.id) {
            // Out-of-order rollback : keep the stack consistent but do NOT throw —
            // the caller is usually already surfacing its own error.
            const idx = this.txStack.findIndex(t => t.id === tx.id);
            if (idx >= 0)
                this.txStack.splice(idx);
            return;
        }
        try {
            if (tx.depth === 1) {
                const sql = this.rollbackSql();
                if (sql)
                    await this.executeRun(sql, []);
            }
            else if (tx.savepointName) {
                const sql = this.savepointRollbackSql(tx.savepointName);
                if (sql)
                    await this.executeRun(sql, []);
            }
        }
        catch { /* swallow */ }
        this.txStack.pop();
    }
    /**
     * Run `cb` inside a BEGIN/COMMIT/ROLLBACK block. The same dialect instance
     * is passed to `cb` — all queries keep working without modification.
     *
     * Implementation detail : since 1.11.0 this delegates to the manual API
     * (`beginTx` / `commitTx` / `rollbackTx`) so that dialects only need to
     * override one of them to get both flavours consistent.
     *
     * For single-connection dialects (SQLite, HSQLDB embedded) this is strictly
     * ACID. For pool-based dialects (Postgres, MySQL, …) this serialises
     * correctly when `poolSize: 1`, and best-effort with a larger pool (queries
     * may land on different connections). Concrete dialects should override to
     * implement client checkout for strict correctness.
     */
    async $transaction(cb, opts) {
        const tx = await this.beginTx(opts);
        try {
            const result = await cb(this);
            await this.commitTx(tx);
            return result;
        }
        catch (err) {
            await this.rollbackTx(tx);
            throw err;
        }
    }
    /** Serialize date values to a format suitable for this dialect */
    serializeDate(value) {
        let d = null;
        if (value === 'now' || value === '__MOSTA_NOW__')
            d = new Date();
        else if (value instanceof Date)
            d = value;
        else if (typeof value === 'string') {
            // If going through JDBC bridge, normalize ISO strings to JDBC format
            if (this.jdbcBridgeActive) {
                d = new Date(value);
                if (isNaN(d.getTime()))
                    return value;
            }
            else {
                return value;
            }
        }
        if (!d)
            return null;
        // JDBC dialects need 'yyyy-MM-dd HH:mm:ss' format (no T, no Z)
        if (this.jdbcBridgeActive) {
            return d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0') + ' ' +
                String(d.getHours()).padStart(2, '0') + ':' +
                String(d.getMinutes()).padStart(2, '0') + ':' +
                String(d.getSeconds()).padStart(2, '0');
        }
        return d.toISOString();
    }
    /** Serialize JSON/array values */
    serializeJson(value) {
        return typeof value === 'string' ? value : JSON.stringify(value);
    }
    /**
     * Build a regex/LIKE condition. Override for case-sensitive dialects.
     * Default: LIKE (case-insensitive in MySQL, SQLite, MSSQL; case-sensitive in Postgres, Oracle, DB2, HANA).
     * Postgres overrides to use ILIKE when flags contain 'i'.
     */
    buildRegexCondition(col, flags) {
        // Default: just use LIKE — subclasses override for case-insensitive support
        return `${col} LIKE ${this.nextPlaceholder()}`;
    }
    /** Dialect label for logging */
    getDialectLabel() {
        return this.dialectType.charAt(0).toUpperCase() + this.dialectType.slice(1);
    }
    // --- Logging helper ---
    log(operation, table, details) {
        logQuery(this.getDialectLabel(), this.showSql, this.formatSql, operation, table, details, this.highlightEnabled);
    }
    // --- Placeholder counter management ---
    /** Reset the parameter counter (call before building a new statement) */
    resetParams() {
        this.paramCounter = 0;
    }
    /** Get the next placeholder and increment the counter */
    nextPlaceholder() {
        this.paramCounter++;
        return this.getPlaceholder(this.paramCounter);
    }
    // ============================================================
    // Value Serialization / Deserialization
    // ============================================================
    serializeValue(value, field) {
        if (value === undefined || value === null)
            return null;
        if (field?.type === 'boolean' || typeof value === 'boolean') {
            return this.serializeBoolean(value);
        }
        if (field?.type === 'date' || value instanceof Date) {
            return this.serializeDate(value);
        }
        if (field?.type === 'json' || field?.type === 'array') {
            return this.serializeJson(value);
        }
        if (Array.isArray(value)) {
            return JSON.stringify(value);
        }
        if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
        }
        return value;
    }
    deserializeRow(row, schema) {
        if (!row)
            return row;
        const result = {};
        for (const [key, val] of Object.entries(row)) {
            if (key === 'id') {
                result.id = val;
                continue;
            }
            const fieldDef = schema.fields[key];
            const relDef = schema.relations?.[key];
            if (fieldDef) {
                result[key] = this.deserializeField(val, fieldDef);
            }
            else if (relDef) {
                if (relDef.type === 'many-to-many') {
                    result[key] = [];
                    continue;
                }
                // O2M: no column on parent table — populated via query on child table
                if (relDef.type === 'one-to-many') {
                    result[key] = [];
                    continue;
                }
                // M2O / O2O: FK value
                result[key] = val;
            }
            else if (key === 'createdAt' || key === 'updatedAt') {
                result[key] = val;
            }
            else {
                result[key] = val;
            }
        }
        // Ensure many-to-many relations default to []
        for (const [relName, relDef] of Object.entries(schema.relations || {})) {
            if (relDef.type === 'many-to-many' && !(relName in result)) {
                result[relName] = [];
            }
        }
        return result;
    }
    deserializeField(val, field) {
        if (val === null || val === undefined)
            return val;
        switch (field.type) {
            case 'boolean':
                return this.deserializeBoolean(val);
            case 'date':
                return val;
            case 'json':
                return parseJsonSafe(val, val);
            case 'array':
                return parseJsonSafe(val, []);
            case 'number':
                return val;
            case 'text':
                return val;
            default:
                return val;
        }
    }
    // ============================================================
    // Discriminator support (single-table inheritance)
    // ============================================================
    /**
     * Inject discriminator filter into any query.
     * If the schema has discriminator + discriminatorValue, adds: AND _type = 'article'
     */
    applyDiscriminator(filter, schema) {
        if (!schema.discriminator || !schema.discriminatorValue)
            return filter;
        return { ...filter, [schema.discriminator]: schema.discriminatorValue };
    }
    /**
     * Inject discriminator field into INSERT data.
     * If the schema has discriminator + discriminatorValue, adds _type: 'article' to the row.
     */
    applyDiscriminatorToData(data, schema) {
        if (!schema.discriminator || !schema.discriminatorValue)
            return data;
        return { ...data, [schema.discriminator]: schema.discriminatorValue };
    }
    /**
     * Add discriminator column to CREATE TABLE DDL if schema uses single-table inheritance.
     */
    getDiscriminatorColumnDDL(schema) {
        if (!schema.discriminator)
            return null;
        return `${this.quoteIdentifier(schema.discriminator)} VARCHAR(100) NOT NULL`;
    }
    // ============================================================
    // Soft-delete support
    // ============================================================
    /**
     * Inject soft-delete filter: WHERE deletedAt IS NULL
     * Automatically applied to find/count/distinct/search queries.
     *
     * Bypass explicite : `options.includeDeleted === true` retourne le filter
     * inchangé (les lignes soft-deletées sont alors visibles).
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §1.
     */
    applySoftDeleteFilter(filter, schema, options) {
        if (!schema.softDelete)
            return filter;
        if (options?.includeDeleted === true)
            return filter;
        if ('deletedAt' in filter)
            return filter;
        return { ...filter, deletedAt: { $eq: null } };
    }
    // ============================================================
    // Filter Translation — DAL FilterQuery → SQL WHERE clause
    // ============================================================
    translateFilter(filter, schema) {
        const conditions = [];
        const params = [];
        for (const [key, value] of Object.entries(filter)) {
            if (key === '$or' && Array.isArray(value)) {
                const orClauses = value.map(f => this.translateFilter(f, schema));
                if (orClauses.length > 0) {
                    const orSql = orClauses.map(c => `(${c.sql})`).join(' OR ');
                    conditions.push(`(${orSql})`);
                    for (const c of orClauses)
                        params.push(...c.params);
                }
                continue;
            }
            if (key === '$and' && Array.isArray(value)) {
                const andClauses = value.map(f => this.translateFilter(f, schema));
                if (andClauses.length > 0) {
                    const andSql = andClauses.map(c => `(${c.sql})`).join(' AND ');
                    conditions.push(`(${andSql})`);
                    for (const c of andClauses)
                        params.push(...c.params);
                }
                continue;
            }
            const col = this.quoteIdentifier(key);
            if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                const op = value;
                if ('$eq' in op) {
                    if (op.$eq === null) {
                        conditions.push(`${col} IS NULL`);
                    }
                    else {
                        conditions.push(`${col} = ${this.nextPlaceholder()}`);
                        params.push(this.serializeForFilter(op.$eq, key, schema));
                    }
                }
                if ('$ne' in op) {
                    if (op.$ne === null) {
                        conditions.push(`${col} IS NOT NULL`);
                    }
                    else {
                        conditions.push(`${col} != ${this.nextPlaceholder()}`);
                        params.push(this.serializeForFilter(op.$ne, key, schema));
                    }
                }
                if ('$gt' in op) {
                    conditions.push(`${col} > ${this.nextPlaceholder()}`);
                    params.push(this.serializeForFilter(op.$gt, key, schema));
                }
                if ('$gte' in op) {
                    conditions.push(`${col} >= ${this.nextPlaceholder()}`);
                    params.push(this.serializeForFilter(op.$gte, key, schema));
                }
                if ('$lt' in op) {
                    conditions.push(`${col} < ${this.nextPlaceholder()}`);
                    params.push(this.serializeForFilter(op.$lt, key, schema));
                }
                if ('$lte' in op) {
                    conditions.push(`${col} <= ${this.nextPlaceholder()}`);
                    params.push(this.serializeForFilter(op.$lte, key, schema));
                }
                if ('$in' in op && Array.isArray(op.$in)) {
                    if (op.$in.length === 0) {
                        conditions.push('1=0'); // empty IN → always false, 0 results
                    }
                    else {
                        const placeholders = op.$in.map(() => this.nextPlaceholder()).join(', ');
                        conditions.push(`${col} IN (${placeholders})`);
                        for (const v of op.$in)
                            params.push(this.serializeForFilter(v, key, schema));
                    }
                }
                if ('$nin' in op && Array.isArray(op.$nin)) {
                    if (op.$nin.length === 0) {
                        // empty NOT IN → exclude nothing, no filter needed
                    }
                    else {
                        const placeholders = op.$nin.map(() => this.nextPlaceholder()).join(', ');
                        conditions.push(`${col} NOT IN (${placeholders})`);
                        for (const v of op.$nin)
                            params.push(this.serializeForFilter(v, key, schema));
                    }
                }
                if ('$regex' in op) {
                    const pattern = regexToLike(op.$regex);
                    const flags = op.$regexFlags;
                    conditions.push(this.buildRegexCondition(col, flags));
                    params.push(pattern);
                }
                if ('$exists' in op) {
                    if (op.$exists) {
                        conditions.push(`${col} IS NOT NULL`);
                    }
                    else {
                        conditions.push(`${col} IS NULL`);
                    }
                }
            }
            else {
                if (value === null) {
                    conditions.push(`${col} IS NULL`);
                }
                else {
                    conditions.push(`${col} = ${this.nextPlaceholder()}`);
                    params.push(this.serializeForFilter(value, key, schema));
                }
            }
        }
        return {
            sql: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
            params,
        };
    }
    serializeForFilter(value, fieldName, schema) {
        const field = schema.fields[fieldName];
        if (field)
            return this.serializeValue(value, field);
        if (typeof value === 'boolean')
            return this.serializeBoolean(value);
        if (value instanceof Date)
            return this.serializeDate(value);
        return value;
    }
    // ============================================================
    // Query Building Helpers
    // ============================================================
    buildSelectColumns(schema, options) {
        if (options?.select && options.select.length > 0) {
            const cols = ['id', ...options.select.filter(f => f !== 'id')];
            return cols.map(c => this.quoteIdentifier(c)).join(', ');
        }
        if (options?.exclude && options.exclude.length > 0) {
            const allCols = this.getAllColumns(schema);
            const filtered = allCols.filter(c => !options.exclude.includes(c));
            return filtered.map(c => this.quoteIdentifier(c)).join(', ');
        }
        return '*';
    }
    getAllColumns(schema) {
        const cols = ['id'];
        cols.push(...Object.keys(schema.fields || {}));
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.type !== 'many-to-many') {
                cols.push(name);
            }
        }
        if (schema.timestamps) {
            cols.push('createdAt', 'updatedAt');
        }
        if (schema.discriminator) {
            cols.push(schema.discriminator);
        }
        if (schema.softDelete) {
            cols.push('deletedAt');
        }
        return cols;
    }
    buildOrderBy(options) {
        if (!options?.sort)
            return '';
        const clauses = Object.entries(options.sort)
            .map(([field, dir]) => `${this.quoteIdentifier(field)} ${dir === -1 ? 'DESC' : 'ASC'}`);
        return clauses.length > 0 ? ` ORDER BY ${clauses.join(', ')}` : '';
    }
    // ============================================================
    // Data Preparation — EntitySchema + data → columns/values
    // ============================================================
    prepareInsertData(schema, data) {
        const columns = ['id'];
        const placeholders = [this.nextPlaceholder()];
        const id = data.id || randomUUID();
        const values = [id];
        for (const [name, field] of Object.entries(schema.fields || {})) {
            // 'id' and '_id' are emitted unconditionally above as the PK column.
            // Skip them here so we never produce SQL like
            //   INSERT INTO "users" ("id", "id", "email", …)
            // which Oracle (rightly) rejects with ORA-00957 "duplicate column name".
            // SQLite and Postgres tolerate this silently — the bug stayed hidden
            // until the first Oracle / DB2 / MSSQL run.
            if (name === 'id' || name === '_id')
                continue;
            if (name in data) {
                columns.push(name);
                placeholders.push(this.nextPlaceholder());
                values.push(this.serializeValue(data[name], field));
            }
            else if (field.default !== undefined) {
                columns.push(name);
                placeholders.push(this.nextPlaceholder());
                const isNowSentinel = field.default === 'now' || field.default === '__MOSTA_NOW__';
                const def = isNowSentinel ? this.serializeDate('now') : field.default;
                values.push(this.serializeValue(def, field));
            }
        }
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many')
                continue;
            // O2M: FK lives on the child table, nothing to insert on parent
            if (rel.type === 'one-to-many')
                continue;
            // M2O / O2O: FK column on this table
            if (name in data) {
                const colName = rel.joinColumn || name;
                columns.push(colName);
                placeholders.push(this.nextPlaceholder());
                // Empty string → null for FK columns (avoids FOREIGN KEY constraint failures)
                // Use ?? instead of || to preserve falsy-but-valid values (0, false)
                values.push(data[name] === '' ? null : (data[name] ?? null));
            }
        }
        if (schema.timestamps) {
            const now = this.serializeDate('now');
            if (!columns.includes('createdAt')) {
                columns.push('createdAt');
                placeholders.push(this.nextPlaceholder());
                values.push(now);
            }
            if (!columns.includes('updatedAt')) {
                columns.push('updatedAt');
                placeholders.push(this.nextPlaceholder());
                values.push(now);
            }
        }
        // Extra columns not in schema.fields or relations (e.g. discriminator _type)
        const relationKeys = new Set(Object.keys(schema.relations || {}));
        for (const key of Object.keys(data)) {
            if (!columns.includes(key) && key !== 'id' && !relationKeys.has(key)) {
                columns.push(key);
                placeholders.push(this.nextPlaceholder());
                // Colonne non déclarée : sérialiser selon le type inféré (json/array/date/…)
                // sinon le driver rejette les objets/Date. La colonne est garantie par
                // ensureColumnsForData() appelé en amont (anomalie #20).
                const f = schema.fields?.[key] ?? { type: this.inferFieldType(data[key]) };
                values.push(this.serializeValue(data[key], f));
            }
        }
        return { columns, placeholders, values };
    }
    prepareUpdateData(schema, data) {
        const setClauses = [];
        const values = [];
        for (const [key, val] of Object.entries(data)) {
            if (key === 'id' || key === '_id')
                continue;
            const field = schema.fields[key];
            const rel = schema.relations?.[key];
            if (field) {
                setClauses.push(`${this.quoteIdentifier(key)} = ${this.nextPlaceholder()}`);
                values.push(this.serializeValue(val, field));
            }
            else if (rel) {
                if (rel.type === 'many-to-many')
                    continue;
                // O2M: FK lives on child table, nothing to update on parent
                if (rel.type === 'one-to-many')
                    continue;
                // M2O / O2O: FK column on this table
                const colName = rel.joinColumn || key;
                setClauses.push(`${this.quoteIdentifier(colName)} = ${this.nextPlaceholder()}`);
                // Empty string → null for FK columns (avoids FOREIGN KEY constraint failures)
                values.push(val === '' ? null : (val ?? null));
            }
            else if (key === 'createdAt' || key === 'updatedAt') {
                setClauses.push(`${this.quoteIdentifier(key)} = ${this.nextPlaceholder()}`);
                values.push(this.serializeDate(val));
            }
            else {
                // Champ NON déclaré présent dans la donnée : la colonne est garantie par
                // ensureColumnsForData() (anomalie #20) → on l'écrit (type inféré) au lieu de l'ignorer.
                setClauses.push(`${this.quoteIdentifier(key)} = ${this.nextPlaceholder()}`);
                values.push(this.serializeValue(val, { type: this.inferFieldType(val) }));
            }
        }
        // Auto-update updatedAt
        if (schema.timestamps && !setClauses.some(c => c.includes(this.quoteIdentifier('updatedAt')))) {
            setClauses.push(`${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`);
            values.push(this.serializeDate('now'));
        }
        return { setClauses, values };
    }
    // ============================================================
    // Auto-DDL au write (anomalie #20)
    // ------------------------------------------------------------
    // Quand une donnée porte un champ SANS colonne correspondante — qu'il soit
    // déclaré au schéma OU non — l'ORM ne doit pas échouer ("no such column") ni
    // l'ignorer silencieusement : il ajoute la colonne via ALTER TABLE ADD COLUMN.
    // Type : champ déclaré si connu, FK (id) pour une relation, sinon INFÉRÉ de la
    // valeur. Actif seulement si `schemaStrategy` autorise le DDL (≠ 'none').
    // Colonnes connues mises en cache par collection (introspection 1×).
    // ============================================================
    __knownColumns = new Map();
    /** Type de champ DAL inféré d'une valeur JS (pour une colonne non déclarée). */
    inferFieldType(value) {
        if (typeof value === 'number')
            return 'number';
        if (typeof value === 'boolean')
            return 'boolean';
        if (value instanceof Date)
            return 'date';
        if (Array.isArray(value))
            return 'array';
        if (value !== null && typeof value === 'object')
            return 'json';
        return 'string';
    }
    /** Ajoute (ALTER TABLE) les colonnes manquantes pour les clés présentes dans `data`. */
    async ensureColumnsForData(schema, data) {
        const strat = this.config?.schemaStrategy;
        if (!strat || strat === 'none')
            return; // mode strict : pas de DDL au write
        const coll = this.getPrefixedName(schema.collection);
        let known = this.__knownColumns.get(coll);
        if (!known) {
            try {
                const cols = await this.getExistingColumns(schema.collection);
                if (!cols || cols.size === 0)
                    return; // table absente → initSchema s'en charge
                known = new Set([...cols].map(c => c.toLowerCase()));
                this.__knownColumns.set(coll, known);
            }
            catch {
                return; // introspection impossible → on laisse
            }
        }
        const relationKeys = new Set(Object.keys(schema.relations || {}));
        const q = (n) => this.quoteIdentifier(n);
        const table = q(coll);
        for (const key of Object.keys(data)) {
            if (key === 'id' || key === '_id')
                continue;
            // Nom de colonne réel (relation M2O/O2O → joinColumn ; M2M/O2M → pas de colonne).
            let colName = key;
            if (relationKeys.has(key)) {
                const rel = schema.relations[key];
                if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                    continue;
                colName = rel.joinColumn || key;
            }
            if (known.has(colName.toLowerCase()))
                continue;
            // Type : déclaré > relation (id) > inféré.
            let sqlType;
            const field = schema.fields?.[key];
            if (relationKeys.has(key))
                sqlType = this.getIdColumnType();
            else if (field)
                sqlType = this.fieldToSqlType(field);
            else
                sqlType = this.fieldToSqlType({ type: this.inferFieldType(data[key]) });
            const sql = `ALTER TABLE ${table} ADD ${q(colName)} ${sqlType}`;
            try {
                this.log('DDL_ALTER_ADD_DATA', `${coll}.${colName}`, sql);
                await this.executeRun(sql, []);
                known.add(colName.toLowerCase());
            }
            catch (e) {
                this.log('DDL_ALTER_ADD_DATA_FAIL', `${coll}.${colName}`, e.message);
            }
        }
    }
    // ============================================================
    // DDL Generation — EntitySchema → CREATE TABLE
    // ============================================================
    generateCreateTable(schema, allSchemas) {
        const q = (name) => this.quoteIdentifier(name);
        const cols = [`  ${q('id')} ${this.getIdColumnType()} PRIMARY KEY`];
        // Pré-calcul : noms de colonnes FK que les relations vont générer.
        // Évite la collision "duplicate column name" quand un consumer
        // déclare la colonne FK à la fois dans `fields` et via une relation
        // avec `joinColumn` (cf. docs/ANOMALIES-LOT3-2026-05-25.md §2).
        const fkColumnNames = new Set();
        for (const [relName, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                continue;
            fkColumnNames.add(rel.joinColumn || relName);
        }
        for (const [name, field] of Object.entries(schema.fields || {})) {
            // Skip 'id' — already added as PK above
            if (name === 'id')
                continue;
            // Skip field si une relation génère déjà la colonne homonyme
            // (la relation gagne — elle apporte le type id correct, NOT NULL/UNIQUE
            // selon required/one-to-one, FK natives).
            if (fkColumnNames.has(name)) {
                this.log('SCHEMA', `${schema.name}.${name} déjà couvert par une relation joinColumn — field redondant ignoré`);
                continue;
            }
            let colDef = `  ${q(name)} ${this.fieldToSqlType(field)}`;
            // DEFAULT must come before NOT NULL for HSQLDB compatibility
            // 'now' and '__MOSTA_NOW__' (the adapter's sentinel) both mean "current time":
            // these are filled in at INSERT, not via a DEFAULT clause (portable across dialects).
            const isNowDefault = field.default === 'now' || field.default === '__MOSTA_NOW__';
            if (field.default !== undefined && !isNowDefault && field.default !== null) {
                const defVal = this.serializeValue(field.default, field);
                if (typeof defVal === 'string')
                    colDef += ` DEFAULT '${defVal.replace(/'/g, "''")}'`;
                else if (typeof defVal === 'number')
                    colDef += ` DEFAULT ${defVal}`;
            }
            if (field.required)
                colDef += ' NOT NULL';
            // UNIQUE inline : skipped si schema.softDelete ET dialect supporte les
            // partial indexes (sera alors géré par un partial unique index `WHERE
            // deletedAt IS NULL` dans generateIndexes — R003B). Sur les dialects
            // sans partial index (MySQL ≤ 8.x), on garde le UNIQUE inline (mais
            // réinsertion sera bloquée par la contrainte — log warning émis).
            // Voir docs/ANOMALIES-LOT3-2026-05-25.md §10.
            const skipUniqueInline = field.unique && schema.softDelete && this.supportsPartialIndex();
            if (field.unique && !skipUniqueInline)
                colDef += ' UNIQUE';
            cols.push(colDef);
        }
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many')
                continue;
            // O2M: no column on parent — FK lives on the child table (mappedBy)
            if (rel.type === 'one-to-many')
                continue;
            // M2O / O2O: FK column on this table
            let colDef = `  ${q(rel.joinColumn || name)} ${this.getIdColumnType()}`;
            if (rel.required)
                colDef += ' NOT NULL';
            if (rel.type === 'one-to-one')
                colDef += ' UNIQUE';
            cols.push(colDef);
        }
        if (schema.timestamps) {
            cols.push(`  ${q('createdAt')} ${this.fieldToSqlType({ type: 'date' })}`);
            cols.push(`  ${q('updatedAt')} ${this.fieldToSqlType({ type: 'date' })}`);
        }
        // Discriminator column (single-table inheritance)
        const discDdl = this.getDiscriminatorColumnDDL(schema);
        if (discDdl) {
            cols.push(`  ${discDdl}`);
        }
        // Soft-delete column
        if (schema.softDelete) {
            cols.push(`  ${q('deletedAt')} ${this.fieldToSqlType({ type: 'date' })}`);
        }
        // FK in-line pour dialects sans ALTER TABLE ADD CONSTRAINT FK (SQLite).
        // Voir docs/ANOMALIES-LOT3-2026-05-25.md §6.
        // Note : le `target` peut référencer un schema non encore créé au moment
        // de ce CREATE TABLE — SQLite résout les FK au INSERT, pas au CREATE.
        if (!this.supportsAlterTableAddForeignKey()) {
            const targetCollections = new Map();
            for (const s of allSchemas || []) {
                targetCollections.set(s.name, s.collection);
            }
            for (const [name, rel] of Object.entries(schema.relations || {})) {
                if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                    continue;
                const colName = rel.joinColumn || name;
                const targetCollection = targetCollections.get(rel.target) || rel.target.toLowerCase();
                const onDel = rel.onDelete || (rel.nullable !== false ? 'set-null' : 'restrict');
                const onDelSql = onDel.toUpperCase().replace('-', ' ');
                cols.push(`  FOREIGN KEY (${q(colName)}) REFERENCES ${q(this.getPrefixedName(targetCollection))}(${q('id')}) ON DELETE ${onDelSql}`);
            }
        }
        return `${this.getCreateTablePrefix(schema.collection)} (\n${cols.join(',\n')}\n)`;
    }
    /**
     * Ensemble des colonnes physiques d'un schéma, dans le même référentiel que
     * `generateCreateTable` / `addMissingColumns` : `id`, les `fields`, les
     * colonnes FK (`joinColumn` des relations M2O/O2O), et les colonnes système
     * (`createdAt`/`updatedAt` si `timestamps`, `deletedAt` si `softDelete`, la
     * colonne discriminator si `discriminator`). Sert à valider qu'un champ
     * d'index pointe une colonne réelle AVANT d'émettre le DDL — sinon le
     * `CREATE INDEX` échoue ("no such column") et avorte tout l'initSchema.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §18.
     */
    getKnownColumns(schema) {
        const cols = new Set(['id']);
        for (const name of Object.keys(schema.fields || {}))
            cols.add(name);
        for (const [relName, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' || rel.type === 'one-to-many')
                continue;
            cols.add(rel.joinColumn || relName);
        }
        if (schema.timestamps) {
            cols.add('createdAt');
            cols.add('updatedAt');
        }
        if (schema.softDelete)
            cols.add('deletedAt');
        if (schema.discriminator)
            cols.add(schema.discriminator);
        return cols;
    }
    generateIndexes(schema) {
        const statements = [];
        const knownColumns = this.getKnownColumns(schema);
        // `indexes` is an optional field in EntitySchema — guard against schemas
        // that simply omit it (e.g. minimal payloads received via
        // POST /api/upload-schemas-json).
        // Normalize each index's `fields` to the canonical object form up-front so
        // the array shorthand (['email']) and the auto-partial block below both see
        // a stable {col: dir} shape. Without this, Object.entries(['email']) yields
        // a column named "0" (silent on SQLite, fatal on Postgres/PGlite). §17.
        const indexes = (schema.indexes ?? []).map(idx => ({
            ...idx,
            fields: normalizeIndexFields(idx.fields),
        }));
        for (let i = 0; i < indexes.length; i++) {
            const idx = indexes[i];
            const fields = Object.entries(idx.fields);
            // Skip text indexes
            if (fields.some(([, dir]) => dir === 'text'))
                continue;
            // Validation B (§18) : chaque champ d'index doit correspondre à une
            // colonne physique. Sinon le CREATE INDEX échouerait avec un diagnostic
            // obscur ("no such column") et — avant le filet try/catch d'initSchema —
            // avortait l'init de TOUS les schemas suivants. On saute l'index fautif
            // en nommant explicitement la/les colonne(s) introuvable(s).
            const unknownCols = fields.map(([f]) => f).filter(f => !knownColumns.has(f));
            if (unknownCols.length > 0) {
                this.log('DDL_INDEX_SKIP', `${schema.name}: index #${i} ignoré — colonne(s) inexistante(s): [${unknownCols.join(', ')}]. ` +
                    `Colonnes connues: [${[...knownColumns].join(', ')}]. ` +
                    `Vérifiez schema.indexes[${i}].fields (un index sur une relation doit viser sa joinColumn).`);
                continue;
            }
            const idxName = `idx_${schema.collection}_${i}`;
            const colDefs = fields.map(([f, dir]) => `${this.quoteIdentifier(f)} ${dir === 'desc' ? 'DESC' : 'ASC'}`);
            let stmt = `${this.getCreateIndexPrefix(idxName, idx.unique ?? false)} ON ${this.quoteIdentifier(this.getPrefixedName(schema.collection))} (${colDefs.join(', ')})`;
            // Partial unique index sur softDelete : sparse:true sur unique index
            // d'un schéma softDelete → WHERE deletedAt IS NULL. Permet la réinsertion
            // après soft-delete (R003B). Voir docs/ANOMALIES-LOT3-2026-05-25.md §10.
            if (idx.unique && idx.sparse && schema.softDelete) {
                if (this.supportsPartialIndex()) {
                    stmt += ` WHERE ${this.quoteIdentifier('deletedAt')} IS NULL`;
                }
                else {
                    this.log('DDL_PARTIAL_INDEX', `${schema.name}.idx_${i}: sparse ignoré (dialect ne supporte pas WHERE) — réinsertion bloquée tant que soft-deleted présent`);
                }
            }
            statements.push(stmt);
        }
        // Auto-générer un partial unique index pour chaque field.unique d'un schéma
        // softDelete (le UNIQUE inline est skipped au CREATE TABLE — voir §10).
        if (schema.softDelete && this.supportsPartialIndex()) {
            let autoIdx = 0;
            for (const [name, field] of Object.entries(schema.fields || {})) {
                if (!field.unique)
                    continue;
                // Skip si déjà couvert par un index unique explicite sur ce field seul
                const covered = indexes.some((i) => i.unique && Object.keys(i.fields).length === 1 && i.fields[name]);
                if (covered)
                    continue;
                const idxName = `uidx_${schema.collection}_${name}_softdelete`;
                statements.push(`${this.getCreateIndexPrefix(idxName, true)} ON ${this.quoteIdentifier(this.getPrefixedName(schema.collection))} (${this.quoteIdentifier(name)}) WHERE ${this.quoteIdentifier('deletedAt')} IS NULL`);
                autoIdx++;
            }
            if (autoIdx > 0)
                this.log('DDL_AUTO_PARTIAL_UNIQUE', `${schema.name}: ${autoIdx} partial unique index(es) generated for softDelete`);
        }
        else if (schema.softDelete && !this.supportsPartialIndex()) {
            // Si on a au moins un field.unique, prévenir l'utilisateur
            const hasFieldUnique = Object.values(schema.fields || {}).some(f => f.unique);
            if (hasFieldUnique) {
                this.log('DDL_PARTIAL_INDEX', `${schema.name}: softDelete + field.unique mais dialect ne supporte pas partial index — UNIQUE inline réactivé (réinsertion impossible)`);
            }
        }
        return statements;
    }
    // ============================================================
    // IDialect Implementation — Lifecycle
    // ============================================================
    async connect(config) {
        this.config = config;
        this.showSql = config.showSql ?? false;
        this.formatSql = config.formatSql ?? false;
        this.highlightEnabled = config.highlightSql ?? false;
        // --- JDBC Bridge interception via BridgeManager ---
        // If a JDBC JAR is available for this dialect, use the bridge
        // instead of calling the dialect's doConnect() (npm driver).
        // BridgeManager handles multi-bridge, port management, PID files, autostart.
        const jarDir = config.options?.jarDir;
        if (hasJdbcDriver(this.dialectType) && JdbcNormalizer.isAvailable(this.dialectType, jarDir)) {
            const manager = BridgeManager.getInstance();
            this.bridgeInstance = await manager.getOrCreate(this.dialectType, config.uri, {
                jarDir,
                bridgeJavaFile: config.options?.bridgeJavaFile,
            });
            this.jdbcBridgeActive = true;
            this.log('CONNECT', `${config.uri} [via JDBC bridge on port ${this.bridgeInstance.port}]`);
        }
        else {
            // No JAR found — use the dialect's native npm driver
            await this.doConnect(config);
            this.log('CONNECT', config.uri);
        }
        if (config.schemaStrategy === 'create') {
            // Drop SCOPED aux schemas qui SERONT register par initSchema (this.schemas
            // est encore vide ici — on déclenche le drop scoped en lazy via initSchema
            // qui handle déjà create-drop boot ; pour 'create' strict, on log et on
            // laisse initSchema gérer via le même path scoped).
            // Si l'utilisateur veut le legacy "drop tout le DB" pour 'create', il peut
            // appeler explicitement `await dialect.dropAllTables()` avant connect.
            this.log('SCHEMA', 'create — drop+recreate délégué à initSchema (scoped)');
        }
    }
    async disconnect() {
        if (this.config?.schemaStrategy === 'create-drop') {
            // Drop SCOPED aux schemas register (pas tout le DB) — cohérent avec le
            // DROP au boot (anomalie #14 fix 2.2.9). Sans ce scope, deux process
            // séquentiels qui partagent la DB en mode 'create-drop' au boot mais
            // 'update' au seed suivant verraient leurs données effacées au
            // shutdown du premier (cas révélé par seeds/index.ts SEED_FRESH=1).
            // Si `schemas` est vide (rare), on retombe sur dropAllTables comme
            // avant pour ne pas régresser le cas test isolé.
            if (this.schemas && this.schemas.length > 0) {
                this.log('SCHEMA', `create-drop — dropping ${this.schemas.length} registered schemas on shutdown`);
                await this.dropSchema(this.schemas);
            }
            else {
                this.log('SCHEMA', 'create-drop — dropping all tables on shutdown (no registered schemas)');
                await this.dropAllTables();
            }
        }
        if (this.jdbcBridgeActive && this.bridgeInstance) {
            // Do NOT stop the bridge — BridgeManager manages its lifecycle.
            // Other dialect instances may reuse the same bridge.
            // Bridges are stopped by BridgeManager.stopAll() on app exit.
            this.bridgeInstance = null;
            this.jdbcBridgeActive = false;
        }
        else {
            await this.doDisconnect();
        }
        this.config = null;
        this.schemas = [];
        this.log('DISCONNECT', '');
    }
    async testConnection() {
        try {
            if (this.jdbcBridgeActive && this.bridgeInstance) {
                // Use dialect-appropriate ping query
                const pingQuery = this.dialectType === 'hsqldb'
                    ? 'SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS'
                    : this.dialectType === 'oracle'
                        ? 'SELECT 1 FROM DUAL'
                        : 'SELECT 1';
                const result = await this.bridgeInstance.normalizer.query(pingQuery, []);
                return Array.isArray(result);
            }
            return await this.doTestConnection();
        }
        catch (err) {
            console.error(`[${this.dialectType}] testConnection failed:`, err instanceof Error ? err.message : err);
            return false;
        }
    }
    // --- JDBC Bridge query methods (used by executeQuery/executeRun interception) ---
    /**
     * Execute a SELECT query via the JDBC bridge.
     * Called transparently when jdbcBridgeActive is true.
     */
    async bridgeExecuteQuery(sql, params) {
        if (!this.bridgeInstance)
            throw new Error('JDBC bridge not initialized');
        return this.bridgeInstance.normalizer.query(sql, params);
    }
    /**
     * Execute a non-SELECT statement via the JDBC bridge.
     * Called transparently when jdbcBridgeActive is true.
     */
    async bridgeExecuteRun(sql, params) {
        if (!this.bridgeInstance)
            throw new Error('JDBC bridge not initialized');
        const result = await this.bridgeInstance.normalizer.query(sql, params);
        return { changes: result?.changes ?? 0 };
    }
    /** Whether the JDBC bridge is active for this dialect instance */
    get isJdbcBridgeActive() {
        return this.jdbcBridgeActive;
    }
    // --- Schema management (hibernate.hbm2ddl.auto) ---
    /**
     * For an existing table, add any fields/relations that are declared in the
     * schema but missing from the live table. Works in `update` strategy.
     * Skipped silently if the dialect can't list its columns (best-effort).
     */
    async addMissingColumns(schema) {
        const q = (n) => this.quoteIdentifier(n);
        let existing;
        try {
            existing = await this.getExistingColumns(schema.collection);
        }
        catch {
            return; // can't introspect → leave table alone
        }
        if (existing.size === 0)
            return;
        // Case-insensitive lookup helper (Oracle uppercases by default, MySQL is
        // typically lowercase, etc. — match by lowercased column name).
        const has = (name) => {
            const lc = name.toLowerCase();
            for (const c of existing)
                if (c.toLowerCase() === lc)
                    return true;
            return false;
        };
        // Field columns. We DO consider 'id' here : some legacy tables use a
        // composite PK (e.g. user_roles(userId, roleId)) without a surrogate id
        // column — when migrating to the new schema we need to add it. The
        // column is added nullable (NOT NULL is skipped on ALTER) so the call
        // succeeds on populated tables ; existing rows stay with NULL id and
        // need a manual backfill.
        for (const [name, field] of Object.entries(schema.fields || {})) {
            if (name === '_id')
                continue;
            if (has(name))
                continue;
            if (name === 'id') {
                const sql = `ALTER TABLE ${q(schema.collection)} ADD ${q('id')} ${this.getIdColumnType()}`;
                try {
                    this.log('DDL_ALTER_ADD_ID', schema.collection, sql);
                    await this.executeRun(sql, []);
                }
                catch (e) {
                    this.log('DDL_ALTER_ADD_ID_FAIL', schema.collection, e.message);
                }
                continue;
            }
            let colDef = `${q(name)} ${this.fieldToSqlType(field)}`;
            const isNowDefault = field.default === 'now' || field.default === '__MOSTA_NOW__';
            if (field.default !== undefined && !isNowDefault && field.default !== null) {
                const defVal = this.serializeValue(field.default, field);
                if (typeof defVal === 'string')
                    colDef += ` DEFAULT '${defVal.replace(/'/g, "''")}'`;
                else if (typeof defVal === 'number')
                    colDef += ` DEFAULT ${defVal}`;
            }
            // NOT NULL skipped on ALTER : adding a NOT NULL column to a non-empty
            // table requires a DEFAULT or fails on most engines. Leave it nullable
            // and let the application enforce it (or run a manual migration).
            const sql = `ALTER TABLE ${q(schema.collection)} ADD ${colDef}`;
            try {
                this.log('DDL_ALTER_ADD', `${schema.collection}.${name}`, sql);
                await this.executeRun(sql, []);
            }
            catch (e) {
                this.log('DDL_ALTER_ADD_FAIL', `${schema.collection}.${name}`, e.message);
            }
        }
        // M2O / O2O relation FK columns
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.type !== 'many-to-one' && rel.type !== 'one-to-one')
                continue;
            const colName = rel.joinColumn || name;
            if (has(colName))
                continue;
            const unique = rel.type === 'one-to-one' ? ' UNIQUE' : '';
            const sql = `ALTER TABLE ${q(schema.collection)} ADD ${q(colName)} ${this.getIdColumnType()}${unique}`;
            try {
                this.log('DDL_ALTER_ADD_FK', `${schema.collection}.${colName}`, sql);
                await this.executeRun(sql, []);
            }
            catch (e) {
                this.log('DDL_ALTER_ADD_FK_FAIL', `${schema.collection}.${colName}`, e.message);
            }
        }
        // System columns ajoutées rétroactivement quand activées :
        // timestamps (createdAt/updatedAt), softDelete (deletedAt), discriminator.
        // Voir docs/ANOMALIES-LOT3-2026-05-25.md §9.
        const systemCols = [
            { name: 'createdAt', sqlType: this.fieldToSqlType({ type: 'date' }), when: !!schema.timestamps },
            { name: 'updatedAt', sqlType: this.fieldToSqlType({ type: 'date' }), when: !!schema.timestamps },
            { name: 'deletedAt', sqlType: this.fieldToSqlType({ type: 'date' }), when: !!schema.softDelete },
        ];
        if (schema.discriminator) {
            systemCols.push({
                name: schema.discriminator,
                sqlType: this.fieldToSqlType({ type: 'string' }),
                when: true,
            });
        }
        for (const col of systemCols) {
            if (!col.when || has(col.name))
                continue;
            const sql = `ALTER TABLE ${q(schema.collection)} ADD ${q(col.name)} ${col.sqlType}`;
            try {
                this.log('DDL_ALTER_ADD_SYSTEM', `${schema.collection}.${col.name}`, sql);
                await this.executeRun(sql, []);
            }
            catch (e) {
                this.log('DDL_ALTER_ADD_SYSTEM_FAIL', `${schema.collection}.${col.name}`, e.message);
            }
        }
    }
    async initSchema(schemas) {
        this.schemas = schemas;
        const strategy = this.config?.schemaStrategy ?? 'none';
        this.log('INIT_SCHEMA', `strategy=${strategy}`, { entities: schemas.map(s => s.name) });
        if (strategy === 'none')
            return;
        if (strategy === 'validate') {
            for (const schema of schemas) {
                const exists = await this.tableExists(schema.collection);
                if (!exists) {
                    throw new Error(`Schema validation failed: table "${schema.collection}" does not exist ` +
                        `(entity: ${schema.name}). Set schemaStrategy to "update" or "create".`);
                }
            }
            return;
        }
        // Hibernate hbm2ddl.auto=create-drop : DROP au boot ET au shutdown.
        // Hibernate hbm2ddl.auto=create : DROP au boot, PAS au shutdown.
        // Les deux passent par dropSchema(schemas) scoped — sécurise les DB
        // partagées entre apps (anomalie #14 — pre-2.2.9).
        if (strategy === 'create-drop' || strategy === 'create') {
            this.log('SCHEMA', `${strategy} boot — dropping registered schemas before re-create`);
            await this.dropSchema(schemas);
        }
        // strategy: 'update' or 'create' (or 'create-drop' après drop)
        for (const schema of schemas) {
            const tableExisted = strategy === 'update'
                ? await this.tableExists(schema.collection)
                : false;
            const createSql = this.generateCreateTable(schema, schemas);
            this.log('DDL', schema.collection, createSql);
            await this.executeRun(createSql, []);
            // strategy=update : if the table already existed, add any column that
            // is declared in schema.fields but missing from the live table. This
            // catches the case where new fields are added between releases — the
            // pre-1.10.3 behavior was CREATE TABLE IF NOT EXISTS only, which
            // silently left old tables unchanged and caused ORA-00904 / equivalent
            // at INSERT time.
            if (strategy === 'update' && tableExisted) {
                await this.addMissingColumns(schema);
            }
            const indexStatements = this.generateIndexes(schema);
            for (const stmt of indexStatements) {
                // Filet de sécurité A (§18) : un index qui échoue ne doit JAMAIS
                // avorter initSchema — sinon les schemas suivants ne reçoivent pas
                // leur CREATE TABLE (cascade "no such table"). La validation amont
                // (generateIndexes) couvre le cas "colonne inexistante" ; ce catch
                // couvre tout autre DDL surprise, comme le try/catch des FK plus bas.
                try {
                    await this.executeIndexStatement(stmt);
                }
                catch (e) {
                    this.log('DDL_INDEX_SKIP', `${schema.collection}: index sauté (${e.message}) — init continue`);
                }
            }
        }
        // Create junction tables for many-to-many relations
        for (const schema of schemas) {
            for (const [, rel] of Object.entries(schema.relations || {})) {
                if (rel.type === 'many-to-many' && rel.through) {
                    const targetSchema = schemas.find(s => s.name === rel.target);
                    if (!targetSchema)
                        continue;
                    const sourceKey = `${schema.name.toLowerCase()}Id`;
                    const targetKey = `${rel.target.toLowerCase()}Id`;
                    const q = (n) => this.quoteIdentifier(n);
                    const idType = this.getIdColumnType();
                    const ddl = `${this.getCreateTablePrefix(rel.through)} (
  ${q(sourceKey)} ${idType} NOT NULL,
  ${q(targetKey)} ${idType} NOT NULL,
  PRIMARY KEY (${q(sourceKey)}, ${q(targetKey)})
)`;
                    this.log('DDL_JUNCTION', rel.through, ddl);
                    await this.executeRun(ddl, []);
                }
            }
        }
        // Add FOREIGN KEY constraints (after all tables exist)
        await this.generateForeignKeys(schemas);
    }
    /**
     * Generate FK constraints for M2O/O2O relations and junction tables.
     *
     * Sur les dialects sans support ALTER TABLE ADD CONSTRAINT FK (SQLite),
     * les FK sont déjà déclarées in-line dans `generateCreateTable` — on skip
     * cette phase pour éviter une avalanche d'erreurs swallowed.
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §6.
     */
    async generateForeignKeys(schemas) {
        if (!this.supportsAlterTableAddForeignKey()) {
            this.log('FK', 'skipped — dialect emits FK in-line in CREATE TABLE');
            return;
        }
        const q = (n) => this.quoteIdentifier(n);
        for (const schema of schemas) {
            for (const [name, rel] of Object.entries(schema.relations || {})) {
                if (rel.type === 'many-to-one' || rel.type === 'one-to-one') {
                    const targetSchema = schemas.find(s => s.name === rel.target);
                    if (!targetSchema)
                        continue;
                    const colName = rel.joinColumn || name;
                    const onDel = rel.onDelete || (rel.nullable !== false ? 'set-null' : 'restrict');
                    const onDelSql = onDel.toUpperCase().replace('-', ' ');
                    const fkName = `fk_${schema.collection}_${colName}`;
                    const sql = `ALTER TABLE ${q(this.getPrefixedName(schema.collection))} ADD CONSTRAINT ${q(fkName)} ` +
                        `FOREIGN KEY (${q(colName)}) REFERENCES ${q(this.getPrefixedName(targetSchema.collection))}(${q('id')}) ` +
                        `ON DELETE ${onDelSql}`;
                    try {
                        await this.executeRun(sql, []);
                        this.log('FK', fkName, sql);
                    }
                    catch (e) {
                        // FK may already exist (strategy=update) ; on log la cause pour visibilité.
                        this.log('FK', `${fkName} skipped (${e.message})`);
                    }
                }
                if (rel.type === 'many-to-many' && rel.through) {
                    const targetSchema = schemas.find(s => s.name === rel.target);
                    if (!targetSchema)
                        continue;
                    const sourceKey = `${schema.name.toLowerCase()}Id`;
                    const targetKey = `${rel.target.toLowerCase()}Id`;
                    const fkSource = `fk_${rel.through}_${sourceKey}`;
                    const fkTarget = `fk_${rel.through}_${targetKey}`;
                    try {
                        await this.executeRun(`ALTER TABLE ${q(this.getPrefixedName(rel.through))} ADD CONSTRAINT ${q(fkSource)} ` +
                            `FOREIGN KEY (${q(sourceKey)}) REFERENCES ${q(this.getPrefixedName(schema.collection))}(${q('id')}) ON DELETE CASCADE`, []);
                        await this.executeRun(`ALTER TABLE ${q(this.getPrefixedName(rel.through))} ADD CONSTRAINT ${q(fkTarget)} ` +
                            `FOREIGN KEY (${q(targetKey)}) REFERENCES ${q(this.getPrefixedName(targetSchema.collection))}(${q('id')}) ON DELETE CASCADE`, []);
                        this.log('FK_JUNCTION', rel.through, `${fkSource}, ${fkTarget}`);
                    }
                    catch (e) {
                        this.log('FK_JUNCTION', `${rel.through} skipped (${e.message})`);
                    }
                }
            }
        }
    }
    // ============================================================
    // IDialect Implementation — CRUD
    // ============================================================
    async find(schema, filter, options) {
        this.resetParams();
        const effectiveFilter = this.applySoftDeleteFilter(this.applyDiscriminator(filter, schema), schema, options);
        const where = this.translateFilter(effectiveFilter, schema);
        const cols = this.buildSelectColumns(schema, options);
        const orderBy = this.buildOrderBy(options);
        const limitOffset = this.buildLimitOffset(options);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        const sql = `SELECT ${cols} FROM ${table} WHERE ${where.sql}${orderBy}${limitOffset}`;
        this.log('FIND', schema.collection, { sql, params: where.params });
        const rows = await this.executeQuery(sql, where.params);
        return rows.map(row => this.deserializeRow(row, schema));
    }
    async findOne(schema, filter, options) {
        const results = await this.find(schema, filter, { ...options, limit: 1 });
        return results.length > 0 ? results[0] : null;
    }
    async findById(schema, id, options) {
        this.resetParams();
        const cols = this.buildSelectColumns(schema, options);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        // Build WHERE with discriminator + soft-delete
        const extraFilter = this.applySoftDeleteFilter(this.applyDiscriminator({ id }, schema), schema, options);
        const where = this.translateFilter(extraFilter, schema);
        const sql = `SELECT ${cols} FROM ${table} WHERE ${where.sql}`;
        this.log('FIND_BY_ID', schema.collection, { id });
        const rows = await this.executeQuery(sql, where.params);
        if (rows.length === 0)
            return null;
        const result = this.deserializeRow(rows[0], schema);
        // Auto-populate eager relations (Hibernate FetchType.EAGER)
        const eagerRels = this.getEagerRelations(schema);
        if (eagerRels.length > 0) {
            return this.populateRelations(result, schema, eagerRels);
        }
        return result;
    }
    async create(schema, data) {
        const insertData = this.applyDiscriminatorToData(data, schema);
        await this.ensureColumnsForData(schema, insertData); // anomalie #20 : ALTER TABLE au besoin
        this.resetParams();
        const { columns, placeholders, values } = this.prepareInsertData(schema, insertData);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        const colsSql = columns.map(c => this.quoteIdentifier(c)).join(', ');
        const sql = `INSERT INTO ${table} (${colsSql}) VALUES (${placeholders.join(', ')})`;
        this.log('CREATE', schema.collection, { sql, values });
        await this.executeRun(sql, values);
        // Insert junction table rows for many-to-many
        const entityId = values[0];
        for (const [relName, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' && rel.through && data[relName] != null) {
                // Normalize: accept array, CSV string, or single ID
                let relIds = data[relName];
                if (!Array.isArray(relIds)) {
                    relIds = typeof relIds === 'string' ? relIds.split(',').map(s => s.trim()).filter(Boolean) : [relIds];
                }
                if (!relIds.length)
                    continue;
                const sourceKey = `${schema.name.toLowerCase()}Id`;
                const targetKey = `${rel.target.toLowerCase()}Id`;
                for (const targetId of relIds) {
                    this.resetParams();
                    const p1 = this.nextPlaceholder();
                    const p2 = this.nextPlaceholder();
                    await this.executeRun(`INSERT INTO ${this.quoteIdentifier(this.getPrefixedName(rel.through))} (${this.quoteIdentifier(sourceKey)}, ${this.quoteIdentifier(targetKey)}) VALUES (${p1}, ${p2})`, [entityId, targetId]);
                }
            }
        }
        return this.findById(schema, entityId);
    }
    async update(schema, id, data) {
        const existing = await this.findById(schema, id);
        if (!existing)
            return null;
        await this.ensureColumnsForData(schema, data); // anomalie #20 : ALTER TABLE au besoin
        this.resetParams();
        const { setClauses, values } = this.prepareUpdateData(schema, data);
        if (setClauses.length > 0) {
            const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
            const effectiveFilter = this.applyDiscriminator({ id }, schema);
            const where = this.translateFilter(effectiveFilter, schema);
            const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${where.sql}`;
            values.push(...where.params);
            this.log('UPDATE', schema.collection, { sql, values });
            await this.executeRun(sql, values);
        }
        // Diff-based M2M update (Set semantics — like Hibernate PersistentSet)
        // Instead of DELETE-ALL + re-INSERT, compute delta: toAdd/toRemove
        for (const [relName, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' && rel.through && relName in data) {
                const sourceKey = `${schema.name.toLowerCase()}Id`;
                const targetKey = `${rel.target.toLowerCase()}Id`;
                const q = (n) => this.quoteIdentifier(n);
                // 1. Fetch existing junction rows
                this.resetParams();
                const selPh = this.nextPlaceholder();
                const existingRows = await this.executeQuery(`SELECT ${q(targetKey)} FROM ${q(rel.through)} WHERE ${q(sourceKey)} = ${selPh}`, [id]);
                const oldIds = new Set(existingRows.map(r => String(r[targetKey] || r[targetKey.toLowerCase()] || r[targetKey.toUpperCase()])));
                // 2. Normalize new IDs
                let relIds = data[relName];
                if (relIds != null && !Array.isArray(relIds)) {
                    relIds = typeof relIds === 'string' ? relIds.split(',').map(s => s.trim()).filter(Boolean) : [relIds];
                }
                const newIds = new Set((relIds || []).map(String));
                // 3. Compute diff
                const toAdd = [...newIds].filter(x => !oldIds.has(x));
                const toRemove = [...oldIds].filter(x => !newIds.has(x));
                // 4. Targeted INSERT/DELETE — O(delta) instead of O(n)
                for (const targetId of toAdd) {
                    this.resetParams();
                    const p1 = this.nextPlaceholder();
                    const p2 = this.nextPlaceholder();
                    await this.executeRun(`INSERT INTO ${q(rel.through)} (${q(sourceKey)}, ${q(targetKey)}) VALUES (${p1}, ${p2})`, [id, targetId]);
                }
                for (const targetId of toRemove) {
                    this.resetParams();
                    const p1 = this.nextPlaceholder();
                    const p2 = this.nextPlaceholder();
                    await this.executeRun(`DELETE FROM ${q(rel.through)} WHERE ${q(sourceKey)} = ${p1} AND ${q(targetKey)} = ${p2}`, [id, targetId]);
                }
            }
        }
        return this.findById(schema, id);
    }
    async updateMany(schema, filter, data) {
        this.resetParams();
        const { setClauses, values } = this.prepareUpdateData(schema, data);
        if (setClauses.length === 0)
            return 0;
        const effectiveFilter = this.applySoftDeleteFilter(this.applyDiscriminator(filter, schema), schema);
        const where = this.translateFilter(effectiveFilter, schema);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${where.sql}`;
        const allValues = [...values, ...where.params];
        this.log('UPDATE_MANY', schema.collection, { sql, params: allValues });
        const result = await this.executeRun(sql, allValues);
        return result.changes;
    }
    async delete(schema, id) {
        // Soft-delete: set deletedAt instead of removing
        if (schema.softDelete) {
            this.resetParams();
            const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
            const datePh = this.nextPlaceholder();
            const effectiveFilter = this.applyDiscriminator({ id }, schema);
            const where = this.translateFilter(effectiveFilter, schema);
            const sql = `UPDATE ${table} SET ${this.quoteIdentifier('deletedAt')} = ${datePh} WHERE ${where.sql}`;
            const result = await this.executeRun(sql, [this.serializeDate('now'), ...where.params]);
            return result.changes > 0;
        }
        // Cleanup M2M junction tables before hard delete
        for (const [, rel] of Object.entries(schema.relations || {})) {
            if (rel.type === 'many-to-many' && rel.through) {
                this.resetParams();
                const sourceKey = `${schema.name.toLowerCase()}Id`;
                const ph = this.nextPlaceholder();
                await this.executeRun(`DELETE FROM ${this.quoteIdentifier(this.getPrefixedName(rel.through))} WHERE ${this.quoteIdentifier(sourceKey)} = ${ph}`, [id]);
            }
        }
        this.resetParams();
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        const effectiveFilter = this.applyDiscriminator({ id }, schema);
        const where = this.translateFilter(effectiveFilter, schema);
        const sql = `DELETE FROM ${table} WHERE ${where.sql}`;
        this.log('DELETE', schema.collection, { id });
        const result = await this.executeRun(sql, where.params);
        return result.changes > 0;
    }
    async deleteMany(schema, filter) {
        this.resetParams();
        const effectiveFilter = this.applyDiscriminator(filter, schema);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        if (schema.softDelete) {
            const datePh = this.nextPlaceholder();
            const softFilter = this.applySoftDeleteFilter(effectiveFilter, schema);
            const where = this.translateFilter(softFilter, schema);
            const sql = `UPDATE ${table} SET ${this.quoteIdentifier('deletedAt')} = ${datePh} WHERE ${where.sql}`;
            this.log('SOFT_DELETE_MANY', schema.collection, { sql });
            const result = await this.executeRun(sql, [this.serializeDate('now'), ...where.params]);
            return result.changes;
        }
        const where = this.translateFilter(effectiveFilter, schema);
        // Cleanup M2M junction tables before hard delete
        const m2mRels = Object.entries(schema.relations || {}).filter(([, rel]) => rel.type === 'many-to-many' && rel.through);
        if (m2mRels.length > 0) {
            // Fetch IDs that will be deleted
            this.resetParams();
            const selWhere = this.translateFilter(effectiveFilter, schema);
            const selSql = `SELECT ${this.quoteIdentifier('id')} FROM ${table} WHERE ${selWhere.sql}`;
            const rows = await this.executeQuery(selSql, selWhere.params);
            const ids = rows.map(r => r.id).filter(Boolean);
            if (ids.length > 0) {
                for (const [, rel] of m2mRels) {
                    const sourceKey = `${schema.name.toLowerCase()}Id`;
                    for (const entityId of ids) {
                        this.resetParams();
                        const ph = this.nextPlaceholder();
                        await this.executeRun(`DELETE FROM ${this.quoteIdentifier(rel.through)} WHERE ${this.quoteIdentifier(sourceKey)} = ${ph}`, [entityId]);
                    }
                }
            }
        }
        this.resetParams();
        const delWhere = this.translateFilter(effectiveFilter, schema);
        const sql = `DELETE FROM ${table} WHERE ${delWhere.sql}`;
        this.log('DELETE_MANY', schema.collection, { sql, params: delWhere.params });
        const result = await this.executeRun(sql, delWhere.params);
        return result.changes;
    }
    // ============================================================
    // IDialect Implementation — Queries
    // ============================================================
    async count(schema, filter, options) {
        this.resetParams();
        const effectiveFilter = this.applySoftDeleteFilter(this.applyDiscriminator(filter, schema), schema, options);
        const where = this.translateFilter(effectiveFilter, schema);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        const sql = `SELECT COUNT(*) as cnt FROM ${table} WHERE ${where.sql}`;
        this.log('COUNT', schema.collection, { sql, params: where.params });
        const rows = await this.executeQuery(sql, where.params);
        return rows.length > 0 ? Number(rows[0].cnt) : 0;
    }
    async distinct(schema, field, filter, options) {
        this.resetParams();
        const effectiveFilter = this.applySoftDeleteFilter(this.applyDiscriminator(filter, schema), schema, options);
        const where = this.translateFilter(effectiveFilter, schema);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        const sql = `SELECT DISTINCT ${this.quoteIdentifier(field)} FROM ${table} WHERE ${where.sql}`;
        this.log('DISTINCT', schema.collection, { sql, params: where.params });
        const rows = await this.executeQuery(sql, where.params);
        return rows.map(r => {
            const val = r[field];
            const fieldDef = schema.fields[field];
            if (fieldDef)
                return this.deserializeField(val, fieldDef);
            return val;
        });
    }
    async aggregate(schema, stages, options) {
        this.resetParams();
        let whereClause = '1=1';
        let whereParams = [];
        let groupBy = null;
        let selectCols = [];
        let orderBy = '';
        let limit = '';
        for (const stage of stages) {
            if ('$match' in stage) {
                const effectiveMatch = this.applySoftDeleteFilter(this.applyDiscriminator(stage.$match, schema), schema, options);
                const w = this.translateFilter(effectiveMatch, schema);
                whereClause = w.sql;
                whereParams = w.params;
            }
            else if ('$group' in stage) {
                const group = stage;
                const groupDef = group.$group;
                selectCols = [];
                for (const [key, val] of Object.entries(groupDef)) {
                    if (key === '_by') {
                        if (val) {
                            groupBy = this.quoteIdentifier(val);
                            selectCols.push(`${groupBy} as ${this.quoteIdentifier(val)}`);
                        }
                        else {
                            selectCols.push(`NULL as ${this.quoteIdentifier('_group')}`);
                        }
                    }
                    else if (val && typeof val === 'object') {
                        const acc = val;
                        if ('$sum' in acc) {
                            if (typeof acc.$sum === 'string') {
                                selectCols.push(`SUM(${this.quoteIdentifier(acc.$sum.replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
                            }
                            else {
                                selectCols.push(`SUM(${acc.$sum}) as ${this.quoteIdentifier(key)}`);
                            }
                        }
                        if ('$count' in acc) {
                            selectCols.push(`COUNT(*) as ${this.quoteIdentifier(key)}`);
                        }
                        if ('$avg' in acc && typeof acc.$avg === 'string') {
                            selectCols.push(`AVG(${this.quoteIdentifier(acc.$avg.replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
                        }
                        if ('$min' in acc && typeof acc.$min === 'string') {
                            selectCols.push(`MIN(${this.quoteIdentifier(acc.$min.replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
                        }
                        if ('$max' in acc && typeof acc.$max === 'string') {
                            selectCols.push(`MAX(${this.quoteIdentifier(acc.$max.replace(/^\$/, ''))}) as ${this.quoteIdentifier(key)}`);
                        }
                    }
                }
            }
            else if ('$sort' in stage) {
                const sortClauses = Object.entries(stage.$sort)
                    .map(([f, dir]) => `${this.quoteIdentifier(f)} ${dir === -1 ? 'DESC' : 'ASC'}`);
                orderBy = ` ORDER BY ${sortClauses.join(', ')}`;
            }
            else if ('$limit' in stage) {
                limit = ` LIMIT ${stage.$limit}`;
            }
        }
        if (selectCols.length === 0)
            selectCols = ['*'];
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        let sql = `SELECT ${selectCols.join(', ')} FROM ${table} WHERE ${whereClause}`;
        if (groupBy)
            sql += ` GROUP BY ${groupBy}`;
        sql += orderBy + limit;
        this.log('AGGREGATE', schema.collection, { sql, params: whereParams });
        return this.executeQuery(sql, whereParams);
    }
    /**
     * Get relations that should be eagerly loaded.
     *
     * Default = `lazy` pour TOUTES les relations (M2O, O2O, O2M, M2M).
     * Le caller doit explicitement opt-in via `rel.fetch = 'eager'` pour
     * qu'une relation soit auto-populée à la lecture.
     *
     * Aligne `@mostajs/orm` sur le comportement moderne (Prisma, Drizzle,
     * TypeORM 0.3+, MikroORM, SQLAlchemy) — opposé au comportement Hibernate
     * historique EAGER par défaut pour M2O (anti-pattern documenté).
     *
     * Migration depuis < v2.0 : si tu dépendais du populate auto M2O/O2O,
     * passe `findByIdWithRelations(id, ['project', 'contact'])` ou marque
     * la relation `fetch: 'eager'` dans son EntitySchema.
     */
    getEagerRelations(schema) {
        const eager = [];
        for (const [name, rel] of Object.entries(schema.relations || {})) {
            if (rel.fetch === 'eager')
                eager.push(name);
        }
        return eager;
    }
    // ============================================================
    // IDialect Implementation — Relations
    // ============================================================
    async findWithRelations(schema, filter, relations, options) {
        const rows = await this.find(schema, filter, options);
        if (rows.length === 0)
            return [];
        return Promise.all(rows.map(row => this.populateRelations(row, schema, relations)));
    }
    async findByIdWithRelations(schema, id, relations, options) {
        const row = await this.findById(schema, id, options);
        if (!row)
            return null;
        return this.populateRelations(row, schema, relations);
    }
    async populateRelations(row, schema, relations) {
        const result = { ...row };
        for (const relName of relations) {
            const relDef = schema.relations?.[relName];
            if (!relDef)
                continue;
            const targetSchema = this.schemas.find(s => s.name === relDef.target);
            if (!targetSchema)
                continue;
            const selectOpts = relDef.select
                ? { select: relDef.select }
                : undefined;
            if (relDef.type === 'many-to-many' && relDef.through) {
                const sourceKey = `${schema.name.toLowerCase()}Id`;
                const targetKey = `${relDef.target.toLowerCase()}Id`;
                this.resetParams();
                const ph = this.nextPlaceholder();
                const junctionRows = await this.executeQuery(`SELECT ${this.quoteIdentifier(targetKey)} FROM ${this.quoteIdentifier(this.getPrefixedName(relDef.through))} WHERE ${this.quoteIdentifier(sourceKey)} = ${ph}`, [result.id]);
                // Batch load: single query with IN clause instead of N findById (N+1 → 1)
                const targetIds = junctionRows
                    .map(jr => jr[targetKey] || jr[targetKey.toUpperCase()] || jr[targetKey.toLowerCase()])
                    .filter(Boolean)
                    .map(String);
                if (targetIds.length > 0) {
                    const related = await this.find(targetSchema, { id: { $in: targetIds } }, selectOpts);
                    // Preserve junction order
                    const byId = new Map(related.map(r => [String(r.id), r]));
                    result[relName] = targetIds.map(tid => byId.get(tid)).filter(Boolean);
                }
                else {
                    result[relName] = [];
                }
            }
            else if (relDef.type === 'one-to-many') {
                // O2M: query child table by FK (mappedBy or convention parentNameId)
                const fkColumn = relDef.mappedBy || `${schema.name.toLowerCase()}Id`;
                const children = await this.find(targetSchema, { [fkColumn]: result.id }, selectOpts);
                result[relName] = children;
            }
            else {
                // M-1 / 1-1 : lire la FK depuis la colonne joinColumn (par défaut relName).
                // Le résultat populé est déposé sur `relName` (peut différer de joinColumn).
                // Voir docs/ANOMALIES-LOT3-2026-05-25.md §8.
                const fkColumn = relDef.joinColumn || relName;
                const refId = result[fkColumn];
                if (refId) {
                    const related = await this.findById(targetSchema, String(refId), selectOpts);
                    if (related) {
                        result[relName] = related;
                    }
                    else if (fkColumn === relName) {
                        // Pas de target trouvé ET pas de joinColumn distinct → on garde la string id
                        result[relName] = refId;
                    }
                }
            }
        }
        return result;
    }
    // ============================================================
    // IDialect Implementation — Upsert
    // ============================================================
    async upsert(schema, filter, data) {
        const existing = await this.findOne(schema, filter);
        if (existing) {
            const updated = await this.update(schema, existing.id, data);
            return updated;
        }
        else {
            return this.create(schema, data);
        }
    }
    // ============================================================
    // IDialect Implementation — Atomic operations
    // ============================================================
    async increment(schema, id, field, amount) {
        const existing = await this.findById(schema, id);
        if (existing) {
            this.resetParams();
            const col = this.quoteIdentifier(field);
            const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
            const ph = this.nextPlaceholder();
            let sql = `UPDATE ${table} SET ${col} = COALESCE(${col}, 0) + ${ph}`;
            const params = [amount];
            if (schema.timestamps) {
                sql += `, ${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`;
                params.push(this.serializeDate('now'));
            }
            const effectiveFilter = this.applyDiscriminator({ id }, schema);
            const where = this.translateFilter(effectiveFilter, schema);
            sql += ` WHERE ${where.sql}`;
            params.push(...where.params);
            this.log('INCREMENT', schema.collection, { id, field, amount });
            await this.executeRun(sql, params);
        }
        else {
            const data = { id, [field]: amount };
            await this.create(schema, data);
        }
        return (await this.findById(schema, id));
    }
    // ============================================================
    // IDialect Implementation — Array operations
    // ============================================================
    async addToSet(schema, id, field, value) {
        const row = await this.findById(schema, id);
        if (!row)
            return null;
        // Many-to-many: INSERT into junction table
        const relDef = schema.relations?.[field];
        if (relDef?.type === 'many-to-many' && relDef.through) {
            const sourceKey = `${schema.name.toLowerCase()}Id`;
            const targetKey = `${relDef.target.toLowerCase()}Id`;
            this.log('ADD_TO_SET_M2M', relDef.through, { id, field, value });
            this.resetParams();
            const p1 = this.nextPlaceholder();
            const p2 = this.nextPlaceholder();
            // Use INSERT and ignore duplicates — dialect-specific handling in executeRun if needed
            try {
                await this.executeRun(`INSERT INTO ${this.quoteIdentifier(this.getPrefixedName(relDef.through))} (${this.quoteIdentifier(sourceKey)}, ${this.quoteIdentifier(targetKey)}) VALUES (${p1}, ${p2})`, [id, value]);
            }
            catch {
                // scan-ignore: duplicate key sur INSERT junction — ignore (sémantique set, idempotent)
            }
            return this.findById(schema, id);
        }
        // Get current array value
        let arr = [];
        const currentVal = row[field];
        if (Array.isArray(currentVal)) {
            arr = [...currentVal];
        }
        // Add only if not present (set semantics)
        const serialized = JSON.stringify(value);
        const exists = arr.some(item => JSON.stringify(item) === serialized);
        if (!exists) {
            arr.push(value);
            this.resetParams();
            const col = this.quoteIdentifier(field);
            const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
            let sql = `UPDATE ${table} SET ${col} = ${this.nextPlaceholder()}`;
            const params = [JSON.stringify(arr)];
            if (schema.timestamps) {
                sql += `, ${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`;
                params.push(this.serializeDate('now'));
            }
            const effectiveFilter = this.applyDiscriminator({ id }, schema);
            const where = this.translateFilter(effectiveFilter, schema);
            sql += ` WHERE ${where.sql}`;
            params.push(...where.params);
            this.log('ADD_TO_SET', schema.collection, { id, field, value });
            await this.executeRun(sql, params);
        }
        return this.findById(schema, id);
    }
    async pull(schema, id, field, value) {
        const row = await this.findById(schema, id);
        if (!row)
            return null;
        // Many-to-many: DELETE from junction table
        const relDef = schema.relations?.[field];
        if (relDef?.type === 'many-to-many' && relDef.through) {
            const sourceKey = `${schema.name.toLowerCase()}Id`;
            const targetKey = `${relDef.target.toLowerCase()}Id`;
            this.log('PULL_M2M', relDef.through, { id, field, value });
            this.resetParams();
            const p1 = this.nextPlaceholder();
            const p2 = this.nextPlaceholder();
            await this.executeRun(`DELETE FROM ${this.quoteIdentifier(this.getPrefixedName(relDef.through))} WHERE ${this.quoteIdentifier(sourceKey)} = ${p1} AND ${this.quoteIdentifier(targetKey)} = ${p2}`, [id, value]);
            return this.findById(schema, id);
        }
        // Get current array and remove matching element
        let arr = [];
        const currentVal = row[field];
        if (Array.isArray(currentVal)) {
            arr = [...currentVal];
        }
        const serializedVal = JSON.stringify(value);
        const filtered = arr.filter(item => JSON.stringify(item) !== serializedVal);
        if (filtered.length !== arr.length) {
            this.resetParams();
            const col = this.quoteIdentifier(field);
            const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
            let sql = `UPDATE ${table} SET ${col} = ${this.nextPlaceholder()}`;
            const params = [JSON.stringify(filtered)];
            if (schema.timestamps) {
                sql += `, ${this.quoteIdentifier('updatedAt')} = ${this.nextPlaceholder()}`;
                params.push(this.serializeDate('now'));
            }
            const effectiveFilter = this.applyDiscriminator({ id }, schema);
            const where = this.translateFilter(effectiveFilter, schema);
            sql += ` WHERE ${where.sql}`;
            params.push(...where.params);
            this.log('PULL', schema.collection, { id, field, value });
            await this.executeRun(sql, params);
        }
        return this.findById(schema, id);
    }
    // ============================================================
    // IDialect Implementation — Text search
    // ============================================================
    async search(schema, query, fields, options) {
        this.resetParams();
        const conditions = fields.map(f => `${this.quoteIdentifier(f)} LIKE ${this.nextPlaceholder()}`);
        const pattern = `%${query}%`;
        const params = fields.map(() => pattern);
        const cols = this.buildSelectColumns(schema, options);
        const orderBy = this.buildOrderBy(options);
        const limitOffset = this.buildLimitOffset(options);
        const table = this.quoteIdentifier(this.getPrefixedName(schema.collection));
        // Apply discriminator + soft-delete (respecte options.includeDeleted)
        const extraFilter = this.applySoftDeleteFilter(this.applyDiscriminator({}, schema), schema, options);
        const extra = this.translateFilter(extraFilter, schema);
        const extraWhere = extra.sql !== '1=1' ? ` AND ${extra.sql}` : '';
        params.push(...extra.params);
        const sql = `SELECT ${cols} FROM ${table} WHERE (${conditions.join(' OR ')})${extraWhere}${orderBy}${limitOffset}`;
        this.log('SEARCH', schema.collection, { sql, query, fields });
        const rows = await this.executeQuery(sql, params);
        return rows.map(row => this.deserializeRow(row, schema));
    }
    // ============================================================
    // Private helpers
    // ============================================================
    /**
     * Check if a table exists. Accepts the logical name (`schema.collection` ou
     * `rel.through`) — applique `tablePrefix` en interne avant la comparaison
     * avec le catalogue du dialect.
     */
    async tableExists(tableName) {
        const physicalName = this.getPrefixedName(tableName);
        try {
            const query = this.getTableListQuery();
            const rows = await this.executeQuery(query, []);
            return rows.some(r => {
                // Check multiple possible column names
                const name = r.name
                    || r.TABLE_NAME
                    || r.table_name
                    || Object.values(r)[0];
                return name === physicalName;
            });
        }
        catch (e) {
            // scan-ignore: existence check — false = "table absente OU erreur listing", documenté ainsi
            this.log('TABLE_EXISTS', `${physicalName} check failed: ${e.message}`);
            return false;
        }
    }
    /** Drop all tables (used by 'create' and 'create-drop' strategies) */
    /** Truncate (empty) a single table — keeps structure, deletes all data */
    async truncateTable(tableName) {
        await this.executeRun(`DELETE FROM ${this.quoteIdentifier(this.getPrefixedName(tableName))}`, []);
        this.log('TRUNCATE', tableName);
    }
    /** Truncate all registered schema tables — junction tables first, then entities */
    async truncateAll(schemas) {
        const truncated = [];
        // Junction tables first (foreign key constraints)
        for (const schema of schemas) {
            for (const [, rel] of Object.entries(schema.relations || {})) {
                if (rel.type === 'many-to-many' && rel.through) {
                    try {
                        await this.truncateTable(rel.through);
                        truncated.push(rel.through);
                    }
                    catch (e) {
                        this.log('TRUNCATE', `${rel.through} skipped: ${e.message}`);
                    }
                }
            }
        }
        // Entity tables
        for (const schema of schemas) {
            try {
                await this.truncateTable(schema.collection);
                truncated.push(schema.collection);
            }
            catch (e) {
                this.log('TRUNCATE', `${schema.collection} skipped: ${e.message}`);
            }
        }
        return truncated;
    }
    /**
     * SQL string to drop a single table — dialect-specific so subclasses can
     * adapt the CASCADE keyword (Postgres/MySQL : CASCADE, Oracle : CASCADE
     * CONSTRAINTS, SQLite : pas de CASCADE supporté du tout).
     */
    getDropTableSql(tableName) {
        return `DROP TABLE IF EXISTS ${this.quoteIdentifier(this.getPrefixedName(tableName))} CASCADE`;
    }
    /** Drop a single table by name */
    async dropTable(tableName) {
        await this.executeRun(this.getDropTableSql(tableName), []);
        this.log('DROP_TABLE', tableName);
    }
    /** Drop all tables in the database (dangerous) */
    async dropAllTables() {
        try {
            const query = this.getTableListQuery();
            const rows = await this.executeQuery(query, []);
            for (const row of rows) {
                const name = (row.name || row.TABLE_NAME || row.table_name || Object.values(row)[0]);
                if (name) {
                    await this.executeRun(`DROP TABLE IF EXISTS ${this.quoteIdentifier(name)} CASCADE`, []);
                }
            }
            this.log('DROP_ALL_TABLES', 'all', { count: rows.length });
        }
        catch (e) {
            this.log('DROP_ALL_TABLES', `partial or failed: ${e.message}`);
        }
    }
    /** Drop tables for registered schemas + their junction tables */
    async dropSchema(schemas) {
        const dropped = [];
        // Drop junction tables first (foreign key constraints)
        for (const schema of schemas) {
            for (const [, rel] of Object.entries(schema.relations || {})) {
                if (rel.type === 'many-to-many' && rel.through) {
                    try {
                        await this.dropTable(rel.through);
                        dropped.push(rel.through);
                    }
                    catch (e) {
                        this.log('DROP_TABLE', `${rel.through} skipped: ${e.message}`);
                    }
                }
            }
        }
        // Drop entity tables
        for (const schema of schemas) {
            try {
                await this.dropTable(schema.collection);
                dropped.push(schema.collection);
            }
            catch (e) {
                this.log('DROP_TABLE', `${schema.collection} skipped: ${e.message}`);
            }
        }
        return dropped;
    }
}

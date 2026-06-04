// SAP HANA Dialect — extends AbstractSqlDialect
// Equivalent to org.hibernate.dialect.HANADialect (Hibernate ORM 6.4)
// Driver: npm install @sap/hana-client
// Author: Dr Hamid MADANI drmdh@msn.com
import { AbstractSqlDialect } from './abstract-sql.dialect.js';
// ============================================================
// Type Mapping — DAL FieldType → HANA column type
// ============================================================
const HANA_TYPE_MAP = {
    string: 'NVARCHAR(5000)',
    text: 'NCLOB',
    number: 'DOUBLE',
    boolean: 'BOOLEAN',
    date: 'TIMESTAMP',
    json: 'NCLOB',
    array: 'NCLOB',
};
// ============================================================
// HANADialect
// ============================================================
class HANADialect extends AbstractSqlDialect {
    dialectType = 'hana';
    conn = null;
    hanaClient = null;
    // --- Abstract implementations ---
    quoteIdentifier(name) {
        return `"${name}"`;
    }
    getPlaceholder(_index) {
        return '?';
    }
    fieldToSqlType(field) {
        return HANA_TYPE_MAP[field.type] || 'NVARCHAR(5000)';
    }
    getIdColumnType() {
        return 'NVARCHAR(36)';
    }
    getTableListQuery() {
        return "SELECT table_name as name FROM tables WHERE schema_name = CURRENT_SCHEMA";
    }
    /**
     * HANA supports `CASCADE` on DROP but not `IF EXISTS`. Catch error 259
     * "invalid table name" so calling drop on a missing table is a no-op.
     */
    /**
     * HANA a des transactions implicites — standalone BEGIN invalide.
     * HANA supporte READ COMMITTED, REPEATABLE READ, SERIALIZABLE (pas
     * READ UNCOMMITTED). Mapping ANSI :
     *   READ UNCOMMITTED → READ COMMITTED (alias raisonnable)
     *   autres niveaux supportés tels quels
     * Voir docs/ANOMALIES-LOT3-2026-05-25.md §5.
     */
    beginSql(opts) {
        if (!opts?.isolation)
            return null;
        const level = opts.isolation === 'READ UNCOMMITTED' ? 'READ COMMITTED' : opts.isolation;
        if (opts.isolation === 'READ UNCOMMITTED') {
            this.log('TX', "isolation 'READ UNCOMMITTED' non supporté par HANA — fallback READ COMMITTED");
        }
        return `SET TRANSACTION ISOLATION LEVEL ${level}`;
    }
    async dropTable(tableName) {
        try {
            await this.executeRun(`DROP TABLE ${this.quoteIdentifier(this.getPrefixedName(tableName))} CASCADE`, []);
            this.log('DROP_TABLE', tableName);
        }
        catch (e) {
            const msg = e.message ?? '';
            if (/invalid table name|not found|259/i.test(msg)) {
                this.log('DROP_TABLE_SKIP', tableName, 'not found');
                return;
            }
            throw e;
        }
    }
    // --- Hooks ---
    // HANA doesn't support IF NOT EXISTS for tables
    supportsIfNotExists() { return false; }
    supportsReturning() { return false; }
    serializeBoolean(v) { return v; }
    deserializeBoolean(v) {
        return v === true || v === 1 || v === '1' || v === 'TRUE' || v === 'true';
    }
    /** HANA LIKE is case-sensitive — use UPPER() for case-insensitive search */
    buildRegexCondition(col, flags) {
        if (flags?.includes('i')) {
            return `UPPER(${col}) LIKE UPPER(${this.nextPlaceholder()})`;
        }
        return `${col} LIKE ${this.nextPlaceholder()}`;
    }
    // HANA supports LIMIT/OFFSET natively
    // (default buildLimitOffset from AbstractSqlDialect works)
    getCreateTablePrefix(tableName) {
        return `CREATE TABLE ${this.quoteIdentifier(this.getPrefixedName(tableName))}`;
    }
    getCreateIndexPrefix(indexName, unique) {
        const u = unique ? 'UNIQUE ' : '';
        return `CREATE ${u}INDEX ${this.quoteIdentifier(indexName)}`;
    }
    // --- Connection ---
    async doConnect(config) {
        try {
            this.hanaClient = await import(/* webpackIgnore: true */ '@sap/hana-client');
            const createConnection = this.hanaClient.createConnection
                || this.hanaClient.default.createConnection;
            this.conn = createConnection();
            await new Promise((resolve, reject) => {
                this.conn.connect(this.parseHanaUri(config.uri), (err) => err ? reject(err) : resolve());
            });
        }
        catch (e) {
            throw new Error(`SAP HANA driver not found. Install it: npm install @sap/hana-client\n` +
                `Original error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    async doDisconnect() {
        if (this.conn) {
            await new Promise((resolve) => {
                this.conn.disconnect(() => resolve());
            });
            this.conn = null;
        }
    }
    async doTestConnection() {
        if (!this.conn)
            return false;
        const rows = await this.executeQuery('SELECT 1 FROM DUMMY', []);
        return Array.isArray(rows);
    }
    // --- Query execution ---
    async doExecuteQuery(sql, params) {
        if (!this.conn)
            throw new Error('HANA not connected. Call connect() first.');
        return new Promise((resolve, reject) => {
            this.conn.exec(sql, params, (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows ?? []);
            });
        });
    }
    async doExecuteRun(sql, params) {
        if (!this.conn)
            throw new Error('HANA not connected. Call connect() first.');
        return new Promise((resolve, reject) => {
            this.conn.exec(sql, params, (err, affectedRows) => {
                if (err)
                    reject(err);
                else
                    resolve({ changes: affectedRows ?? 0 });
            });
        });
    }
    // Override initSchema to handle HANA's lack of IF NOT EXISTS
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
        // Anomalie #14 (fix 2.2.9) : create-drop = DROP au boot + DROP au shutdown.
        if (strategy === 'create-drop' || strategy === 'create') {
            this.log('SCHEMA', 'create-drop boot — dropping registered schemas before re-create');
            await this.dropSchema(schemas);
        }
        for (const schema of schemas) {
            const exists = await this.tableExists(schema.collection);
            if (!exists) {
                const createSql = this.generateCreateTable(schema);
                this.log('DDL', schema.collection, createSql);
                await this.executeRun(createSql, []);
            }
            else if (strategy === 'update') {
                await this.addMissingColumns(schema);
            }
            const indexStatements = this.generateIndexes(schema);
            for (const stmt of indexStatements) {
                try {
                    await this.executeRun(stmt, []);
                }
                catch (e) {
                    this.log('CREATE_INDEX', `skipped (may already exist): ${e.message}`);
                }
            }
        }
        // Junction tables
        for (const schema of schemas) {
            for (const [, rel] of Object.entries(schema.relations || {})) {
                if (rel.type === 'many-to-many' && rel.through) {
                    const exists = await this.tableExists(rel.through);
                    if (exists)
                        continue;
                    const targetSchema = schemas.find(s => s.name === rel.target);
                    if (!targetSchema)
                        continue;
                    const sourceKey = `${schema.name.toLowerCase()}Id`;
                    const targetKey = `${rel.target.toLowerCase()}Id`;
                    const q = (n) => this.quoteIdentifier(n);
                    const idType = this.getIdColumnType();
                    const ddl = `CREATE TABLE ${q(rel.through)} (
  ${q(sourceKey)} ${idType} NOT NULL,
  ${q(targetKey)} ${idType} NOT NULL,
  PRIMARY KEY (${q(sourceKey)}, ${q(targetKey)})
)`;
                    this.log('DDL_JUNCTION', rel.through, ddl);
                    await this.executeRun(ddl, []);
                }
            }
        }
    }
    parseHanaUri(uri) {
        try {
            const url = new URL(uri.replace(/^hana:/, 'http:'));
            return {
                serverNode: `${url.hostname || 'localhost'}:${url.port || 30015}`,
                uid: url.username || 'SYSTEM',
                pwd: url.password || '',
                databaseName: url.pathname.replace(/^\//, '') || undefined,
            };
        }
        catch {
            return { serverNode: 'localhost:30015' };
        }
    }
    getDialectLabel() { return 'HANA'; }
}
// ============================================================
// Factory export
// ============================================================
export function createDialect() {
    return new HANADialect();
}

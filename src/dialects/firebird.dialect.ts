// Firebird Dialect — extends AbstractSqlDialect.
// RDBMS relationnel open-source (lignée InterBase), OLTP, embarqué ou serveur.
// Cible Firebird 3.0+ (BOOLEAN natif). Driver : npm install node-firebird (pur-JS, MPL-2.0).
//
// Quirks gérés (cf. docs/NOUVEAUX-DIALECTES-DUCKDB-CLICKHOUSE-CASSANDRA-FIREBIRD.md §4) :
//  - identifiants quotés "lowercase" → sensibles à la casse, cohérents partout ;
//  - VARCHAR exige une longueur ; text/json → BLOB SUB_TYPE TEXT (lu en string via blobAsText) ;
//  - tables système RDB$RELATIONS / RDB$RELATION_FIELDS (introspection) ;
//  - pagination ROWS <m> TO <n> (1-based) — PAS de LIMIT/OFFSET (< FB 4) ;
//  - placeholders '?' ; id = UUID pré-généré (VARCHAR(36)) → contourne les generators ;
//  - BOOLEAN natif (FB 3.0+).
//
// ⚠ STATUT : code écrit, VALIDATION SUR MOTEUR RÉEL EN ATTENTE (pas de serveur Firebird en CI ;
//   rejoint CockroachDB/DB2/HANA/Spanner/Sybase). À valider via test-sgbd.ts firebird.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type {
  IDialect,
  DialectType,
  ConnectionConfig,
  EntitySchema,
  FieldDef,
  QueryOptions,
} from '../core/types.js';
import { AbstractSqlDialect } from './abstract-sql.dialect.js';

// ============================================================
// Type Mapping — DAL FieldType → Firebird column type
// ============================================================

const FIREBIRD_TYPE_MAP: Record<string, string> = {
  string:  'VARCHAR(255)',
  // text/json/array en VARCHAR(4000) et NON en BLOB : node-firebird 2.3.2 HANGE à la
  // lecture des BLOB sur wire chiffré (le serveur FB3 impose wireCrypt). VARCHAR évite
  // le BLOB. LIMITE : contenu > 4000 caractères non supporté (et le total de colonnes
  // larges reste borné par la taille de ligne Firebird ~64 Ko).
  text:    'VARCHAR(4000)',
  number:  'DOUBLE PRECISION',
  // SMALLINT 0/1 et NON le BOOLEAN natif FB3 : node-firebird binde les booléens JS
  // comme chaînes '1'/'0' → la colonne BOOLEAN lève -303 (Conversion error). SMALLINT
  // accepte l'entier 0/1 (convention par défaut de serialize/deserializeBoolean).
  boolean: 'SMALLINT',
  date:    'TIMESTAMP',
  json:    'VARCHAR(4000)', // JSON sérialisé en texte
  array:   'VARCHAR(4000)',
};

/** Forme minimale du driver `node-firebird` (callback-based). */
interface FbDatabase {
  query(sql: string, params: unknown[], cb: (err: unknown, result: unknown) => void): void;
  detach(cb?: (err: unknown) => void): void;
}
interface FbApi {
  attach(options: Record<string, unknown>, cb: (err: unknown, db: FbDatabase) => void): void;
  attachOrCreate(options: Record<string, unknown>, cb: (err: unknown, db: FbDatabase) => void): void;
}

// ============================================================
// FirebirdDialect
// ============================================================

export class FirebirdDialect extends AbstractSqlDialect {
  readonly dialectType: DialectType = 'firebird';
  /** Exposé pour accès brut en test. */
  db: FbDatabase | null = null;

  // --- Abstract implementations ---

  quoteIdentifier(name: string): string {
    // Quotes doubles → identifiant sensible à la casse, conservé en minuscules partout.
    return `"${name.replace(/"/g, '""')}"`;
  }

  getPlaceholder(_index: number): string {
    return '?';
  }

  fieldToSqlType(field: FieldDef): string {
    return FIREBIRD_TYPE_MAP[field.type] || 'VARCHAR(255)';
  }

  getIdColumnType(): string {
    // UUID pré-généré côté ORM (comme les autres dialectes) → pas de generator Firebird.
    return 'VARCHAR(36)';
  }

  /** Liste des tables utilisateur via la table système RDB$RELATIONS. */
  getTableListQuery(): string {
    return (
      'SELECT TRIM(RDB$RELATION_NAME) AS name FROM RDB$RELATIONS ' +
      'WHERE RDB$VIEW_BLR IS NULL AND (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)'
    );
  }

  /** Colonnes existantes via RDB$RELATION_FIELDS (introspection pour ALTER ADD COLUMN). */
  protected async getExistingColumns(tableName: string): Promise<Set<string>> {
    try {
      const rows = await this.executeQuery<{ name: string }>(
        'SELECT TRIM(RDB$FIELD_NAME) AS name FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = ?',
        [tableName],
      );
      return new Set(rows.map(r => r.name).filter(Boolean));
    } catch { return new Set(); }
  }

  // --- Hooks (quirks Firebird) ---

  // CREATE TABLE IF NOT EXISTS absent avant FB 5.0 → l'abstrait garde via tableExists().
  protected supportsIfNotExists(): boolean { return false; }
  // Chemin sûr INSERT puis SELECT (évite RETURNING via le driver).
  protected supportsReturning(): boolean { return false; }
  // boolean ↔ SMALLINT 0/1 : on garde les défauts de l'abstrait (serializeBoolean → v?1:0,
  // deserializeBoolean → v===1|true|'1') ; voir le type-map ci-dessus.

  /** Firebird n'a pas d'ILIKE : insensible à la casse via UPPER(col) LIKE UPPER(?). */
  protected buildRegexCondition(col: string, flags?: string): string {
    if (flags?.includes('i')) return `UPPER(${col}) LIKE UPPER(${this.nextPlaceholder()})`;
    return `${col} LIKE ${this.nextPlaceholder()}`;
  }

  /**
   * Pagination Firebird : `ROWS <m> TO <n>` (1-based, en SUFFIXE après ORDER BY).
   * Pas de LIMIT/OFFSET avant FB 4. Couvre limit seul, skip seul, et les deux.
   */
  protected buildLimitOffset(options?: QueryOptions): string {
    const limit = options?.limit;
    const skip = options?.skip ?? 0;
    if (!limit && !skip) return '';
    const from = skip + 1;
    const to = limit ? skip + limit : Number.MAX_SAFE_INTEGER;
    return ` ROWS ${from} TO ${to}`;
  }

  // --- callback → promise ---

  private queryAsync(sql: string, params: unknown[]): Promise<unknown> {
    return new Promise((res, rej) => {
      if (!this.db) { rej(new Error('Firebird not connected. Call connect() first.')); return; }
      this.db.query(sql, params, (err, result) => (err ? rej(this.toError(err)) : res(result)));
    });
  }
  private toError(err: unknown): Error {
    if (err instanceof Error) return err;
    const m = (err as { message?: string })?.message ?? JSON.stringify(err);
    return new Error(`Firebird: ${m}`);
  }

  // --- Connection lifecycle ---

  async doConnect(config: ConnectionConfig): Promise<void> {
    let Firebird: FbApi;
    try {
      const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ 'node-firebird' as string);
      Firebird = ((mod as { default?: unknown }).default ?? mod) as FbApi;
    } catch (e: unknown) {
      throw new Error(
        `Firebird driver not found. Install it: npm install node-firebird\n` +
        `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    // URI : firebird://user:password@host:port/chemin-ou-alias[?role=&create=true]
    const u = new URL(config.uri.replace(/^firebird:\/\//, 'http://'));
    const database = decodeURIComponent(u.pathname.replace(/^\//, '')); // /abs/path → abs/path ; //abs → /abs
    const options: Record<string, unknown> = {
      host: u.hostname || '127.0.0.1',
      port: u.port ? Number(u.port) : 3050,
      database,
      user: decodeURIComponent(u.username) || 'SYSDBA',
      password: decodeURIComponent(u.password) || 'masterkey',
      lowercase_keys: true,   // colonnes en minuscules (cohérent avec quoteIdentifier)
      blobAsText: true,       // BLOB SUB_TYPE TEXT lu directement en string
      encoding: 'UTF8',
    };
    const role = u.searchParams.get('role');
    if (role) options.role = role;
    // FB 3.0 : le serveur exige souvent le chiffrement wire + plugin Srp. La négociation
    // auto du driver plante (tente Srp256 absent). On force des défauts sûrs FB3,
    // surchargeables : ?wireCrypt=disable|enable & ?plugin=Srp|Srp256|Legacy_Auth
    options.wireCrypt = u.searchParams.get('wireCrypt') === 'disable' ? 0 : 1; // DISABLE=0 / ENABLE=1
    options.pluginName = u.searchParams.get('plugin') ?? 'Srp';
    // create=true → crée la base si absente (pratique en dev, comme les dialectes fichier).
    const create = u.searchParams.get('create') === 'true' || config.schemaStrategy === 'create-drop';

    this.db = await new Promise<FbDatabase>((res, rej) => {
      const cb = (err: unknown, db: FbDatabase) => (err ? rej(this.toError(err)) : res(db));
      if (create) Firebird.attachOrCreate(options, cb);
      else Firebird.attach(options, cb);
    });
  }

  async doDisconnect(): Promise<void> {
    if (!this.db) return;
    const db = this.db;
    this.db = null;
    await new Promise<void>((res) => db.detach(() => res()));
  }

  async doTestConnection(): Promise<boolean> {
    if (!this.db) return false;
    try {
      // Firebird exige un FROM : RDB$DATABASE est la table système mono-ligne.
      await this.queryAsync('SELECT 1 FROM RDB$DATABASE', []);
      return true;
    } catch (e) {
      this.log('TEST_CONNECTION', `down: ${(e as Error).message}`);
      return false;
    }
  }

  // --- Query execution ---

  async doExecuteQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    const result = await this.queryAsync(sql, params);
    return (Array.isArray(result) ? result : []) as T[];
  }

  /**
   * node-firebird n'expose pas de compteur d'affected-rows fiable pour les DML
   * (INSERT/UPDATE/DELETE → result généralement undefined ; RETURNING → tableau).
   * LIMITATION connue : updateMany()/deleteMany() peuvent renvoyer un compte approximatif.
   * À revisiter en validation live (parsing isc_info_sql_records ou RETURNING).
   */
  async doExecuteRun(sql: string, params: unknown[]): Promise<{ changes: number }> {
    const result = await this.queryAsync(sql, params);
    return { changes: Array.isArray(result) ? result.length : 1 };
  }

  // --- DROP : Firebird n'a NI `IF EXISTS` NI `CASCADE` sur DROP TABLE ---

  protected getDropTableSql(tableName: string): string {
    return `DROP TABLE ${this.quoteIdentifier(this.getPrefixedName(tableName))}`;
  }

  /**
   * Sans `DROP ... CASCADE`, on supprime en PLUSIEURS PASSES pour résoudre l'ordre
   * des clés étrangères (table référençante avant référencée). Idempotent : une
   * erreur (FK bloquante OU table absente) est ignorée et retentée à la passe suivante.
   */
  async dropSchema(schemas: EntitySchema[]): Promise<string[]> {
    const targets = new Set<string>();
    for (const s of schemas) {
      targets.add(s.collection);
      for (const rel of Object.values(s.relations || {})) {
        if (rel.type === 'many-to-many' && rel.through) targets.add(rel.through);
      }
    }
    const dropped: string[] = [];
    const maxPasses = targets.size + 1;
    for (let pass = 0; pass < maxPasses && targets.size > 0; pass++) {
      for (const name of [...targets]) {
        try {
          await this.executeRun(this.getDropTableSql(name), []);
          targets.delete(name);
          dropped.push(name);
        } catch (e) {
          this.log('DROP_TABLE', `${name} retenté (${(e as Error).message.slice(0, 60)})`);
        }
      }
    }
    return dropped;
  }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new FirebirdDialect();
}

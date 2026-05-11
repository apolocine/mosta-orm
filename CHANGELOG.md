# Changelog

All notable changes to `@mostajs/orm` will be documented in this file.

## [1.16.0] — 2026-05-11

### Added — Auto-fix V3-A V2 *(R001 + R002 + R016)*

Auto-fix élargi à 3 nouvelles règles via ts-morph :

- **R001-EMPTY-RELATIONS** : retire le field FK string de `fields: { ... }`
  ET ajoute la relation correspondante dans `relations: { ... }` avec
  `type: 'many-to-one', target: '<Entity>', onDelete: 'cascade'`.
  Préserve `required: true` du field d'origine.

- **R002-FK-NAMING-INCONSISTENT** : rename le field dans le schéma
  *(parentId → parent, questionId → question, etc. selon convention
  majoritaire détectée)*. Note dans le `reason` : refactor cross-file
  des usages reste à la charge du dev *(via IDE rename)*.

- **R016-AUDIT-EMAIL-AS-STRING** : convertit le field string
  *(createdBy/updatedBy/etc.)* en relation `many-to-one` vers User avec
  `onDelete: 'set-null'` *(préserve l'audit historique si le user est
  supprimé)*. Note : les usages cross-file qui assignent `field: email`
  doivent être adaptés au new schema *(field accepte désormais un User id)*.

### Added — `rollbackFixes()` API + `--rollback-fix` CLI

```ts
import { rollbackFixes } from '@mostajs/orm/validator'

rollbackFixes('./schemas')  // restore tous les .bak puis les supprime
```

```bash
npx mostajs-orm-validator ./schemas --rollback-fix
```

Permet d'annuler un `--fix` malheureux *(scenario : `--fix` casse les
tests → `--rollback-fix` → revue manuelle puis `--fix-rules R013` ciblé)*.

### Tests

- 23/23 tests unitaires passent *(incluant 4 fixer R001/R009/R013/R016 +
  rollback)*

### Plugin VSCode V0.1.0 *(séparé)*

Scaffold du plugin Marketplace dans `mostajs/mosta-orm-vscode/` :
- Squiggles inline pour les findings *(severity → DiagnosticSeverity)*
- Commandes : Validate / FixAll *(stub V2)* / Rollback
- Configuration via settings VSCode
- Activation à l'ouverture d'un fichier TS

À publier sur Marketplace après calibration cross-projets V4.

---

## [1.15.0] — 2026-05-11

### Added — ORMConceptValidator V3 *(auto-fix + R018 complète)*

**V3-A — Auto-fix `--fix`** : applique automatiquement les corrections
pour les règles fixables, via parsing AST (`ts-morph`, nouvelle dep).

Règles auto-fix supportées :
- **R013-MISSING-CASCADE** — ajoute `onDelete: 'cascade'` aux relations
  `many-to-one` qui n'en ont pas
- **R009-MISSING-LOOKUP-INDEX** — ajoute l'index manquant *(unique si le
  champ a `unique: true`, simple sinon)*

Modes :
- `--fix-dry-run` — affiche les diffs unifiés sans modifier les fichiers
- `--fix` — applique réellement *(backup `.bak` par défaut, désactivable
  avec `--no-backup`)*
- `--fix-rules R013,R009` — filtrer les règles à corriger

API programmatique :
```ts
import { applyFixes } from '@mostajs/orm/validator'

const fixes = await applyFixes(report, {
  sourceRoot: './schemas',
  dryRun: false,
  rules: ['R013', 'R009'],
})
```

Règles non-fixables auto en V1 *(R001, R002, R016)* : suggestion textuelle
seulement *(refactor cross-file requis — V3-A V2)*.

**V3-B — R018-EXTERNAL-SCHEMA-OVERSCOPED implémenté** :
détecte les `export { XxxSchema } from 'external-package'` et compte
les usages des fields du schema externe dans les sources. Suggestion :
extraire un sous-schéma local OU documenter les champs ignorés OU
ouvrir un issue sur le module externe pour scinder.

### Added — dep `ts-morph`

Utilisée par `fixer.ts` pour modifier les schémas TS de façon AST-safe
*(évite les patches regex fragiles)*.

### Tests

- 20/20 tests unitaires passent *(`test-scripts/validator-rules.test.mjs`)*
  *(18 règles + 2 fixer R013/R009 + smoke clean)*
- 8/8 smoke E2E sur consumer codebase
- `npx mostajs-orm-validator --help` affiche les nouvelles options

---

## [1.14.0] — 2026-05-11

### Added — `ORMConceptValidator` *(new submodule `@mostajs/orm/validator`)*

Algorithmic linter for `EntitySchema` sets. Detects 18 conceptual
anomalies (empty relations, FK naming inconsistency, soft-delete
patterns, JSON-as-relation, dead code, missing audit, unbounded
blobs, etc.). Zero IA, zero heuristics, **fully generic** — same
binary detects the same anti-patterns in any consumer codebase.

```ts
import { validateSchemas, formatText } from '@mostajs/orm/validator'

const report = await validateSchemas(Object.values(schemas), {
  sourceRoot: './lib',
})
console.log(formatText(report))
```

```bash
npx mostajs-orm-validator ./schemas --src ./lib --ci --max-warnings 0
```

**15 active rules + 1 stub** : R001..R018 (cf. README section
"ORMConceptValidator").

**Output formats** : text *(TTY-aware ANSI colors)*, JSON *(CI/diff)*,
Markdown *(human-readable)*.

**Configurable** : ignore list, severity override, `softDeletePatterns`,
`auditByFields`, thresholds — no hardcoded business strings.

**TypeScript schemas** loaded directly via [`jiti`](https://github.com/unjs/jiti)
*(new dep)* — no compile step required.

**Validation** :
- 18/18 unit tests pass
- 8/8 smoke E2E checks pass on a real consumer codebase (15+ schemas)

**Non-breaking** : opt-in submodule.

### Added — `bin` entry `mostajs-orm-validator`

Available via `npx mostajs-orm-validator`.

---

## [1.13.1] — 2026-04-24

Two defensive fixes surfaced while wiring the brand-new Java client
(`com.mostajs:mostajs-net-client`) to the live demo server at
`https://mcp.amia.fr/`. Minimal payloads (`{name, collection, fields}`
without `indexes` nor `relations`) were crashing the server with
`Cannot read properties of undefined (reading 'length')`.

### Fixed — `AbstractSqlDialect.generateIndexes()` guards against missing `indexes`

`EntitySchema.indexes` is declared optional in the type, but
`generateIndexes()` iterated `schema.indexes.length` directly. When a
caller registered a schema without an `indexes` array (legitimate
minimal case), the loop threw a `TypeError`. Fixed by defaulting to
`schema.indexes ?? []` before iterating.

Reported by the Java integration test
`LiveServerIntegrationTest.uploadUserSchemaIfMissing`.

### Fixed — `validateSchemas()` guards against missing `relations`

Symmetric issue in `core/registry.ts:validateSchemas()` :
`Object.entries(schema.relations)` throws `TypeError: Cannot convert
undefined or null to object` when `relations` is absent. Fixed by
defaulting to `{}` before enumerating.

### Operational impact

The Java / C# / mobile clients can now post a minimal `EntitySchema`
via `POST /api/upload-schemas-json` (handled by `@mostajs/net`) without
being forced to emit empty `indexes: []` / `relations: {}` fields just
to survive DDL generation. Same root cause as the bug report that
came from `mosta-net-client-java` v0.1.

## [1.13.0] — 2026-04-21

Three independent improvement groups shipped together : **SQL FK correctness**,
**cross-dialect replication hardening (Mongo)**, and **profile-based config
cascade** via the new `@mostajs/config` package.

### Fixed — SQL dialect : FK columns preserve falsy-but-valid values (0, false)

Replaced the `data[name] || null` short-circuit by
`data[name] === '' ? null : (data[name] ?? null)` in `AbstractSqlDialect.insert`
and `AbstractSqlDialect.update`. The previous logic silently replaced valid
falsy values (numeric `0`, boolean `false`) with `null`, breaking FK writes
whose `id = 0` was legitimate.

### Added — SQL dialect : UNIQUE constraint on one-to-one FK columns

Relations declared as `type: 'one-to-one'` now get a column-level `UNIQUE`
constraint at `CREATE TABLE` and at `ALTER TABLE ADD` time. Matches the JPA
semantics where an O2O FK must be injective.

### Fixed — Mongo dialect : accepts UUID strings in FK (cross-dialect replication)

When a record originates from a SQL dialect (SQLite/Postgres/…) that uses
**UUID** primary keys, the replicated Mongo document stores the FK as a
string rather than a native `ObjectId`. Two changes :

1. FK fields in the Mongoose schema now use `Schema.Types.Mixed` instead of
   `ObjectId`, accepting both `ObjectId` and UUID-string values.
2. When Mongoose `populate()` returns `null` (because the ref lookup expects
   `_id` matching the FK's type), the dialect falls back to
   `findOne({ id: fkValue })` on the target collection.

Unblocks `@mostajs/replicator` for bidirectional SQL ↔ Mongo sync.

### Added — `MOSTA_ENV` profile cascade via `@mostajs/config`

Environment variables now support profile-based overrides. Set `MOSTA_ENV=TEST`
and any `TEST_DB_DIALECT` / `TEST_SGBD_URI` / etc. takes priority over plain
`DB_DIALECT` / `SGBD_URI`. If a profile override is absent, lookup silently
falls back to the plain variable — no crash on missing optional keys.

```bash
# .env
MOSTA_ENV=TEST
DB_DIALECT=postgres            # default
TEST_DB_DIALECT=sqlite         # TEST override
TEST_SGBD_URI=./test.sqlite
# No TEST_DB_SCHEMA_STRATEGY → falls back to DB_SCHEMA_STRATEGY or 'none'
```

Affects `getConfigFromEnv()` and `getCurrentDialectType()`.

This matches the well-known **Spring Boot profiles** pattern
(`spring.profiles.active=test` loading `application-test.properties`).

### Added — new dependency `@mostajs/config ^1.0.0`

The env loader has been extracted to a standalone package so other MostaJS
packages (`@mostajs/auth`, `@mostajs/payment`, `@mostajs/music`, …) can use
the same profile cascade.

```ts
import { getEnv, getEnvBool, getEnvNumber, getCurrentProfile } from '@mostajs/config';
```

The helpers are also re-exported from `@mostajs/orm` for convenience and
backward compatibility with the 1.13-alpha preview.

## [1.11.0] — 2026-04-16

### Added — Manual transaction API (`beginTx` / `commitTx` / `rollbackTx`)

Complements the existing `$transaction(cb)` wrapper with a manual trio
for flows that don't fit in a single callback (multi-function pipelines,
batch async, user-controlled commit).

```ts
const tx = await dialect.beginTx()
try {
  await dialect.create(UserSchema, { email: 'a@b.c' })
  await someExternalCheck()          // async, could take seconds
  if (ok) await dialect.commitTx(tx)
  else    await dialect.rollbackTx(tx)
} catch (e) { await dialect.rollbackTx(tx); throw e }
```

### Added — Nested transactions (SAVEPOINTs)

Both `$transaction(cb)` and `beginTx()` now transparently support
nesting. The outermost call emits a real `BEGIN`; subsequent nested
calls emit a `SAVEPOINT`. `commitTx` releases the savepoint for inner
levels and issues `COMMIT` only at the outermost level. Same logic for
rollback (`ROLLBACK TO SAVEPOINT` vs `ROLLBACK`).

```ts
const outer = await d.beginTx()                    // BEGIN
await d.create(UserSchema, { email: 'o@x.io' })

const inner = await d.beginTx()                    // SAVEPOINT mosta_sp_2_xxxx
await d.create(UserSchema, { email: 'i@x.io' })
await d.rollbackTx(inner)                          // ROLLBACK TO SAVEPOINT → inner gone

await d.commitTx(outer)                            // COMMIT → outer persists
```

LIFO enforcement : out-of-order commit throws with a clear message;
out-of-order rollback is silent (caller usually already surfacing its
own error).

### Dialect-specific savepoint overrides

- **MSSQL / Sybase** : `SAVE TRANSACTION` / `ROLLBACK TRANSACTION`
  (no RELEASE equivalent — auto-released at outer COMMIT).
- **Spanner** : savepoints not supported. `beginTx` throws a clear error
  when attempting to nest — flatten the flow or use `$transaction(cb)`
  once at the outer level.
- **Oracle / DB2 / HANA / PG / MySQL / MariaDB / SQLite / HSQLDB /
  CockroachDB** : standard `SAVEPOINT` / `RELEASE SAVEPOINT` /
  `ROLLBACK TO SAVEPOINT` (inherited from AbstractSqlDialect).

### Tests

`test-manual-transactions.ts` in `@mostajs/orm-bridge`
(SQLite) — **21/21 passing**. Covers : commit path, rollback path,
multi-function flow, outer try/catch integration, 5 sequential cycles,
`$transaction(cb)` delegation, out-of-order commit rejection, 2-level
nesting, 3-level nesting. Full bridge regression suite : 8/8 test files
green.

### Implementation note — `$transaction` now delegates

Since 1.11.0 the `$transaction(cb)` wrapper internally calls `beginTx`
→ `commitTx` / `rollbackTx` instead of issuing `BEGIN` / `COMMIT`
directly. Dialects only need to override the savepoint hooks (or the
`beginSql/commitSql/rollbackSql` hooks) once to get both flavours
behaving consistently.

## [1.10.8] — 2026-04-15

### Fixed — `$transaction` BEGIN keyword on Oracle / DB2 / HANA

The default `AbstractSqlDialect.beginSql()` returned `"BEGIN"` for every
SQL dialect. Oracle, DB2 and HANA all use **implicit** transactions —
there is no SQL `BEGIN` keyword, only PL/SQL block opener. Sending
`BEGIN ;` alone made Oracle raise `ORA-06550 PLS-00103` (DB2 / HANA
similar SQL parse errors). Symptom in production : every `$transaction`
call (which the bridge uses for nested writes / login → `update last_login_at`)
crashed at the very first statement.

Each of these three dialects now overrides `beginSql()` to **return null**
(skip the BEGIN), keeping the COMMIT/ROLLBACK on success/throw. When the
caller asks for an isolation level, the dialect-correct `SET TRANSACTION
ISOLATION LEVEL …` (`SET CURRENT ISOLATION = …` for DB2) is emitted instead.

## [1.10.7] — 2026-04-15

### Fixed — `'__MOSTA_NOW__'` sentinel handled at INSERT time too

`OracleDialect.serializeDate` and `MysqlDialect.serializeDate` only checked
`'now'`, not `'__MOSTA_NOW__'`. When a seed value carried the sentinel string
verbatim (e.g. produced by the orm-cli template generator), the override
fell into the `new Date(string)` branch → `Invalid Date` → returned the
literal `'__MOSTA_NOW__'` to the driver → ORA-01858 (Oracle) or
"Incorrect datetime value" (MySQL). Both overrides now recognise the
sentinel like `AbstractSqlDialect.serializeDate` already did since 1.10.1.

## [1.10.6] — 2026-04-15

### Added — `addMissingColumns` + dialect-correct `dropTable` for DB2 / HANA / Spanner

Same fixes as Oracle 1.10.4-1.10.5, applied to the three other dialects
that override `initSchema` :

- **`DB2Dialect`** :
  - `initSchema('update')` now calls `addMissingColumns` on existing tables.
  - `dropTable` issues plain `DROP TABLE x` (DB2 has no `IF EXISTS` /
    `CASCADE` keyword) and silently ignores SQLSTATE 42704 (object not found).
- **`HANADialect`** :
  - `initSchema('update')` now calls `addMissingColumns` on existing tables.
  - `dropTable` issues `DROP TABLE x CASCADE` and silently ignores HANA
    error 259 (invalid table name).
- **`SpannerDialect`** :
  - `initSchema('update')` now calls `addMissingColumns` on existing tables
    (executes ALTER TABLE statements outside the batched DDL — they are
    cheap and need fresh introspection per call).
  - `dropTable` issues plain `DROP TABLE x` (Spanner forbids `IF EXISTS`
    and `CASCADE`) and silently ignores "not found" errors.

## [1.10.5] — 2026-04-15

### Added

- **`addMissingColumns` now also adds the `id` column** when a legacy table
  uses a composite PK and lacks the surrogate `id` declared in the schema
  (e.g. `user_roles(userId, roleId)` migrating to `user_roles(id, userId, roleId, createdAt)`).
  Added nullable on populated tables — backfill is the user's responsibility.

### Fixed

- **Oracle `dropTable`** now uses Oracle-correct syntax. The default
  `DROP TABLE IF EXISTS x CASCADE` is invalid SQL on Oracle (`IF EXISTS`
  unsupported, cascade keyword is `CASCADE CONSTRAINTS`). Wrapped in a
  PL/SQL block that swallows ORA-00942 (table not found) and adds `PURGE`
  so the table can be recreated immediately without recycle-bin name clash.

## [1.10.4] — 2026-04-15

### Fixed

- **`OracleDialect.initSchema` now calls `addMissingColumns`** on existing
  tables (`update` strategy). The dialect overrides `initSchema` for FK /
  junction handling and was therefore bypassing the new ALTER-on-update
  behavior introduced in 1.10.3 for SQL dialects sharing the abstract
  implementation. Symptom : `ORA-00904: invalid identifier` on INSERT for
  any column added between releases.

  ```diff
    if (!exists) {
      await this.executeRun(this.generateCreateTable(schema), [])
  +  } else if (strategy === 'update') {
  +    await this.addMissingColumns(schema)
    }
  ```

  Same fix should be applied to `db2.dialect.ts`, `hana.dialect.ts`, and
  `spanner.dialect.ts` (they share the same override pattern). Pending
  Oracle validation, those will land in 1.10.5.

## [1.10.3] — 2026-04-15

### Added — `update` strategy now ALTERs existing tables

- **`schemaStrategy: 'update'` adds missing columns** (fields and M2O / O2O FK
  columns) to pre-existing tables via `ALTER TABLE ADD …`. Pre-1.10.3 the
  `update` strategy was effectively `CREATE TABLE IF NOT EXISTS` — it never
  touched live tables, so adding a field to an entity between releases caused
  `ORA-00904: invalid identifier` (Oracle), `1054 Unknown column` (MySQL),
  `Invalid column name` (MSSQL) at the next INSERT.
- New `protected getExistingColumns(tableName)` introspection method on
  `AbstractSqlDialect`. Default uses ANSI `information_schema.columns`
  (Postgres, MySQL, MariaDB, MSSQL, HSQLDB, Spanner, CockroachDB).
  Overridden in :
  - **`SQLiteDialect`** : `PRAGMA table_info(name)`
  - **`OracleDialect`** : `SELECT column_name FROM user_tab_columns WHERE table_name = :1`
- New `protected addMissingColumns(schema)` helper — case-insensitive diff
  vs the live table, emits one `ALTER TABLE ADD` per missing column. NOT
  NULL is intentionally skipped on ALTER (most engines reject it on a
  populated table without a DEFAULT) — the application enforces it.

Behavior remains 100% backward-compatible : if introspection fails, the
helper silently no-ops (legacy "do nothing on update" path).

## [1.10.2] — 2026-04-15

### Fixed

- **`prepareInsertData` skips `id`/`_id` in the fields loop.** When an
  EntitySchema declared `id` (or `_id`) inside `fields` (the orm-adapter
  emits this systematically with `default: '__MOSTA_OBJECT_ID__'`), the
  generated INSERT contained the column twice :
  ```sql
  INSERT INTO "users" ("id", "id", "email", …) VALUES (?, ?, ?, …)
  ```
  SQLite and PostgreSQL silently tolerated the duplicate; **Oracle, DB2,
  SQL Server, HANA, Sybase reject it with `ORA-00957: duplicate column
  name`** (or equivalent). This shipped undetected because all integration
  tests ran on SQLite. Regression tests on the bridge confirm 7/7 green
  after the fix.

## [1.10.1] — 2026-04-15

### Fixed

- **`__MOSTA_NOW__` sentinel recognised as "now" on every dialect.** The
  `@mostajs/orm-adapter` emits `default: '__MOSTA_NOW__'` for timestamp
  columns that should default to the current time (CreatedAt, UpdatedAt,
  joinDate, etc.). Pre-1.10.1 dialects only recognised the string `'now'` —
  so they emitted `DEFAULT '__MOSTA_NOW__'` literally in DDL, which Oracle
  rejects with `ORA-01858: non-numeric character` when trying to cast the
  literal string to `TIMESTAMP`. Both sentinels are now treated as "current
  time" in `AbstractSqlDialect.createTableSql`, `prepareInsertData`,
  `serializeDate`, and `MongoDialect.registerModel`.

  Symptom on Oracle : schema init crashed with `ORA-01858` on every table
  using a `default: '__MOSTA_NOW__'` field.
  Symptom on SQLite/Postgres/MySQL : tables created with the literal string
  `'__MOSTA_NOW__'` as default, silently making every row "dated" 1970-01-01.

## [1.10.0] — 2026-04-14

### Added

- **`IDialect.$transaction()`** — real ACID transactions across every SQL
  dialect inheriting `AbstractSqlDialect` (SQLite, PostgreSQL, MySQL,
  MariaDB, MSSQL, Oracle, DB2, CockroachDB, HANA, Sybase, HSQLDB, Spanner).
  The default implementation wraps the callback in `BEGIN` / `COMMIT`
  (`ROLLBACK` on throw) with an optional `isolation` argument.

  ```ts
  await dialect.$transaction(async (tx) => {
    await tx.create(UserSchema, { email: 'a@b.c' })
    await tx.update(UserSchema, id, { status: 'active' })
    // throw → both writes rolled back
  })
  ```

  Concrete dialects can override for pool-aware client checkout (strict
  correctness under high concurrency). The default works transparently on
  single-connection dialects (SQLite, HSQLDB) and with `poolSize: 1` on
  pooled dialects.

### Known limitations

- Pool-based SQL dialects (Postgres, MySQL, …) : without per-dialect
  client checkout, a `$transaction` callback running parallel queries may
  land on different pool connections. Set `poolSize: 1` for strict
  correctness, or wait for per-dialect overrides (planned 1.10.x).
- MongoDB `$transaction` is not yet wired (requires session threading).
  Planned for 1.10.1.

## [1.9.4] — 2026-04-14

### Breaking (minor — niche API)

- **JDBC bridge moved to `@mostajs/orm/bridge` subpath.** Symbols
  `JdbcNormalizer`, `parseUri`, `BridgeManager`, `JDBC_REGISTRY`,
  `hasJdbcDriver`, `getJdbcDriverInfo`, `saveJarFile`, `deleteJarFile`,
  `listJarFiles`, `detectDialectFromJar`, `getJdbcDialectStatus`, and
  their types are **no longer exported from the package root**.

  **Migration** :
  ```diff
  - import { JdbcNormalizer, parseUri } from '@mostajs/orm'
  + import { JdbcNormalizer, parseUri } from '@mostajs/orm/bridge'
  ```

  **Why** : the JDBC path statically imports `child_process` (to spawn
  the Java bridge). Re-exporting it from the root caused
  `Can't resolve 'child_process'` errors in Next.js client chunks even
  for apps that never touch JDBC. This mirrors the isolation pattern
  used by `@prisma/client/runtime` and `@auth/core/jwt`.

### Fixed

- Bare specifiers (`'fs'`, `'path'`, `'url'`) instead of `'node:'` prefix
  in `core/factory.ts`. Some webpack builds in downstream Next.js apps
  fail with `UnhandledSchemeError: Reading from "node:fs"` when a dep is
  inadvertently pulled into a `pages/` chunk. Bare names work everywhere.

## [1.9.3] — 2026-04-14

### Fixed

- Dialect imports hidden from bundler static analysis via `webpackIgnore`
  + absolute `file://` URL. Supports Next.js without `serverExternalPackages`.

## [1.9.2] — 2026-04-12

First tagged release with the Hibernate-inspired multi-dialect ORM,
13 dialects (SQLite, PostgreSQL, MongoDB, MySQL, MariaDB, Oracle, SQL
Server, CockroachDB, DB2, SAP HANA, HSQLDB, Spanner, Sybase), repository
pattern, named connections, schema diffing.

# Changelog

All notable changes to `@mostajs/orm` will be documented in this file.

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

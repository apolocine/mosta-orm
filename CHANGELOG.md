# Changelog

All notable changes to `@mostajs/orm` will be documented in this file.

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

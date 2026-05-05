# @mostajs/orm

> **Plug & Play ORM to Drive 13 Databases at Once**

[![npm version](https://img.shields.io/npm/v/@mostajs/orm.svg)](https://www.npmjs.com/package/@mostajs/orm)
[![npm downloads](https://img.shields.io/npm/dm/@mostajs/orm.svg)](https://www.npmjs.com/package/@mostajs/orm)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![dialects](https://img.shields.io/badge/dialects-13-success.svg)](#databases)
[![Types: TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@mostajs/orm)](https://bundlephobia.com/package/@mostajs/orm)

Hibernate-inspired multi-dialect ORM for Node.js & TypeScript — **one API, 13 databases, zero lock-in, bundler-friendly**.

📦 **npm** · https://www.npmjs.com/package/@mostajs/orm
🐙 **GitHub** · https://github.com/apolocine/mosta-orm
📚 **Docs** · *(coming soon)*
🚀 **Product Hunt** · *(launch link to be added)*

---

## Why @mostajs/orm ?

- 🎯 **One API, 13 dialects.** Switch from PostgreSQL to MongoDB to SQLite without rewriting a single repository call.
- 🪶 **Zero lock-in.** Native drivers, no proprietary query DSL — your SQL/NoSQL stays portable.
- 🧬 **Hibernate / JPA semantics.** `@OneToMany`, cascade types, `SAVEPOINT`, schema strategies (`validate`/`update`/`create`/`create-drop`) — concepts battle-tested for 25 years, ported to TypeScript.
- 🌉 **Drop-in Prisma replacement.** [`@mostajs/orm-bridge`](https://www.npmjs.com/package/@mostajs/orm-bridge) lets you keep your Prisma code while running on any of 13 databases.
- 🔁 **Cross-dialect replication built-in.** [`@mostajs/replicator`](https://www.npmjs.com/package/@mostajs/replicator) — CDC + master/slave + failover across SQL ↔ MongoDB.
- 🧪 **Bundler-friendly.** Tree-shakable ESM, no `eval`, works with esbuild / Vite / Next.js / Bun out of the box.

## 60-second demo

```bash
npm install @mostajs/orm better-sqlite3
```

```typescript
import { getDialect } from '@mostajs/orm'
import { UserSchema } from './schemas/user.schema'

const db = await getDialect({ dialect: 'sqlite', uri: ':memory:' }, [UserSchema])
const userRepo = db.repo<typeof UserSchema>('User')

await userRepo.create({ email: 'alice@example.com', name: 'Alice' })
const alice = await userRepo.findOne({ email: 'alice@example.com' })
```

Want PostgreSQL instead ? Change one line :

```typescript
const db = await getDialect({ dialect: 'postgres', uri: process.env.DATABASE_URL }, [UserSchema])
```

That's it. Same `repo.create()`, same `repo.findOne()`, same TypeScript types — different dialect.

## How it compares

| | @mostajs/orm | Prisma | Drizzle | TypeORM |
|---|:---:|:---:|:---:|:---:|
| SQL dialects | **9** *(PG, MySQL, MariaDB, SQLite, MSSQL, Oracle, DB2, HANA, Cockroach…)* | 5 | 5 | 8 |
| NoSQL dialects | **MongoDB native** | ❌ | ❌ | ❌ |
| Same API across SQL & NoSQL | ✅ | ❌ | ❌ | ❌ |
| Cross-dialect replication | ✅ *(via [@mostajs/replicator](https://www.npmjs.com/package/@mostajs/replicator))* | ❌ | ❌ | ❌ |
| Schema-as-code *(no DSL)* | ✅ TypeScript objects | DSL `.prisma` | TS objects | Decorators |
| Code generation step | ❌ *(zero codegen)* | ✅ required | ❌ | ❌ |
| Drop-in Prisma replacement | ✅ *(via [@mostajs/orm-bridge](https://www.npmjs.com/package/@mostajs/orm-bridge))* | — | ❌ | ❌ |
| Migration from Prisma | ✅ *(automated CLI)* | — | manual | manual |
| Hibernate / JPA semantics | ✅ | ❌ | ❌ | partial |
| License | AGPL-3.0 *(+ commercial)* | Apache-2.0 | Apache-2.0 | MIT |

> Numbers as of v1.13.1 — see [`@mostajs/orm-cli`](https://www.npmjs.com/package/@mostajs/orm-cli) for the automated Prisma → @mostajs migration tool.

## Star · Sponsor · Contribute

If `@mostajs/orm` saves you days of glue code, please :

- ⭐ **Star** the repo — visibility helps me keep maintaining it.
- 💖 **Sponsor** development → [github.com/sponsors/apolocine](https://github.com/sponsors/apolocine)
- 🐛 Report issues / submit PRs — every contribution counts.
- ✉️ Commercial license & support : drmdh@msn.com

---

## Databases

SQLite · PostgreSQL · MySQL · MariaDB · MongoDB · Oracle · SQL Server · CockroachDB · DB2 · SAP HANA · HSQLDB · Spanner · Sybase

---

## Demos

### 1. Initialize the app

<video src="https://github.com/user-attachments/assets/8f8b363e-4cc9-4b74-b1c8-d9c83b362327" width="60%" autoplay loop muted></video>

### 2. Initialize the database

<video src="https://github.com/user-attachments/assets/e96a303b-f14c-4d90-a014-ccc342f071e5" width="60%" autoplay loop muted></video>

### 3. Configure the app

<video src="https://github.com/user-attachments/assets/5a344a63-f1a5-426a-96d2-11f8816c2f53" width="60%" autoplay loop muted></video>

### 4. Setup replication

<video src="https://github.com/user-attachments/assets/201f4a35-0c21-45d7-8df5-0554c68a2b5b" width="60%" autoplay loop muted></video>

### 5. Cross-dialect CDC rules & live sync

<video src="https://github.com/user-attachments/assets/d30674c1-4379-46c8-95f3-8f0f4b883df1" width="60%" autoplay loop muted></video>

### 6. Frontend CRUD app

<video src="https://github.com/user-attachments/assets/9f78ee1b-ac9a-4d5e-ae91-1ec203e31447" width="60%" autoplay loop muted></video>

### 7. Prisma project (before migration)

<video src="https://github.com/user-attachments/assets/15db7457-9cae-4f51-b631-7590a20fcbbd" width="60%" autoplay loop muted></video>

### 8. Prisma → @mostajs/orm migration (bootstrap)

<video src="https://github.com/user-attachments/assets/ae0acd7c-43bb-4d39-84b1-9455aeb0331d" width="60%" autoplay loop muted></video>

---

## Install

```bash
npm install @mostajs/orm
# + the driver for your dialect :
npm install better-sqlite3      # or: pg, mysql2, mongoose, oracledb, mssql, ibm_db, mariadb, @sap/hana-client, @google-cloud/spanner
```

## Define a schema

```typescript
import type { EntitySchema } from '@mostajs/orm'

export const UserSchema: EntitySchema = {
  name: 'User',
  collection: 'users',
  timestamps: true,
  fields: {
    email: { type: 'string', required: true, unique: true },
    name:  { type: 'string', required: true },
  },
  relations: {
    roles: { target: 'Role', type: 'many-to-many', through: 'user_roles' },
  },
  indexes: [{ fields: { email: 'asc' }, unique: true }],
}
```

## Unique keys

A field can be marked unique, or several fields can be combined into a composite unique constraint via `indexes`.

```typescript
export const MemberSchema: EntitySchema = {
  name: 'Member',
  collection: 'members',
  fields: {
    email:    { type: 'string', required: true, unique: true },  // single unique
    tenantId: { type: 'string', required: true },
    slug:     { type: 'string', required: true },
  },
  indexes: [
    { fields: { tenantId: 'asc', slug: 'asc' }, unique: true },  // composite unique
  ],
}
```

Both shapes enforce a DDL `UNIQUE` constraint on SQL dialects and a unique index on MongoDB. Lookup works the same way :

```typescript
await repo.findOne({ email: 'a@b.com' })                       // single unique
await repo.findOne({ tenantId: 't1', slug: 'admin' })          // composite unique
```

## Connect & CRUD

```typescript
import { registerSchemas, getDialect, BaseRepository } from '@mostajs/orm'

registerSchemas([UserSchema])
const dialect = await getDialect()       // reads DB_DIALECT + SGBD_URI from env
const repo = new BaseRepository(UserSchema, dialect)

await repo.create({ email: 'a@b.com', name: 'Admin' })
await repo.findOne({ email: 'a@b.com' })
await repo.findAll({ status: 'active' }, { sort: { name: 1 }, limit: 10 })
await repo.update(id, { name: 'Updated' })
await repo.delete(id)
await repo.findByIdWithRelations(id, ['roles'])
await repo.upsert({ email: 'a@b.com' }, { name: 'Upserted' })
await repo.count({ status: 'active' })
```

## Transactions

Group multiple operations into a single atomic unit. SQL dialects (PostgreSQL, MySQL/MariaDB, SQLite, SQL Server, Oracle, DB2, CockroachDB, HANA, Sybase, HSQLDB, Spanner) wrap the callback in `BEGIN` / `COMMIT` / `ROLLBACK`. If any operation throws, every write inside the block is rolled back.

```typescript
import { getDialect } from '@mostajs/orm'

const dialect = await getDialect()

await dialect.$transaction(async (tx) => {
  await tx.create('accounts', { id: 'a', balance: 100 })
  await tx.update('accounts', { id: 'b' }, { $inc: { balance: -50 } })
  await tx.update('accounts', { id: 'a' }, { $inc: { balance:  50 } })
  // throw here → both updates are rolled back, `accounts.a` row is removed
})
```

**Isolation** : default per dialect (SQL → `READ COMMITTED`, SQLite → `DEFERRED`). Pass `{ isolation: 'SERIALIZABLE' }` as 2nd argument to override (SQL only).

**All SQL dialects listed above support ACID natively** — PostgreSQL, MySQL/MariaDB, SQL Server, Oracle, DB2, SQLite, CockroachDB, HANA, Sybase, HSQLDB, Spanner. No configuration required beyond the usual connection.

**MongoDB is the only exception** : multi-document ACID transactions require a replica set (a single-node `mongod --replSet rs0` is enough for dev — this is a MongoDB server requirement, not a limitation of this library). On a standalone server, `$transaction` runs the callback without wrapping — safe for read-heavy flows, non-atomic for writes.

### Manual transactions — `beginTx` / `commitTx` / `rollbackTx` (v1.11+)

When the `$transaction(cb)` callback pattern is too restrictive (transaction spans several unrelated functions, commit depends on an external event), use the manual API :

```ts
const tx = await dialect.beginTx()
try {
  await dialect.create(UserSchema, { email: 'a@b.c', name: 'A' })
  await someExternalCheck()          // could be async, could take seconds
  if (ok) await dialect.commitTx(tx)
  else    await dialect.rollbackTx(tx)
} catch (e) {
  await dialect.rollbackTx(tx)
  throw e
}
```

**Nested transactions — SAVEPOINTs are used automatically :**

```ts
const outer = await dialect.beginTx()               // → BEGIN
await dialect.create(UserSchema, { email: 'o@x.io', name: 'Outer' })

const inner = await dialect.beginTx()               // → SAVEPOINT mosta_sp_2_xxxx
await dialect.create(UserSchema, { email: 'i@x.io', name: 'Inner' })
await dialect.rollbackTx(inner)                     // → ROLLBACK TO SAVEPOINT
//                                                     (inner row gone, outer untouched)

await dialect.commitTx(outer)                       // → COMMIT
//                                                     (outer row persisted)
```

Depth unbounded as long as the engine supports `SAVEPOINT` (every SQL dialect above except **Spanner**). MSSQL / Sybase use `SAVE TRANSACTION` / `ROLLBACK TRANSACTION` internally — transparent to the API. `commitTx` / `rollbackTx` enforce LIFO order (out-of-order commit throws, out-of-order rollback is silent).

## Environment

```bash
DB_DIALECT=postgres
SGBD_URI=postgresql://user:pass@localhost:5432/mydb
DB_SCHEMA_STRATEGY=update    # validate | update | create | create-drop | none
DB_SHOW_SQL=true
```

The naming mirrors Hibernate's `hibernate.hbm2ddl.auto` / `hibernate.show_sql`
properties (see [Hibernate User Guide § schema strategies](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#schema-generation)). Values have identical semantics : `validate` /
`update` / `create` / `create-drop` / `none`.

The dialect matching `DB_DIALECT` is **lazy-loaded at runtime** (v1.9.3+). Only the driver you actually use is evaluated — no other dialect module enters your bundle. This is what makes @mostajs/orm safe to pull into a Next.js / Vite / SvelteKit project without bundler workarounds.

### Profile cascade with `MOSTA_ENV` (v1.13+)

Powered by [`@mostajs/config`](https://www.npmjs.com/package/@mostajs/config).
Keep **one** `.env` file with profile-prefixed overrides and switch via a
single `MOSTA_ENV` variable — exactly like [Spring Boot profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html)
(`spring.profiles.active=test` loading `application-test.properties`).

```bash
# .env — committed (non-secret) defaults
MOSTA_ENV=TEST

# Base defaults (used when no profile, or as fallback)
DB_DIALECT=sqlite
SGBD_URI=./data.sqlite

# Profile overrides
TEST_DB_DIALECT=sqlite
TEST_SGBD_URI=./test.sqlite
TEST_DB_SCHEMA_STRATEGY=create-drop

DEV_DB_DIALECT=postgres
DEV_SGBD_URI=postgres://localhost:5432/devdb
DEV_DB_SCHEMA_STRATEGY=update

PROD_DB_DIALECT=mongodb
PROD_SGBD_URI=${SCALEWAY_MONGO_URI}    # secret injected by orchestrator
PROD_DB_SCHEMA_STRATEGY=validate
```

**Resolution cascade** (first non-empty wins) :

1. `${MOSTA_ENV}_${KEY}` — profile-prefixed
2. `${KEY}` — plain
3. `fallback` argument
4. `undefined` — no crash, caller decides whether that's fatal

Silent fallback is guaranteed : a missing profile override never throws, it
just falls through to the plain variable or to the default. Empty strings
(`TEST_DB_DIALECT=`) are treated as "not set" so they don't silently leak a
blank value.

For generic use outside `@mostajs/orm`, import directly from the config
package :

```ts
import { getEnv, getEnvBool, getEnvNumber, getCurrentProfile } from '@mostajs/config'

const url = getEnv('REDIS_URL', 'redis://localhost:6379')
console.log(`Profile : ${getCurrentProfile() ?? 'none'}`)
```

## Switch databases with one env var

```bash
DB_DIALECT=sqlite     SGBD_URI=./data.sqlite
DB_DIALECT=postgres   SGBD_URI=postgres://...
DB_DIALECT=mongodb    SGBD_URI=mongodb://...
# same code in both cases
```

## Subpaths

| Subpath | When to use |
|---|---|
| `@mostajs/orm` | The core ORM API : `getDialect`, `registerSchemas`, `BaseRepository`, `EntityService`, schema types, `diffSchemas`, errors. |
| `@mostajs/orm/bridge` | **JDBC bridge** (v1.9.4+) : `JdbcNormalizer`, `BridgeManager`, `JDBC_REGISTRY`, jar upload. Pulled out of the root to keep `child_process` / `fs` spawn out of client bundles. |
| `@mostajs/orm/register` | Zero-code registration side-effect for dynamic schema loading. |

## EntityService (for @mostajs/net)

```typescript
import { EntityService } from '@mostajs/orm'

const service = new EntityService(dialect)
const res = await service.execute({
  op: 'findAll',
  entity: 'User',
  filter: { status: 'active' },
  relations: ['roles'],
  options: { limit: 10 },
})
```

Operations : `findAll`, `findOne`, `findById`, `create`, `update`, `delete`, `deleteMany`, `count`, `search`, `aggregate`, `upsert`, `updateMany`, `addToSet`, `pull`, `increment`.

## Schema management

```typescript
await dialect.initSchema(getAllSchemas())      // create / update DDL per strategy
await dialect.truncateTable?.('users')
await dialect.truncateAll?.(getAllSchemas())
await dialect.dropTable?.('users')
await dialect.dropSchema?.(getAllSchemas())
await dialect.dropAllTables?.()
```

## Dialect-level guarantees (v1.13+)

Two classes of correctness fixes ship with 1.13, both driven by real
production pain encountered during `@mostajs/replicator` runs.

### SQL dialects (`AbstractSqlDialect`)

- **FK columns preserve falsy-but-valid values (`0`, `false`).** The previous
  short-circuit `data[name] || null` silently replaced legitimate zero IDs
  and boolean `false` with `null`, breaking FK writes whose source-side PK
  happened to be `0`. The insert/update path now uses
  `value === '' ? null : (value ?? null)` — empty strings still null-out
  (SQL foreign-key constraints reject them on most dialects) but numeric
  zero, `false` and any non-empty value round-trip intact.
- **One-to-one relations get a column-level `UNIQUE` constraint.** Emitted
  both at `CREATE TABLE` time and at `ALTER TABLE ADD` time when growing
  an existing schema. Matches the JPA / Hibernate semantics where an
  `@OneToOne` FK must be injective (otherwise the "one" side of the
  relation is not actually single-valued).

### Mongo dialect

- **FK fields accept UUID strings in addition to native `ObjectId`.**
  `buildMongooseSchema` now declares FK refs as `Schema.Types.Mixed` rather
  than `Schema.Types.ObjectId`. Replicated documents originating from a
  SQL dialect (SQLite / Postgres / … using UUID primary keys) are no longer
  rejected by Mongoose path validation. A native Mongo app writing proper
  `ObjectId` refs keeps working unchanged.
- **`findAll()` / `findOne()` fall back to `{ id: fkValue }` when `populate()`
  returns `null`.** When a UUID-string FK cannot be resolved through the
  default Mongoose `_id` lookup (which expects matching type), the dialect
  keeps a raw `lean()` query alongside the populated one and patches the
  missing refs post-hoc by a direct `findOne({ id: fk })` on the target
  collection. Transparent to the caller, prevented silent data loss during
  cross-dialect reads.

Together, these four items unblock bidirectional SQL ↔ Mongo sync through
[@mostajs/replicator](https://www.npmjs.com/package/@mostajs/replicator).

## Multiple simultaneous connections

```typescript
import { createIsolatedDialect, registerNamedConnection, getNamedConnection } from '@mostajs/orm'

const oracle = await createIsolatedDialect({ dialect: 'oracle', uri: '...' }, [UserSchema])
const mongo  = await createIsolatedDialect({ dialect: 'mongodb', uri: '...' }, [AuditLogSchema])
registerNamedConnection('audit', mongo)

// Later, anywhere in the codebase :
const conn = getNamedConnection('audit')
```

## Ecosystem

| Package | Description |
|---|---|
| [@mostajs/orm-bridge](https://www.npmjs.com/package/@mostajs/orm-bridge) | Keep your Prisma code, run it on any of the 13 databases (`createPrismaLikeDb()` is a drop-in replacement for `new PrismaClient()`). |
| [@mostajs/orm-cli](https://www.npmjs.com/package/@mostajs/orm-cli) | `npx @mostajs/orm-cli` — interactive CLI : convert schemas, init databases, scaffold services, replicator + monitor, seeding, bootstrap Prisma migration. |
| [@mostajs/orm-adapter](https://www.npmjs.com/package/@mostajs/orm-adapter) | Convert Prisma / JSON Schema / OpenAPI / native `.mjs` to `EntitySchema[]` (bidirectional). |
| [@mostajs/replicator](https://www.npmjs.com/package/@mostajs/replicator) | Cross-dialect replication : CQRS master/slave, CDC rules (snapshot + incremental), wildcard `*`, failover (`promoteToMaster`). As of @mostajs/orm v1.13, Mongo FK columns accept UUID strings coming from SQL dialects (populate falls back to `{ id: uuid }` lookup). |
| [@mostajs/orm-copy-data](https://www.npmjs.com/package/@mostajs/orm-copy-data) | Cross-dialect data copy : 1 source (DB / CSV / JSON / SQL dump) → N destinations. Backup, migration, seeding. CLI (`mostajs-copy`) + API. Cron-ready. |
| [@mostajs/replica-monitor](https://www.npmjs.com/package/@mostajs/replica-monitor) | Live web dashboard — replicas status, CDC stats, activity stream. Zero DB connections (reads tree + stats files). |
| [@mostajs/media](https://www.npmjs.com/package/@mostajs/media) | Screen capture + video editor (split, speed, stickers, subtitles) + server-side ffmpeg export + project persistence (ORM + SQLite). |
| [@mostajs/config](https://www.npmjs.com/package/@mostajs/config) | Env loader with `MOSTA_ENV` profile cascade (Spring-Boot-style). Used by orm/auth/payment/music. |

## Design inspirations

`@mostajs/orm` draws from three decades of mature ORM engineering in the
Java ecosystem, adapted to the TypeScript / Node.js runtime :

| Borrowed concept | Source | @mostajs/orm equivalent |
|---|---|---|
| `SessionFactory` / `EntityManagerFactory` | [Hibernate](https://hibernate.org/orm/documentation/) · [JPA](https://jakarta.ee/specifications/persistence/) | `getDialect()` returning a cached singleton |
| Entity metadata (annotations / XML) | Hibernate, [JPA `@Entity`](https://jakarta.ee/specifications/persistence/3.1/apidocs/jakarta.persistence/jakarta/persistence/entity) | `EntitySchema` — declarative TypeScript schema |
| `@OneToMany` / `@ManyToOne` / `@OneToOne` / `@ManyToMany` | JPA | `relations: { ..., type: 'one-to-many' \| ... }` |
| `@JoinColumn`, `@JoinTable` | JPA | `joinColumn`, `through` |
| `CascadeType` / `FetchType` | JPA | `cascade`, `fetch` in `RelationDef` |
| Cascade types (`PERSIST`, `REMOVE`, `ALL`) | JPA | `cascade: ['persist', 'remove', 'all']` |
| Schema-generation strategies (`validate`, `update`, `create`, `create-drop`) | [Hibernate `hibernate.hbm2ddl.auto`](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#schema-generation) | `DB_SCHEMA_STRATEGY` (same names, same semantics) |
| Show-SQL / format-SQL / highlight-SQL | Hibernate (`hibernate.show_sql`, `hibernate.format_sql`) | `DB_SHOW_SQL`, `DB_FORMAT_SQL`, `DB_HIGHLIGHT_SQL` |
| `SAVEPOINT` for nested transactions | SQL standard, JPA spec | `beginTx()` inside `beginTx()` emits `SAVEPOINT` |
| Repository pattern | [Spring Data](https://spring.io/projects/spring-data) | `BaseRepository<T>` with typed CRUD |
| Profile-based configuration | [Spring Boot profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html) (`spring.profiles.active=test`) | `MOSTA_ENV=TEST` + `TEST_KEY=value` cascade (via `@mostajs/config`) |
| Environment-aware externalized config | [Spring Boot `application-${profile}.properties`](https://docs.spring.io/spring-boot/reference/features/external-config.html) | One `.env` with `${PROFILE}_${KEY}` overrides |

### Why borrow from the Java ecosystem ?

Hibernate (2001), JPA (2006, JSR 220), Spring Data (2008), Spring Boot (2014)
have collectively survived two decades of production workloads. Their
vocabulary and semantics are **industry defaults** : developers who have
worked with any of them recognize `@OneToMany`, `CascadeType.ALL`,
`spring.profiles.active`, `hibernate.hbm2ddl.auto=update`, `SAVEPOINT`,
etc. immediately. Reusing those names in `@mostajs/orm` cuts the learning
curve and avoids inventing a parallel dialect.

Further reading :

- Hibernate ORM — https://hibernate.org/orm/documentation/
- Jakarta Persistence (JPA) — https://jakarta.ee/specifications/persistence/
- Spring Framework — https://spring.io/projects/spring-framework
- Spring Data — https://spring.io/projects/spring-data
- Spring Boot profiles — https://docs.spring.io/spring-boot/reference/features/profiles.html
- Spring Boot externalized configuration — https://docs.spring.io/spring-boot/reference/features/external-config.html

## License

**AGPL-3.0-or-later** + commercial license available.

For closed-source commercial use : drmdh@msn.com

## Author

Dr Hamid MADANI <drmdh@msn.com>

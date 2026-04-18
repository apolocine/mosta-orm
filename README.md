# @mostajs/orm

> **Plug & Play ORM to Drive 13 Databases at Once**

[![npm version](https://img.shields.io/npm/v/@mostajs/orm.svg)](https://www.npmjs.com/package/@mostajs/orm)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)

Hibernate-inspired multi-dialect ORM for Node.js/TypeScript — one API, **13 databases**, zero lock-in, bundler-friendly.

## Databases

SQLite · PostgreSQL · MySQL · MariaDB · MongoDB · Oracle · SQL Server · CockroachDB · DB2 · SAP HANA · HSQLDB · Spanner · Sybase

---

## Demos

### 1. Initialize the app

https://github.com/user-attachments/assets/8f8b363e-4cc9-4b74-b1c8-d9c83b362327

### 2. Initialize the database

https://github.com/user-attachments/assets/e96a303b-f14c-4d90-a014-ccc342f071e5

### 3. Configure the app

https://github.com/user-attachments/assets/5a344a63-f1a5-426a-96d2-11f8816c2f53

### 4. Setup replication

https://github.com/user-attachments/assets/201f4a35-0c21-45d7-8df5-0554c68a2b5b

### 5. CDC rules & live sync

https://github.com/user-attachments/assets/d30674c1-4379-46c8-95f3-8f0f4b883df1

### 6. Frontend CRUD app

https://github.com/user-attachments/assets/9f78ee1b-ac9a-4d5e-ae91-1ec203e31447

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

The dialect matching `DB_DIALECT` is **lazy-loaded at runtime** (v1.9.3+). Only the driver you actually use is evaluated — no other dialect module enters your bundle. This is what makes @mostajs/orm safe to pull into a Next.js / Vite / SvelteKit project without bundler workarounds.

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
| [@mostajs/replicator](https://www.npmjs.com/package/@mostajs/replicator) | Cross-dialect replication : CQRS master/slave, CDC rules (snapshot + incremental), wildcard `*`, failover (`promoteToMaster`). |
| [@mostajs/replica-monitor](https://www.npmjs.com/package/@mostajs/replica-monitor) | Live web dashboard — replicas status, CDC stats, activity stream. Zero DB connections (reads tree + stats files). |
| [@mostajs/media](https://www.npmjs.com/package/@mostajs/media) | Screen capture + video editor (split, speed, stickers, subtitles) + server-side ffmpeg export + project persistence (ORM + SQLite). |

## License

**AGPL-3.0-or-later** + commercial license available.

For closed-source commercial use : drmdh@msn.com

## Author

Dr Hamid MADANI <drmdh@msn.com>

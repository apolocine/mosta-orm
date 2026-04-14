# @mostajs/orm

> **Hibernate-inspired multi-dialect ORM for Node.js/TypeScript** — one API, **13 databases**, zero lock-in, bundler-friendly.

[![npm version](https://img.shields.io/npm/v/@mostajs/orm.svg)](https://www.npmjs.com/package/@mostajs/orm)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)

## Databases

SQLite · PostgreSQL · MySQL · MariaDB · MongoDB · Oracle · SQL Server · CockroachDB · DB2 · SAP HANA · HSQLDB · Spanner · Sybase

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

- **[@mostajs/orm-bridge](https://www.npmjs.com/package/@mostajs/orm-bridge)** — keep your Prisma code, run it on any of the 13 databases (`createPrismaLikeDb()` is a drop-in replacement for `new PrismaClient()`).
- **[@mostajs/orm-cli](https://www.npmjs.com/package/@mostajs/orm-cli)** — `npx @mostajs/orm-cli bootstrap` migrates a Prisma project automatically (codemod + install + convert + DDL).
- **[@mostajs/orm-adapter](https://www.npmjs.com/package/@mostajs/orm-adapter)** — convert Prisma / JSON Schema / OpenAPI to `EntitySchema[]`.

## License

**AGPL-3.0-or-later** + commercial license available.

For closed-source commercial use : drmdh@msn.com

## Author

Dr Hamid MADANI <drmdh@msn.com>

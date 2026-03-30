# @mostajs/orm

> Multi-dialect ORM for Node.js/TypeScript — One API, 13 databases, zero lock-in.
> Author: Dr Hamid MADANI drmdh@msn.com

## Databases

SQLite | PostgreSQL | MySQL | MariaDB | MongoDB | Oracle | SQL Server | CockroachDB | DB2 | SAP HANA | HSQLDB | Spanner | Sybase

## Install

```bash
npm install @mostajs/orm
npm install better-sqlite3  # or pg, mysql2, mongoose, oracledb...
```

## How to Use

### 1. Define Schema

```typescript
const UserSchema = {
  name: 'User', collection: 'users', timestamps: true,
  fields: {
    email: { type: 'string', required: true, unique: true },
    name:  { type: 'string', required: true },
  },
  relations: { roles: { target: 'Role', type: 'many-to-many', through: 'user_roles' } },
  indexes: [{ fields: { email: 'asc' }, unique: true }],
}
```

### 2. Connect & CRUD

```typescript
import { registerSchemas, getDialect, BaseRepository } from '@mostajs/orm'

registerSchemas([UserSchema])
const dialect = await getDialect() // reads DB_DIALECT + SGBD_URI from .env
const repo = new BaseRepository(UserSchema, dialect)

await repo.create({ email: 'a@b.com', name: 'Admin' })
await repo.findOne({ email: 'a@b.com' })
await repo.findAll({}, { sort: { name: 1 }, limit: 10 })
await repo.update(id, { name: 'Updated' })
await repo.delete(id)
await repo.findByIdWithRelations(id, ['roles'])
await repo.upsert({ email: 'a@b.com' }, { name: 'Upserted' })
await repo.count({ status: 'active' })
```

### 3. Schema Management

```typescript
await dialect.truncateTable?.('users')        // empty data, keep structure
await dialect.truncateAll?.(getAllSchemas())   // empty all registered tables
await dialect.dropTable?.('users')            // drop one table
await dialect.dropSchema?.(getAllSchemas())    // drop registered + junction tables
await dialect.dropAllTables?.()               // drop ALL tables in database
```

### 4. EntityService (for @mostajs/net)

```typescript
import { EntityService } from '@mostajs/orm'
const service = new EntityService(dialect)
const res = await service.execute({
  op: 'findAll', entity: 'User',
  filter: { status: 'active' },
  relations: ['roles'],
  options: { limit: 10 },
})
```

Operations: findAll, findOne, findById, create, update, delete, deleteMany, count, search, aggregate, upsert, updateMany, addToSet, pull, increment

### 5. Environment

```bash
DB_DIALECT=postgres
SGBD_URI=postgresql://user:pass@localhost:5432/mydb
DB_SCHEMA_STRATEGY=update  # validate | update | create | create-drop | none
DB_SHOW_SQL=true
```

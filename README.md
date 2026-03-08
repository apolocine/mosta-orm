# MostaORM

> **Multi-dialect ORM for Node.js/TypeScript** — inspired by Hibernate.
> One API. 13 databases. Zero lock-in.

[![npm version](https://img.shields.io/npm/v/@mostajs/orm.svg)](https://www.npmjs.com/package/@mostajs/orm)
[![license](https://img.shields.io/npm/l/@mostajs/orm.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@mostajs/orm.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)

---

## What is MostaORM?

MostaORM brings the **Hibernate philosophy** to Node.js: define your entities once as schemas, then switch databases without touching your application code. It provides a clean, type-safe **Repository pattern** on top of 13 database backends.

```
Your app code  →  BaseRepository<T>  →  IDialect  →  MongoDB / SQLite / PostgreSQL / ...
```

No code change required when switching from SQLite (development) to PostgreSQL (production) to MongoDB (cloud).

---

## Features

- **13 database dialects** — MongoDB, SQLite, PostgreSQL, MySQL, MariaDB, Oracle, SQL Server, CockroachDB, IBM DB2, SAP HANA, HyperSQL, Google Spanner, Sybase ASE
- **Single unified API** — `findAll()`, `findById()`, `create()`, `update()`, `delete()`, `aggregate()`, and more
- **Repository pattern** — extend `BaseRepository<T>` to add custom methods
- **Hibernate-style schema definition** — declare fields, relations, indexes in one `EntitySchema`
- **Relations support** — one-to-one, many-to-one, one-to-many, many-to-many with `populate()`
- **Aggregation pipeline** — `$match`, `$group`, `$sort`, `$limit` translated per dialect
- **Schema strategies** — `validate`, `update`, `create`, `create-drop`
- **Lazy dialect loading** — only the driver for your active database is loaded
- **Full TypeScript** — generics, strict types, complete `.d.ts` declarations
- **Zero boilerplate** — one `createConnection()` call to configure everything

---

## Supported Databases

| Dialect | Package | Status |
|---------|---------|--------|
| **MongoDB** | `mongoose` | ✅ Production |
| **SQLite** | `better-sqlite3` | ✅ Production |
| **PostgreSQL** | `pg` | ✅ Production |
| **MySQL** | `mysql2` | ✅ Production |
| **MariaDB** | `mariadb` | ✅ Production |
| **Oracle Database** | `oracledb` | ✅ Production |
| **SQL Server** | `mssql` | ✅ Production |
| **CockroachDB** | `pg` | ✅ Production |
| **IBM DB2** | `ibm_db` | ✅ Production |
| **SAP HANA** | `@sap/hana-client` | ✅ Production |
| **HyperSQL (HSQLDB)** | HTTP bridge | ✅ Production |
| **Google Cloud Spanner** | `@google-cloud/spanner` | ✅ Production |
| **Sybase ASE** | `mssql` | ✅ Production |

---

## Installation

Install the core package:

```bash
npm install @mostajs/orm
```


Install **only the driver(s)** you need:

```bash
# SQLite
npm install better-sqlite3

# PostgreSQL
npm install pg

# MongoDB
npm install mongoose

# MySQL / MariaDB
npm install mysql2
npm install mariadb

# Others
npm install oracledb        # Oracle
npm install mssql           # SQL Server, Sybase
npm install ibm_db          # IBM DB2
npm install @sap/hana-client  # SAP HANA
npm install @google-cloud/spanner  # Google Spanner
```

---

## Quick Start — 5 minutes

### 1. Define your Entity Schema

```typescript
// src/schemas/user.schema.ts
import type { EntitySchema } from '@mostajs/orm'

export const UserSchema: EntitySchema = {
  name: 'User',
  collection: 'users',       // table name in SQL, collection name in MongoDB
  timestamps: true,          // auto createdAt / updatedAt
  fields: {
    email:     { type: 'string', required: true, unique: true, lowercase: true },
    username:  { type: 'string', required: true, unique: true },
    password:  { type: 'string', required: true },
    role:      { type: 'string', enum: ['user', 'admin'], default: 'user' },
    status:    { type: 'string', enum: ['active', 'banned'], default: 'active' },
    lastLogin: { type: 'date' },
    score:     { type: 'number', default: 0 },
  },
  relations: {},
  indexes: [
    { fields: { email: 'asc' }, unique: true },
    { fields: { role: 'asc' } },
  ],
}
```

### 2. Create a Repository

```typescript
// src/repositories/user.repository.ts
import { BaseRepository } from '@mostajs/orm'
import type { IDialect } from '@mostajs/orm'
import { UserSchema } from '../schemas/user.schema.js'

export interface UserDTO {
  id: string
  email: string
  username: string
  role: string
  status: string
  createdAt: string
}

export class UserRepository extends BaseRepository<UserDTO> {
  constructor(dialect: IDialect) {
    super(UserSchema, dialect)
  }

  // Custom method — uses built-in findOne()
  async findByEmail(email: string): Promise<UserDTO | null> {
    return this.findOne({ email: email.toLowerCase() })
  }

  async findAdmins(): Promise<UserDTO[]> {
    return this.findAll({ role: 'admin' }, { sort: { createdAt: -1 } })
  }

  async countActive(): Promise<number> {
    return this.count({ status: 'active' })
  }
}
```

### 3. Connect and Use

```typescript
// src/index.ts
import { createConnection, registerSchema } from '@mostajs/orm'
import { UserSchema } from './schemas/user.schema.js'
import { UserRepository } from './repositories/user.repository.js'

// Register all schemas
registerSchema(UserSchema)

// Connect — reads DB_DIALECT and SGBD_URI from environment
const dialect = await createConnection()

// Create a repository instance
const userRepo = new UserRepository(dialect)

// --- CRUD Operations ---

// Create
const user = await userRepo.create({
  email: 'alice@example.com',
  username: 'alice',
  password: 'hashed_password',
})
console.log(user.id) // auto-generated ID

// Find
const found = await userRepo.findByEmail('alice@example.com')
const allAdmins = await userRepo.findAdmins()
const activeCount = await userRepo.countActive()

// Update
const updated = await userRepo.update(user.id, { role: 'admin' })

// Delete
const deleted = await userRepo.delete(user.id)

console.log('Done!')
```

### 4. Configure your database (env vars)

```bash
# .env

# SQLite (development)
DB_DIALECT=sqlite
SGBD_URI=./myapp.db

# PostgreSQL (production)
DB_DIALECT=postgres
SGBD_URI=postgresql://user:password@localhost:5432/mydb

# MongoDB (cloud)
DB_DIALECT=mongodb
SGBD_URI=mongodb+srv://user:password@cluster.mongodb.net/mydb

# MySQL
DB_DIALECT=mysql
SGBD_URI=mysql://user:password@localhost:3306/mydb
```

---

## Core API Reference

### Connection

```typescript
import { createConnection, registerSchema, registerSchemas } from '@mostajs/orm'

// Register schemas before connecting
registerSchema(UserSchema)
registerSchemas([UserSchema, PostSchema, CommentSchema])

// Connect (reads from environment)
const dialect = await createConnection()

// Or pass config directly
const dialect = await createConnection({
  dialect: 'postgres',
  uri: 'postgresql://localhost/mydb',
  schemaStrategy: 'update',  // validate | update | create | create-drop
  showSQL: false,
})
```

### BaseRepository\<T\> — All Methods

```typescript
// ── READ ────────────────────────────────────────────────────────────────────

// Get all records (with optional filter & options)
findAll(filter?: FilterQuery, options?: QueryOptions): Promise<T[]>

// Get one record by filter
findOne(filter: FilterQuery, options?: QueryOptions): Promise<T | null>

// Get by ID
findById(id: string, options?: QueryOptions): Promise<T | null>

// Get by ID with related entities populated
findByIdWithRelations(id: string, relations?: string[], options?): Promise<T | null>

// Get all with relations
findWithRelations(filter?, relations?, options?): Promise<T[]>

// ── WRITE ────────────────────────────────────────────────────────────────────

// Create a new record
create(data: Partial<T>): Promise<T>

// Update one record by ID (partial)
update(id: string, data: Partial<T>): Promise<T | null>

// Update many records matching filter
updateMany(filter: FilterQuery, data: Partial<T>): Promise<number>

// Delete one record by ID
delete(id: string): Promise<boolean>

// Delete many records matching filter
deleteMany(filter: FilterQuery): Promise<number>

// Create or update (upsert)
upsert(filter: FilterQuery, data: Partial<T>): Promise<T>

// ── QUERY ────────────────────────────────────────────────────────────────────

// Count matching records
count(filter?: FilterQuery): Promise<number>

// Get distinct values of a field
distinct(field: string, filter?: FilterQuery): Promise<unknown[]>

// Full-text search across string fields
search(query: string, options?: QueryOptions): Promise<T[]>

// ── ATOMIC ───────────────────────────────────────────────────────────────────

// Increment a numeric field
increment(id: string, field: string, amount?: number): Promise<T | null>

// Add value to array field (no duplicates)
addToSet(id: string, field: string, value: unknown): Promise<T | null>

// Remove value from array field
pull(id: string, field: string, value: unknown): Promise<T | null>

// ── AGGREGATE ────────────────────────────────────────────────────────────────

// Aggregation pipeline
aggregate<R>(stages: AggregateStage[]): Promise<R[]>
```

### FilterQuery — Operators

```typescript
// Equality (shorthand)
findAll({ status: 'active' })
findAll({ role: 'admin', status: 'active' })

// Comparison operators
findAll({ score: { $gt: 100 } })
findAll({ score: { $gte: 0, $lte: 1000 } })
findAll({ age:   { $lt: 18 } })
findAll({ name:  { $ne: 'anonymous' } })

// Array membership
findAll({ status: { $in: ['active', 'pending'] } })
findAll({ role:   { $nin: ['banned', 'deleted'] } })

// Existence
findAll({ photo: { $exists: true } })
findAll({ deletedAt: { $exists: false } })

// Regex
findAll({ email: { $regex: '@gmail\\.com$' } })
findAll({ name:  { $regex: 'alice', $options: 'i' } })  // case-insensitive

// Logical
findAll({ $or:  [{ role: 'admin' }, { score: { $gt: 9000 } }] })
findAll({ $and: [{ status: 'active' }, { score: { $gte: 100 } }] })
```

### QueryOptions

```typescript
findAll(filter, {
  sort:    { createdAt: -1, name: 1 },   // -1 = DESC, 1 = ASC
  skip:    0,
  limit:   20,
  select:  ['id', 'email', 'role'],      // include only these fields
  exclude: ['password', '__v'],          // exclude these fields
})
```

### EntitySchema Definition

```typescript
const PostSchema: EntitySchema = {
  name: 'Post',
  collection: 'posts',
  timestamps: true,

  fields: {
    title:     { type: 'string',  required: true },
    slug:      { type: 'string',  required: true, unique: true },
    body:      { type: 'string',  required: true },
    status:    { type: 'string',  enum: ['draft', 'published'], default: 'draft' },
    views:     { type: 'number',  default: 0 },
    published: { type: 'boolean', default: false },
    tags:      { type: 'array' },
    metadata:  { type: 'json' },
    publishedAt: { type: 'date' },
  },

  relations: {
    author:   { target: 'User', type: 'many-to-one', required: true },
    comments: { target: 'Comment', type: 'one-to-many' },
    likes:    { target: 'User', type: 'many-to-many', through: 'post_likes' },
  },

  indexes: [
    { fields: { slug: 'asc' }, unique: true },
    { fields: { status: 'asc', publishedAt: -1 } },
    { fields: { author: 'asc' } },
  ],
}
```

### Field Types

| Type | SQL | MongoDB | Description |
|------|-----|---------|-------------|
| `string` | TEXT / VARCHAR | String | Text values |
| `number` | REAL / DOUBLE | Number | Integer or float |
| `boolean` | INTEGER(0/1) | Boolean | True/false |
| `date` | TEXT (ISO) | Date | Datetime values |
| `json` | TEXT (JSON) | Mixed | Arbitrary object |
| `array` | TEXT (JSON) | Array | List of values |

### Aggregation Pipeline

```typescript
// Count users by role
const stats = await userRepo.aggregate<{ role: string; count: number }>([
  { $match: { status: 'active' } },
  { $group: { _by: 'role', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
])
// → [{ role: 'admin', count: 5 }, { role: 'user', count: 142 }]

// Sum revenue by month
const revenue = await orderRepo.aggregate([
  { $match: { status: 'paid' } },
  { $group: { _by: 'month', total: { $sum: 'amount' } } },
])

// Top 10 most viewed posts
const top = await postRepo.aggregate([
  { $match: { status: 'published' } },
  { $sort: { views: -1 } },
  { $limit: 10 },
])
```

---

## Relations

```typescript
// Schema with relations
const OrderSchema: EntitySchema = {
  name: 'Order',
  collection: 'orders',
  timestamps: true,
  fields: {
    total:  { type: 'number', required: true },
    status: { type: 'string', default: 'pending' },
  },
  relations: {
    customer: { target: 'User',    type: 'many-to-one', required: true },
    items:    { target: 'Product', type: 'many-to-many', through: 'order_items' },
  },
  indexes: [],
}

// Populate relations
const order = await orderRepo.findByIdWithRelations(orderId, ['customer', 'items'])
// → { id, total, status, customer: { id, email, ... }, items: [{ id, name, price }] }

// Filter with relations
const orders = await orderRepo.findWithRelations(
  { status: 'pending' },
  ['customer'],
  { sort: { createdAt: -1 }, limit: 50 }
)
```

---

## Schema Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `validate` | Checks tables/collections exist, throws if missing | Production safety |
| `update` | Creates missing tables/indexes, preserves data | Recommended for dev |
| `create` | Creates tables if not exist | First run |
| `create-drop` | Drops and recreates all tables | Testing only |
| `none` | No schema management | External migrations |

```bash
DB_SCHEMA_STRATEGY=update  # in .env
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_DIALECT` | — | Required: `mongodb`, `sqlite`, `postgres`, `mysql`, etc. |
| `SGBD_URI` | — | Required: connection string |
| `DB_SCHEMA_STRATEGY` | `update` | Schema management strategy |
| `DB_SHOW_SQL` | `false` | Log all SQL queries |
| `DB_FORMAT_SQL` | `false` | Pretty-print SQL logs |
| `DB_POOL_SIZE` | `10` | Connection pool size (SQL dialects) |
| `DB_CACHE_ENABLED` | `false` | Query result cache |
| `DB_CACHE_TTL` | `300` | Cache TTL in seconds |

| `MOSTA_BRIDGE_AUTOSTART` | `true` | JDBC bridge auto-start: `true`, `false`, `detect` |
| `MOSTA_BRIDGE_PORT_BASE` | `8765` | First bridge HTTP port |
| `MOSTA_BRIDGE_PORT_INCREMENT` | `true` | Auto-increment ports for multiple bridges |
| `MOSTA_JAR_DIR` | auto-detect | Directory for JDBC JAR files |
| `MOSTA_BRIDGE_JAVA` | auto-detect | Path to MostaJdbcBridge.java |
| `MOSTA_BRIDGE_MAX_RETRIES` | `3` | Max bridge start attempts before giving up |
| `MOSTA_BRIDGE_TIMEOUT` | `15000` | Bridge health check timeout (ms) |

---

## JDBC Bridge & JAR Upload

MostaORM includes a universal JDBC bridge for databases without npm drivers (HyperSQL, Oracle, DB2, SAP HANA, Sybase). The bridge is a Java HTTP server (`MostaJdbcBridge.java`) that translates HTTP requests into JDBC calls.

### JAR Management API

MostaORM exports functions for managing JDBC driver JARs:

```typescript
import {
  saveJarFile,      // Save an uploaded JAR to jar_files/
  deleteJarFile,    // Delete a JAR from jar_files/
  listJarFiles,     // List all JARs with dialect detection
  getJdbcDialectStatus,  // Status of each JDBC dialect (JAR present?)
  detectDialectFromJar,  // Detect dialect from JAR filename
} from '@mostajs/orm'
```

### Next.js Route (via @mostajs/setup)

```typescript
// src/app/api/setup/upload-jar/route.ts
import { createUploadJarHandlers } from '@mostajs/setup/api/upload-jar'

const { GET, POST, DELETE } = createUploadJarHandlers()
export { GET, POST, DELETE }
```

- **GET** — list JARs and JDBC dialect status
- **POST** — upload a `.jar` file (multipart/form-data, field `jar`)
- **DELETE** — remove a JAR (`{ "fileName": "hsqldb-2.7.2.jar" }`)

### BridgeManager (multi-bridge)

```typescript
import { BridgeManager } from '@mostajs/orm'

const manager = BridgeManager.getInstance()
// Bridges are managed automatically by the dialect's connect()
// Multiple bridges can run simultaneously on incrementing ports
```

---

## Complete Example — Blog API

See the [full tutorial](docs/tutorial.md) for a step-by-step walkthrough building a complete blog REST API with authentication, pagination, and relations.

---

## Architecture

```
mosta-orm/
├── src/
│   ├── index.ts                      ← Main export
│   ├── core/
│   │   ├── types.ts                  ← Interfaces & types
│   │   ├── base-repository.ts        ← Generic repository
│   │   ├── factory.ts                ← Connection factory
│   │   ├── registry.ts               ← Schema registry
│   │   ├── normalizer.ts             ← _id → id normalization
│   │   ├── errors.ts                 ← Custom error classes
│   │   └── config.ts                 ← Dialect metadata
│   └── dialects/
│       ├── abstract-sql.dialect.ts   ← Shared SQL logic
│       ├── mongo.dialect.ts
│       ├── sqlite.dialect.ts
│       ├── postgres.dialect.ts
│       ├── mysql.dialect.ts
│       └── ...
```

---

## Why MostaORM?

| | Prisma | TypeORM | Sequelize | **MostaORM** |
|---|---|---|---|---|
| Databases | 6 | 9 | 6 | **13** |
| MongoDB | ✅ | ✅ | ❌ | ✅ |
| Oracle | ❌ | ✅ | ✅ | ✅ |
| SAP HANA | ❌ | ❌ | ❌ | ✅ |
| Google Spanner | ❌ | ❌ | ❌ | ✅ |
| Repository pattern | ❌ | ✅ | ❌ | ✅ |
| No code-gen needed | ❌ | ✅ | ✅ | ✅ |
| Dialect switching | ❌ | ⚠️ | ⚠️ | ✅ |
| Lazy driver loading | ❌ | ❌ | ❌ | ✅ |

---

## License

MIT — © 2025 Dr Hamid MADANI <drmdh@msn.com>

## Contributing

Issues and PRs are welcome at [github.com/apolocine/mosta-orm](https://github.com/apolocine/mosta-orm).

# @mostajs/orm

> **Plug & Play ORM to Drive 19 Databases at Once**

[![npm version](https://img.shields.io/npm/v/@mostajs/orm.svg)](https://www.npmjs.com/package/@mostajs/orm)
[![npm downloads](https://img.shields.io/npm/dm/@mostajs/orm.svg)](https://www.npmjs.com/package/@mostajs/orm)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![databases](https://img.shields.io/badge/databases-19-success.svg)](#databases)
[![Types: TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@mostajs/orm)](https://bundlephobia.com/package/@mostajs/orm)

Hibernate-inspired multi-dialect ORM for Node.js & TypeScript — **one API, 19 databases, zero lock-in, bundler-friendly**.

📦 **npm** · https://www.npmjs.com/package/@mostajs/orm
🐙 **GitHub** · https://github.com/apolocine/mosta-orm
📚 **Docs** · *(coming soon)*
🚀 **Product Hunt** · *(launch link to be added)*

🎓 **Runnable samples** · [`@mostajs/orm-samples`](https://github.com/apolocine/mosta-orm-samples) — copy-paste install per feature, covering 100% of this package's public API.

```bash
npx @mostajs/orm-samples list                       # browse available samples
npx @mostajs/orm-samples scaffold 01-quickstart-sqlite ~/my-app
cd ~/my-app && ./01-quickstart-sqlite.sh            # runnable in 30 seconds
```

---

## Why @mostajs/orm ?

- 🎯 **One API, 19 databases** *(21 dialect implementations — `sql.js` & `pglite` are WASM variants of SQLite & PostgreSQL).* Switch from PostgreSQL to MongoDB to Firestore to SQLite without rewriting a single repository call.
- 🪶 **Zero lock-in.** Native drivers, no proprietary query DSL — your SQL/NoSQL stays portable.
- 🧬 **Hibernate / JPA semantics.** `@OneToMany`, cascade types, `SAVEPOINT`, schema strategies (`validate`/`update`/`create`/`create-drop`) — concepts battle-tested for 25 years, ported to TypeScript.
- 🌉 **Drop-in Prisma replacement.** [`@mostajs/orm-bridge`](https://www.npmjs.com/package/@mostajs/orm-bridge) lets you keep your Prisma code while running on any of 19 databases.
- 🔁 **Cross-dialect replication built-in.** [`@mostajs/replicator`](https://www.npmjs.com/package/@mostajs/replicator) — CDC + master/slave + failover across SQL ↔ MongoDB.
- 🧪 **Bundler-friendly.** Tree-shakable ESM, no `eval`, works with esbuild / Vite / Next.js / Bun out of the box.
- 🏷️ **Multi-app DB cohabitation** *(v2.3.0+)*. `DB_TABLE_PREFIX` à la Hibernate `physical_naming_strategy` — let two apps share one Oracle/MSSQL/HANA DB user without colliding on `users`/`roles`/`permissions`.

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

Need it to **run in the browser, Bolt.new / StackBlitz or Cloudflare Workers** ? Use the WASM dialect — **boots in the browser / Bolt.new / Cloudflare Workers with no native binary** :

```bash
npm install @mostajs/orm sql.js
```

```typescript
// `sqljs` = SQLite compiled to WebAssembly. No `.node` addon → works where
// better-sqlite3 can't load (browser, WebContainer, edge). Same API, same SQL.
const db = await getDialect({ dialect: 'sqljs', uri: ':memory:' }, [UserSchema])
```

## Starters — open in your browser

All boot **in your browser with no native binary**, on the first try, via the `sqljs` (SQLite WASM) dialect.

**🚀 Startup MVP starter** — a full foundation (**landing + auth + CRUD dashboard**, "rename & go") to launch a SaaS. Auth is powered by **[@mostajs/auth-lite](https://www.npmjs.com/package/@mostajs/auth-lite)** (email/password + sessions, no native addon):

[![Open in StackBlitz](https://img.shields.io/badge/Open_in-StackBlitz-1389FD?style=for-the-badge&logo=stackblitz)](https://stackblitz.com/github/apolocine/mostajs-saas-starter) [![Open in Bolt.new](https://img.shields.io/badge/Open_in-Bolt.new-000?style=for-the-badge&logo=stackblitz)](https://bolt.new/github.com/apolocine/mostajs-saas-starter) [![Open in CodeSandbox](https://img.shields.io/badge/Open_in-CodeSandbox-151515?style=for-the-badge&logo=codesandbox)](https://codesandbox.io/p/github/apolocine/mostajs-saas-starter)

**📊 Survey starter** — a customer-satisfaction survey (Next.js 15): landing, 5-question form, thank-you page & admin dashboard with bar charts. Rename & go:

[![Open in StackBlitz](https://img.shields.io/badge/Open_in-StackBlitz-1389FD?style=for-the-badge&logo=stackblitz)](https://stackblitz.com/github/apolocine/mostajs-survey-starter) [![Open in Bolt.new](https://img.shields.io/badge/Open_in-Bolt.new-000?style=for-the-badge&logo=stackblitz)](https://bolt.new/github.com/apolocine/mostajs-survey-starter) [![Open in CodeSandbox](https://img.shields.io/badge/Open_in-CodeSandbox-151515?style=for-the-badge&logo=codesandbox)](https://codesandbox.io/p/github/apolocine/mostajs-survey-starter)

Or a minimal **blog** (Users · Posts · Comments — relations, soft-delete, seeded data) across four frameworks:

| Starter | StackBlitz | Bolt.new | CodeSandbox |
|---|---|---|---|
| **Next.js 15** (App Router) | [![SB](https://img.shields.io/badge/Open-StackBlitz-1389FD?logo=stackblitz)](https://stackblitz.com/github/apolocine/nextjs-mostajs-orm-starter) | [![Bolt](https://img.shields.io/badge/Open-Bolt.new-000?logo=stackblitz)](https://bolt.new/github.com/apolocine/nextjs-mostajs-orm-starter) | [![CSB](https://img.shields.io/badge/Open-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/apolocine/nextjs-mostajs-orm-starter) |
| **Express** | [![SB](https://img.shields.io/badge/Open-StackBlitz-1389FD?logo=stackblitz)](https://stackblitz.com/github/apolocine/express-mostajs-orm-starter) | [![Bolt](https://img.shields.io/badge/Open-Bolt.new-000?logo=stackblitz)](https://bolt.new/github.com/apolocine/express-mostajs-orm-starter) | [![CSB](https://img.shields.io/badge/Open-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/apolocine/express-mostajs-orm-starter) |
| **Fastify** | [![SB](https://img.shields.io/badge/Open-StackBlitz-1389FD?logo=stackblitz)](https://stackblitz.com/github/apolocine/fastify-mostajs-orm-starter) | [![Bolt](https://img.shields.io/badge/Open-Bolt.new-000?logo=stackblitz)](https://bolt.new/github.com/apolocine/fastify-mostajs-orm-starter) | [![CSB](https://img.shields.io/badge/Open-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/apolocine/fastify-mostajs-orm-starter) |
| **Hono** (Node / edge) | [![SB](https://img.shields.io/badge/Open-StackBlitz-1389FD?logo=stackblitz)](https://stackblitz.com/github/apolocine/hono-mostajs-orm-starter) | [![Bolt](https://img.shields.io/badge/Open-Bolt.new-000?logo=stackblitz)](https://bolt.new/github.com/apolocine/hono-mostajs-orm-starter) | [![CSB](https://img.shields.io/badge/Open-CodeSandbox-151515?logo=codesandbox)](https://codesandbox.io/p/github/apolocine/hono-mostajs-orm-starter) |

**Tested E2E** — the 6 starters × 3 gen-AI WebContainers (June 2026, `@mostajs/orm@2.5.3`):

| Starter | StackBlitz | Bolt.new | CodeSandbox |
|---|:---:|:---:|:---:|
| **nextjs**-mostajs-orm-starter *(blog)* | ✅ | ⚠️ prod | ✅ |
| **express**-mostajs-orm-starter *(blog)* | ✅ | ✅ | ✅ |
| **fastify**-mostajs-orm-starter *(blog)* | ✅ | ✅ | ✅ |
| **hono**-mostajs-orm-starter *(blog)* | ✅ | ✅ | ✅ |
| **mostajs-saas**-starter *(SaaS, auth)* | ✅ | ⚠️ prod | ✅ |
| **mostajs-survey**-starter *(survey)* | ✅ | ⚠️ prod | ✅ |
| **Total** | **6/6** | **3/6** *(+3 Next en prod)* | **6/6** |

- ✅ = boot + full E2E scenario in `npm run dev`.
- ⚠️ prod = Bolt's runtime **doesn't run Next 15 in `dev`** (`Error: Method not implemented.` from Bolt's bundle, not the starter) → run the **Next** starters in **prod** there (`npm run build && npm run start`). The **server** starters (Express/Fastify/Hono) run on Bolt as-is.
- **StackBlitz** = reference (best for debugging — terminal shows logs). **CodeSandbox** serves a cross-site iframe → the SaaS auth uses `crossSiteCookie` (`sameSite=none; secure`) to keep sessions.

Working from an **AI dev tool** (Cursor, Cline, Claude…)? Generate schemas, lint them (24 rules) and produce migrations via the MCP server **[@mostajs/orm-mcp](https://www.npmjs.com/package/@mostajs/orm-mcp)** — hosted at `https://orm-mcp.amia.fr/mcp`.

> **End-to-end, in one folder** — sample [`18-mcp-to-running-app`](https://github.com/apolocine/mosta-orm-samples/tree/main/examples/18-mcp-to-running-app) walks the whole chain: `@mostajs/orm-mcp` generates the `EntitySchema`, `@mostajs/orm` applies them, and an e-commerce app (users/products/orders) runs on **`sqljs`** (SQLite WASM, zero native binary). Ships a scripted HTML proof report.

## How it compares

| | @mostajs/orm | Prisma | Drizzle | TypeORM |
|---|:---:|:---:|:---:|:---:|
| SQL dialects | **12** *(PG, MySQL, MariaDB, SQLite, MSSQL, Oracle, DB2, HANA, Cockroach, DuckDB, Firebird, ClickHouse…)* | 5 | 5 | 8 |
| NoSQL dialects | **MongoDB + Firestore + Redis native** | ❌ | ❌ | ❌ |
| Same API across SQL & NoSQL | ✅ | ❌ | ❌ | ❌ |
| Browser / WebContainer / edge | ✅ *(WASM `sqljs` — zero native binary)* | ⚠️ *(Accelerate, paid)* | ⚠️ *(driver)* | ❌ |
| Cross-dialect replication | ✅ *(via [@mostajs/replicator](https://www.npmjs.com/package/@mostajs/replicator))* | ❌ | ❌ | ❌ |
| Schema-as-code *(no DSL)* | ✅ TypeScript objects | DSL `.prisma` | TS objects | Decorators |
| Code generation step | ❌ *(zero codegen)* | ✅ required | ❌ | ❌ |
| Drop-in Prisma replacement | ✅ *(via [@mostajs/orm-bridge](https://www.npmjs.com/package/@mostajs/orm-bridge))* | — | ❌ | ❌ |
| Migration from Prisma | ✅ *(automated CLI)* | — | manual | manual |
| Hibernate / JPA semantics | ✅ | ❌ | ❌ | partial |
| License | AGPL-3.0 *(+ commercial)* | Apache-2.0 | Apache-2.0 | MIT |

> Numbers as of v1.13.1 — see [`@mostajs/orm-cli`](https://www.npmjs.com/package/@mostajs/orm-cli) for the automated Prisma → @mostajs migration tool.

## The relation lookup problem *(and how `@mostajs/orm@2.0` solves it)*

### The problem nobody talks about

Every ORM that auto-populates relations on read creates the **same silent bug class** :

```typescript
// `reg.project` is a M2O relation to Project
const reg = await regRepo.findById(regId)

// Eager mode (Hibernate ≤ JPA 2.x default, @mostajs/orm < 2.0) :
reg.project === project.id   // false — object vs string, ALWAYS
reg.project.id === project.id   // true if eager — explodes if lazy

// Lazy mode (Prisma, Drizzle, TypeORM 0.3+, SQLAlchemy default) :
reg.project === project.id   // true if same id — but reg.project.name throws
```

3 surfaces affected :
1. **Direct comparison** `entity.relation === id` — JS has no operator overloading.
2. **Property access** `entity.relation.someField` — assumes populated.
3. **Reuse in lookup** `findById(entity.relation)` — assumes string id.

The default eager/lazy choice forces every consumer to be defensive everywhere.

### How each ORM addresses it

| ORM | Default fetch | Polymorphic key lookup | Helper to normalize id | Documented as problem |
|---|---|---|---|---|
| **Hibernate** | EAGER *(historic JPA, anti-pattern)* | `EntityManager.find(Class, key)` accepts `EmbeddedId` | overridable `equals(Object o)` in Java | Yes — Vlad Mihalcea has 50+ blog posts on it |
| **Prisma** | LAZY *(opt-in `include`)* | `findUnique({ where })` accepts any unique field | ❌ none — `where: { id }` required | Partially — `findUnique` is the only escape |
| **Drizzle** | LAZY *(opt-in `with`)* | `query.x.findFirst({ where: eq(...) })` — verbose | ❌ none | No — relation queries are explicit only |
| **TypeORM ≥ 0.3** | LAZY *(opt-in `relations: ['rel']`)* | `findOneBy({ id })` only | ❌ none | No |
| **MikroORM** | LAZY *(opt-in `populate`)* | `findOne({ id })` only | `Reference<T>` proxy *(use `.id` accessor)* | Yes — Reference helper documented |
| **SQLAlchemy** | LAZY *(opt-in `joinedload`)* | `session.get(Cls, ident)` accepts tuple for composite | ❌ none in Python (no `==` overloading either) | Yes — community workarounds |
| **`@mostajs/orm@2.1`** | **LAZY** *(opt-in `fetch:'eager'`)* | **`findById()` polymorphe** *(string, `{id}`, natural key single or composite)* | **`extractRelId(value)`** helper | **Yes — explicitly documented + ORMConceptValidator R019/R020/R021 (livrés en 2.1.0)** |

### The `@mostajs/orm@2.0` 3-layer solution

#### Layer 1 — `lazy` by default

Aligns with Prisma / Drizzle / TypeORM 0.3+ / SQLAlchemy / MikroORM.
Eliminates 90% of accidental N+1 queries and type confusion.

```typescript
// Default — no surprise :
const reg = await regRepo.findById(regId)
typeof reg.project  // 'string' — the FK id
```

#### Layer 2 — Polymorphic `findById` with schema introspection

Inspired by JPA `EntityManager.find(Class, Object)` and Prisma `findUnique({ where })`.

```typescript
// String PK (legacy) — unchanged :
await projRepo.findById('abc-123')

// Object with `id` — natural for code that passes populated entities :
await projRepo.findById({ id: 'abc-123' })

// Natural key — schema unique index detected automatically :
await projRepo.findById({ slug: 'my-project' })

// Composite natural key :
await membershipRepo.findById({ tenantId: 't1', slug: 'admin' })
```

If the input is an object that matches neither `id` nor a unique index,
`OrmIntrospectionError` is thrown with the available fields and candidate
unique indexes listed — actionable error message.

#### Layer 3 — `extractRelId()` helper for direct comparisons

JS has no operator overloading. `obj === string` is always false. So we provide
the explicit normalizer :

```typescript
import { extractRelId } from '@mostajs/orm'

// Safe under both lazy AND eager :
if (extractRelId(reg.project) === project.id) {
  // ...
}
```

`extractRelId(value)` returns :
- `value` itself if string/number stringified
- `value.id` stringified if object with id
- `''` for null / undefined / object without id

### What `@mostajs/orm` does that no other JS/TS ORM does

| Capability | @mostajs/orm 2.0 | Others |
|---|:---:|:---:|
| Lazy default *(state of the art)* | ✅ | Prisma, Drizzle, TypeORM 0.3+, MikroORM, SQLAlchemy ✅ |
| Opt-in eager via schema flag | ✅ `fetch:'eager'` | TypeORM via `eager: true`. Others : per-query only. |
| **`findById` accepts string OR `{id}` OR natural key OR composite** | ✅ | **None** *(Prisma findUnique is closest but doesn't accept `{id}` object pass-through)* |
| **Public `extractRelId` helper for `===` comparisons** | ✅ | **None** *(MikroORM Reference is closest but requires API discipline)* |
| Validator rule auto-detects the trap *(R021-DIRECT-RELATION-COMPARISON, livré 2.1.0)* | ✅ via [ORMConceptValidator](#-ormconceptvalidator-v114) | None |
| Auto-fix the trap *(injects `extractRelId` import + wraps comparison)* | ⚠ V2 — diff suggéré fourni, application manuelle ou via plugin IDE | None |

### Benchmark — same code in 3 ORMs *(eager opt-in scenario)*

Scenario : compare a registration's project FK to a known project id, then re-fetch
the project. Eager loading enabled for performance reasons.

```typescript
// Prisma (eager not native — must include + spread) :
const reg = await prisma.registration.findUnique({
  where: { id }, include: { project: true }
})
if (reg.projectId === project.id) { /* hand-extract from FK field */ }
// re-fetch project : await prisma.project.findUnique({ where: { id: reg.projectId } })

// TypeORM 0.3+ (eager: true in @ManyToOne) :
const reg = await regRepo.findOne({ where: { id }, relations: ['project'] })
if (reg.project.id === project.id) { /* explicit .id needed */ }
// re-fetch project : redundant — reg.project is already loaded

// @mostajs/orm 2.0 (fetch:'eager' in schema) :
const reg = await regRepo.findById(id)
if (extractRelId(reg.project) === project.id) { /* safe under any default */ }
// re-fetch project : await projRepo.findById(reg.project)   ← introspection, works
```

Both `findById(reg.project)` and `extractRelId(reg.project)` work identically
whether the relation is lazy *(string)* or eager *(object)*. Consumer code
does NOT need to know the fetch mode.

→ **`@mostajs/orm` is the only JS/TS ORM where you can flip lazy ↔ eager via a
schema flag without rewriting consumer code.**

## Star · Sponsor · Contribute

If `@mostajs/orm` saves you days of glue code, please :

- ⭐ **Star** the repo — visibility helps me keep maintaining it.
- 💖 **Sponsor** development → [github.com/sponsors/apolocine](https://github.com/sponsors/apolocine)
- 🐛 Report issues / submit PRs — every contribution counts.
- ✉️ Commercial license & support : drmdh@msn.com

---

## Databases

SQLite · PostgreSQL · MySQL · MariaDB · MongoDB · Oracle · SQL Server · CockroachDB · DB2 · SAP HANA · HSQLDB · Spanner · Sybase · DuckDB · Firestore · Firebird · ClickHouse · Redis · Cassandra

> **19 databases · 21 dialect implementations.** The two extra dialects are **WASM variants** of databases already in the list — `sql.js` (SQLite WASM) and `pglite` (PostgreSQL WASM) — for the browser / WebContainer / edge. They are not separate engines, hence the **19 databases** headline.

- **`duckdb`** — OLAP **in-process** engine (file or `:memory:`), SQL ≈ PostgreSQL. Analytics without a server.
- **`firestore`** — Google Cloud **Firestore**, NoSQL document store (Mongo-style API). Remote (gRPC/TLS) or local **Java emulator** (no Docker, no key); production via a service-account key. Full-text search delegates to an external search module.
- **`firebird`** — **Firebird 3.0+** OLTP relational engine (InterBase lineage). Pure-JS `node-firebird` driver; `ROWS` pagination, UUID ids. Validated live against a native server.
- **`clickhouse`** — **ClickHouse** OLAP columnar engine (MergeTree, HTTP). Official `@clickhouse/client` driver. **Append/analytical scope**: `UPDATE`/`DELETE` are mutations (made synchronous), no PK/UNIQUE/FK. Validated live against a native server.
- **`redis`** — **Redis Stack** as a real-time document store (`ioredis`). Not a plain key-value cache here: entities are stored as native JSON with **RedisJSON** (`JSON.SET/GET`, atomic `JSON.NUMINCRBY`) and queried **server-side** with **RediSearch** (`FT.CREATE` per entity, `FT.SEARCH` translating `@mostajs` filters to TAG/NUMERIC/TEXT — O(log n), no key scan). Same `@mostajs/orm` API as MongoDB/Firestore.
- **`cassandra`** — Apache **Cassandra** wide-column engine (CQL). Official `cassandra-driver`. Query-first: `PRIMARY KEY` lookups, `ALLOW FILTERING` for non-key filters, native upsert, no JOIN/UNIQUE/FK. Validated live against a native node (Cassandra 4.1 needs Java 11).

> **Why Redis here?** Beyond MongoDB/Firestore, the `redis` dialect positions Redis as the **low-latency operational data layer** of the stack — live documents, sessions, queues, search and (via RedisTimeSeries) time-series — the substrate that **feeds the analytical / decision layers** of the ecosystem (e.g. operations-research workloads: assignment, queueing, forecasting). It stores, indexes and serves; it does not compute optima. Heavy aggregation stays delegated (`FT.AGGREGATE` / analytics module).

### Live validation

Every newly added dialect is validated end-to-end against a **real native engine** (no Docker)
with the shared `test-sgbd` harness. The same **20 checks** run on each dialect, across 8 phases.
Detail of the **20/20** run on **HSQLDB** (HyperSQL 2.7, via the JDBC bridge) — each check `1/1 ✅`:

| # | Phase | Test | HSQLDB |
|:--:|---|---|:--:|
| 1 | Connexion | `getDialect()` — connexion + singleton | 1/1 ✅ |
| 2 | Schéma | `BaseRepository(Category)` — schéma créé | 1/1 ✅ |
| 3 | Schéma | `BaseRepository(Product)` — schéma créé | 1/1 ✅ |
| 4 | Schéma | `BaseRepository(Order)` — schéma créé | 1/1 ✅ |
| 5 | Create | Category — create ×2 | 1/1 ✅ |
| 6 | Create | Product — create ×3 avec relation `category` | 1/1 ✅ |
| 7 | Create | Order — create ×2 avec relation `product` | 1/1 ✅ |
| 8 | Read | `findById()` | 1/1 ✅ |
| 9 | Read | `findOne({ slug })` | 1/1 ✅ |
| 10 | Read | `findAll()` | 1/1 ✅ |
| 11 | Read | `count()` | 1/1 ✅ |
| 12 | Read | `findAll({ status })` — filtré | 1/1 ✅ |
| 13 | Update | `update()` — modifier prix/stock/statut | 1/1 ✅ |
| 14 | Update | `upsert()` — créer si inexistant puis MAJ | 1/1 ✅ |
| 15 | Delete | `delete()` — supprimer un product | 1/1 ✅ |
| 16 | Avancé | create en masse (10 products) | 1/1 ✅ |
| 17 | Avancé | `findAll` filtré + `count` cohérent | 1/1 ✅ |
| 18 | Avancé | update en boucle + vérification | 1/1 ✅ |
| 19 | Avancé | Order avec relation product valide | 1/1 ✅ |
| 20 | Nettoyage | suppression de toutes les données de test | 1/1 ✅ |
| | | **Total** | **20/20 ✅** |

**17 dialects validated 20/20** against real engines (native servers on a Linux box, or local):

| Dialect | Engine | Result |
|---|---|:---:|
| **PostgreSQL** | `postgresql` (native) | **20/20** ✅ |
| **SQL Server** | `mssql-server` 2022 (native apt, no Docker) | **20/20** ✅ |
| **MySQL** | `mysqld` (native) | **20/20** ✅ |
| **MariaDB** | `mysqld` (native) | **20/20** ✅ |
| **Oracle XE** | `oracle-xe-21c` (native) | **20/20** ✅ |
| **CockroachDB** | `cockroachdb` (native) | **20/20** ✅ |
| **MongoDB** | `mongod` (native) | **20/20** ✅ |
| **Firebird** | `firebird3.0-server` (native) | **20/20** ✅ |
| **ClickHouse** | `clickhouse-server` (native) | **20/20** ✅ |
| **Redis** | `redis-stack-server` (RedisJSON+RediSearch) | **20/20** ✅ |
| **Cassandra** | `cassandra` 4.1 (CQL, native) | **20/20** ✅ |
| **Firestore** | Java emulator | **20/20** + **41/41** ✅ |
| **HSQLDB** | HyperSQL 2.7 (Java, JDBC bridge) | **20/20** ✅ |
| **DuckDB** | in-process | **20/20** ✅ |
| **SQLite** | `better-sqlite3` | **20/20** ✅ |
| **sqljs** | SQLite WASM (`sql.js`) | **20/20** ✅ |
| **pglite** | PostgreSQL WASM (`@electric-sql/pglite`) | **20/20** ✅ |

> **HSQLDB** runs through the transparent JDBC bridge (a Java `MostaJdbcBridge` process that
> loads `hsqldb*.jar` from `jar_files/` and speaks HTTP to the ORM) — same path that powers
> DB2 / SAP HANA / Sybase once their JDBC drivers are dropped in.
>
> **Pending** (code shipped, live validation requires extra infra): DB2 · SAP HANA · Sybase
> (JDBC bridge — driver JAR needed), Spanner (16 GB RAM emulator).

> Engine-specific quirks surfaced & fixed during live validation — Firebird: `boolean→SMALLINT`,
> `text/json→VARCHAR` (driver BLOB read hangs), Srp+wireCrypt auth; ClickHouse: `MergeTree`
> engine, typed params, `mutations_sync` for synchronous update/delete; Redis: `FT.SEARCH`
> filter translation, TAG escaping; Cassandra: `ALLOW FILTERING`, `WHERE 1=1` stripping, Java 11.
> Each run produces an HTML report (`test-scripts/sgbd-html-report.mjs`). Validation is done
> **one engine at a time** (stop current → start target) to fit a memory-constrained host.

**+ WASM runtimes** — two zero-binary dialects run in WebAssembly, so the same ORM **boots in the browser / Bolt.new / Cloudflare Workers with no native binary**:

- **`sqljs`** — SQLite in WASM (via `sql.js`). In-memory in the browser; file-backed on Node.
- **`pglite`** — PostgreSQL in WASM (via `@electric-sql/pglite`). In-memory, **`idb://` for durable in-browser storage (IndexedDB)**, or a directory on Node.

These are **not** new databases — they're zero-binary WASM runtimes of the SQLite/Postgres engines already listed, for environments where `better-sqlite3` / `pg` can't load.

### Local-first, offline & embedded

Because the WASM build needs **no native binary and no server**, the same typed API runs on constrained targets that can't compile or ship a native SQLite addon:

- **Local-first / offline / PWA apps with no backend** — a note-taking editor, an offline field tool, an in-browser playground.
- **Embedded & IoT** — **surveillance and agriculture drones**, **access-control gates and turnstiles**, **smartphones used as access badges**, and any device with a JS/WASM runtime.

> **Marketing angle:** *the only multi-dialect ORM that **runs in the browser** — and **persists there** (`pglite` with `uri: 'idb://…'`, IndexedDB) — today.* A real differentiator vs Prisma/Drizzle, claimed honestly: in-browser execution + durable storage ship now via `pglite`; for `sqljs`, browser persistence (IndexedDB/OPFS) is a planned opt-in (today it is in-memory in the browser, file-backed on Node).

### Use with AI dev tools

- **Bolt.new · StackBlitz · CodeSandbox** — open a `sqljs` starter by URL (`bolt.new/github.com/apolocine/nextjs-mostajs-orm-starter`); it boots with no native binary.
- **Cursor · Cline · Claude Code** — first-class schema/migration/validation tooling via the **`@mostajs/orm-mcp`** server — **live** in the official MCP Registry, hosted at `https://orm-mcp.amia.fr/mcp`. See the end-to-end sample [`18-mcp-to-running-app`](https://github.com/apolocine/mosta-orm-samples/tree/main/examples/18-mcp-to-running-app). Prefer plain codegen? Point them at [`llms.txt`](https://github.com/apolocine/mosta-orm/blob/main/llms.txt).

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
npm install better-sqlite3      # or: pg, mysql2, mongoose, oracledb, mssql, ibm_db, mariadb, @sap/hana-client, @google-cloud/spanner, duckdb, node-firebird, @clickhouse/client, ioredis, cassandra-driver
npm install @google-cloud/firestore # Firestore — NoSQL document store (dialect: 'firestore'); Java emulator in dev, GCP key in prod
npm install sql.js              # SQLite in the browser / Bolt.new / Workers — no native binary (dialect: 'sqljs')
npm install @electric-sql/pglite # PostgreSQL in the browser — idb:// persistence (dialect: 'pglite')
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

### Query options

```typescript
await repo.findAll(
  { status: 'active', role: { $in: ['admin', 'editor'] } },   // filter
  {
    sort: { createdAt: -1, name: 1 },                          // multi-field sort
    skip: 20, limit: 10,                                       // pagination
    select: ['id', 'email', 'name'],                           // projection
  },
)
```

`$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$regex`, `$exists` are all
supported uniformly across SQL & NoSQL dialects.

## Soft delete *(native)*

Set `softDelete: true` on a schema and `@mostajs/orm` handles everything :

```typescript
export const PostSchema: EntitySchema = {
  name: 'Post',
  collection: 'posts',
  timestamps: true,
  softDelete: true,                          // ← that's it
  fields: { title: { type: 'string' }, body: { type: 'string' } },
}
```

```typescript
await postRepo.delete(id)                    // sets deletedAt + isDeleted=true
await postRepo.findAll({})                   // excludes soft-deleted rows
await postRepo.findAll({}, { includeDeleted: true })  // include them
await postRepo.restore(id)                   // un-delete (clears deletedAt)
await postRepo.purge(id)                     // hard-delete, row removed for good
```

Works identically across SQL (column `deletedAt timestamp NULL`) and MongoDB
(field `deletedAt` indexed). No more home-rolled `deleted` flag mismatches —
the **R003-SOFT-DELETE-INCONSISTENT** validator rule will flag manual patterns
*(and auto-migrate them via `--fix R003`)*.

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

## Multi-app DB cohabitation — `DB_TABLE_PREFIX` *(v2.3.0+)*

Hibernate-style `physical_naming_strategy` for `@mostajs/orm`. Lets several
apps share one physical database without colliding on common names like
`users`, `roles`, `permissions`, etc. — particularly useful on
**Oracle / MSSQL / HANA** where the SQL schema is bound to the connection
user (so two apps using the same DB user otherwise silently share tables).

```bash
# .env
DB_TABLE_PREFIX=mp_
```

```ts
// or via API
await createConnection(
  { dialect: 'oracle', uri: '…', tablePrefix: 'mp_' },
  schemas,
)
```

What gets prefixed at runtime (the developer keeps writing
`collection: 'users'` everywhere — the prefix lives in the dialect layer) :

- `CREATE / DROP / ALTER TABLE`
- `CREATE INDEX`
- `FOREIGN KEY REFERENCES`
- Junction tables (`RelationDef.through`)
- `FROM / INSERT / UPDATE / DELETE`
- Mongo collection physical name (via `mongoose.model(name, schema, prefixed)`)

If `tablePrefix` is `undefined` or empty, behavior is strictly identical to
2.2.x — fully backward-compatible.

> ℹ️ **Relation name ≠ table name** — `findByIdWithRelations(id, ['roles'])`
> uses the **logical** relation name declared in `EntitySchema.relations.roles`.
> The physical join table comes from `RelationDef.through` (e.g.
> `'user_roles'`) and that name is the one prefixed (→ `mp_user_roles`). No
> physical table name is hard-coded anywhere in `@mostajs/*` libraries —
> everything routes through the schemas + the dialect's `getPrefixedName()`.

A runnable showcase of `DB_TABLE_PREFIX` lives in
[`@mostajs/orm-samples` sample 16 (`mosta-parkmanager`)](https://github.com/apolocine/mosta-orm-samples/tree/main/examples/16-mosta-parkmanager).

## Subpaths

| Subpath | When to use |
|---|---|
| `@mostajs/orm` | The core ORM API : `getDialect`, `registerSchemas`, `BaseRepository`, `EntityService`, schema types, `diffSchemas`, errors. |
| `@mostajs/orm/bridge` | **JDBC bridge** (v1.9.4+) : `JdbcNormalizer`, `BridgeManager`, `JDBC_REGISTRY`, jar upload. Pulled out of the root to keep `child_process` / `fs` spawn out of client bundles. |
| `@mostajs/orm/register` | Zero-code registration side-effect for dynamic schema loading. |
| **`@mostajs/orm/validator`** | **v1.14+ — ORMConceptValidator** : algorithmic linter for `EntitySchema` sets. Detects 18 conceptual anomalies (empty relations, FK naming inconsistency, soft-delete patterns, dead code, missing audit, unbounded blobs…). See below. |

---

## 🔍 ORMConceptValidator (v1.14+)

**Algorithmic linter** for your ORM schemas — detects 18 conceptual
anomalies before they bite in production. Zero IA, zero heuristics
flou, **fully generic** *(no hardcoded entity name — `KNOWN_ENTITY_REFS`
is derived at runtime from the schemas you pass)*.

**Real-world impact (v1.17.0)** : applied to iquesta (21 schemas, 70 findings) —
`--fix R001,R001B,R002,R003` auto-corrected all 16 structural anomalies in
seconds. Cross-projects calibration over 17 mostajs/* + apolocine codebases :
**247 findings** identified, **−23** after applying C1+C2 to iquesta alone.

### Quick start

```bash
# CLI — point it at your schemas directory
npx mostajs-orm-validator ./schemas

# With cross-file rules (R005, R007, R008, R011, R012, R014, R015) :
npx mostajs-orm-validator ./schemas --src ./lib

# In a CI pipeline :
npx mostajs-orm-validator ./schemas --src ./lib --ci --max-warnings 0
```

Or programmatically :

```typescript
import { validateSchemas, formatText } from '@mostajs/orm/validator'
import * as schemas from './schemas'

const report = await validateSchemas(Object.values(schemas), {
  sourceRoot: './lib',
})

console.log(formatText(report))
console.log(`${report.findings.length} findings`)
```

### What it detects (18 rules)

| ID | Severity | Detection |
|---|---|---|
| **R001-EMPTY-RELATIONS** | warning | String field named like another entity (e.g. `project`, `respondent`) but `relations: {}` empty → loses ORM cascade & FK validation |
| **R002-FK-NAMING-INCONSISTENT** | warning | Mix of conventions in same set (`parentId` vs `project`, `questionId` vs `section`) — flags the minority |
| **R003-SOFT-DELETE-INCONSISTENT** | warning/info | Multiple soft-delete patterns concurrent (`deleted`/`cancelled`/`archived`) OR manual `deleted/deletedAt` while `softDelete: true` is available natively |
| **R004-DUPLICATE-ENTITY-SHAPE** | info | Pair of schemas with Jaccard on field names ≥ threshold (default 0.7) — possible legacy |
| **R004B-LEGACY-ENTITY** | info/warning | Name overlap (substring ≥ 4 chars or Jaro-Winkler ≥ 0.75) — flags the smaller schema. Bumps to warning if `legacy/deprecated` comment found in sources |
| **R005-ANY-TYPED-REPO** | warning | `BaseRepository<any>` in source files — typing lost. **Needs `--src`** |
| **R006-JSON-AS-RELATION** | info | `*sJson` field containing list of FK slugs/ids — should be normalized into junction table |
| **R007-REDUNDANT-DERIVED-FIELD** | info | Persisted field duplicate of a pure function of its id (e.g. `blobPath` derivable from `archiveBlobPath(id)`). **Needs `--src`** |
| **R008-BEST-EFFORT-FK-RESOLVER** | warning | `best-effort`/`TODO V2`/`HACK` comment + `?? null` fallback → root cause hidden. **Needs `--src`** |
| **R009-MISSING-LOOKUP-INDEX** | info/hint | `unique` field without dedicated index, OR FK string without index for inverse lookups |
| **R010-MISSING-AUDIT-TABLE** | hint | No schema resembling `AuditLog` (actor + action + timestamp) — sensitive actions untraceable |
| **R011-LEGACY-DEAD-CODE** | info | TS source file never imported (entry points like `page.tsx`/`route.ts` excluded). **Needs `--src`** |
| **R012-DUPLICATE-IMPLEMENTATION** | info | Pair of source files exporting overlapping function signatures (Jaccard ≥ 0.85). **Needs `--src`** |
| **R013-MISSING-CASCADE** | warning | `many-to-one` relation without explicit `onDelete` → orphans on parent delete |
| **R014-REPO-FACTORY-BOILERPLATE** | info | ≥ 5 `get*Repo()` helpers in same file — suggest factory. **Needs `--src`** |
| **R015-FLAT-LIB-STRUCTURE** | hint | Directory with > 25 flat files — suggest sub-directory organisation. **Needs `--src`** |
| **R016-AUDIT-EMAIL-AS-STRING** | info | `createdBy`/`validatedBy`/etc. typed string instead of FK User → loses ref. integrity if email changes |
| **R017-UNBOUNDED-BLOB-FIELD** | hint | `*Json`/`*Payload`/`*Blob`/`*Manifest` without documented size limit |
| **R018-EXTERNAL-SCHEMA-OVERSCOPED** | info | *(stub V2 — full impl in V3 with ts-morph)* External schema with many unused fields |

### Output formats

```bash
# Console output (TTY-aware ANSI colors)
npx mostajs-orm-validator ./schemas

# JSON (for CI / diff)
npx mostajs-orm-validator ./schemas --format json --out report.json

# Markdown (human-readable report)
npx mostajs-orm-validator ./schemas --format markdown --out REPORT.md
```

Example output :

```
✗ Section.project           R001-EMPTY-RELATIONS                  warning
    Field 'Section.project' looks like an FK to 'Project' but no ORM
    relation declared.
    Suggestion:
      relations: {
        project: { type: 'many-to-one', target: 'Project',
                   required: true, onDelete: 'cascade' },
      },
```

### Configuration

All thresholds and patterns are configurable — no hardcoded business
strings. Pass a config to `validateSchemas` :

```typescript
const report = await validateSchemas(schemas, {
  sourceRoot: './lib',
  ignore: ['R015', 'R017'],   // skip these rules entirely
  rules: { R001: 'error' },   // override severity (e.g. block CI on R001)
  softDeletePatterns: [
    { flag: 'deleted',   timestamp: 'deletedAt' },
    { flag: 'cancelled', timestamp: 'cancelledAt' },
    { flag: 'archived',  timestamp: 'archivedAt' },
    // add your project-specific patterns here
  ],
  auditByFields: ['createdBy', 'validatedBy', 'reviewedBy'],
  thresholds: {
    duplicateEntityJaccard: 0.7,        // R004
    duplicateImplJaroWinkler: 0.85,     // R012
    flatLibMaxFiles: 25,                // R015
  },
})
```

### CI integration

```jsonc
// package.json
{
  "scripts": {
    "lint:schemas": "mostajs-orm-validator ./schemas --src ./lib --ci --max-warnings 0"
  }
}
```

The `--ci` flag exits with code 1 if the number of `error + warning`
findings exceeds `--max-warnings` (default 0). Bind it to your
pre-commit hook or GitHub Actions to block regressions.

### Auto-fix (v1.15+ — V3-A) — `--fix` workflow

The validator can **apply the fix it suggests**, in-place via [ts-morph](https://ts-morph.com/),
for a subset of rules :

| Rule | Auto-fix action |
|---|---|
| **R001-EMPTY-RELATIONS** | Move the FK string field out of `fields: {}` and add a matching `many-to-one` entry to `relations: {}` with `onDelete: 'cascade'`. |
| **R001B-FIELD-RELATION-DUPLICATE** | Remove the redundant field when both `field` *(string)* and `relations.field` *(many-to-one)* exist for the same FK — leftover of a partial earlier fix. *(v1.17+)* |
| **R002-FK-NAMING-INCONSISTENT** | Rename the field in the schema to match the majority convention *(`parentId → parent`)*. **Cross-file consumer rename is left to the dev** *(use your IDE rename refactor)*. |
| **R003-SOFT-DELETE-INCONSISTENT** | Add `softDelete: true` and remove manual `deleted` + `deletedAt` fields. *(v1.17+)* |
| **R016-AUDIT-EMAIL-AS-STRING** | Convert the string field *(`createdBy`, `updatedBy`…)* into a `many-to-one` relation to `User` with `onDelete: 'set-null'`. |

```bash
# Dry-run — show diffs without writing
npx mostajs-orm-validator ./schemas --fix-dry-run

# Apply — writes <file>.bak backups by default
npx mostajs-orm-validator ./schemas --fix

# Apply only a subset of rules
npx mostajs-orm-validator ./schemas --fix --fix-rules R001,R003

# Without .bak files (CI / git-tracked workflow)
npx mostajs-orm-validator ./schemas --fix --no-backup

# Roll back the last --fix run (restores every <file>.bak)
npx mostajs-orm-validator ./schemas --rollback-fix
```

Workflow recommended :

1. Commit your current state *(so you have a clean diff baseline)*.
2. `--fix-dry-run` first — review the proposed diffs.
3. `--fix` once you're confident.
4. Run your test suite. If something broke, `--rollback-fix` restores the
   `.bak` files. Iterate with `--fix-rules` to apply only what works.
5. `git diff` + commit.

### In-process API

```typescript
import {
  validateSchemas,
  applyFixes,
  rollbackFixes,
  formatText, formatJson, formatMarkdown,
} from '@mostajs/orm/validator'

const report = await validateSchemas(schemas, { sourceRoot: './lib' })
console.log(formatJson(report, true))   // pretty JSON for CI artifact

const fixResults = await applyFixes(report, {
  sourceRoot: './schemas',
  dryRun: false,
  rules: ['R001', 'R001B', 'R003'],     // narrow the scope
  backup: true,
})

console.log(`Applied ${fixResults.filter(r => r.applied).length} fixes`)

// Tests fail ? roll back :
rollbackFixes('./schemas')              // restores all .bak files and deletes them
```

### Resilience features *(v1.17+)*

- **Cascade ts-morph mitigation** : when two fixes target the same file
  *(e.g. `registration.schema.ts` with both `RegistrationSchema` and
  `AttendanceSchema`)*, the fixer reloads the `SourceFile` between fixes
  via `removeSourceFile + createSourceFile` to avoid "node forgotten" crashes.
- **Text fallback** : if ts-morph `.remove()` crashes on an end-of-line
  comment, the fixer falls back to a robust regex that removes the field
  cleanly *(e.g. `project: { type: 'string' }, // FK Project`)*.
- **Try / catch around each fix** : a crash on one finding never aborts the
  rest of the batch. Failures are reported in `skipped` with a `reason`.

### VSCode extension *(v0.2.0)*

A VSCode extension wraps the validator so you get **inline squiggles** on
your `*.schema.ts` files plus **Code Actions** *(quick-fix UI)* for the
auto-fixable rules :

```
# Install from VSIX (until Marketplace publish)
code --install-extension mostajs-orm-vscode-0.2.0.vsix
```

Features :

- In-process import of `@mostajs/orm/validator` *(no CLI spawn → faster)*.
- Debounced 300ms re-lint on save / edit.
- Hover : full finding details + suggestion preview.
- Code Action *("💡 lightbulb")* : applies the corresponding `--fix` rule
  in-place. The `.bak` discipline applies — undo via `--rollback-fix` or
  VSCode "Undo Local Changes".

Source : [`mostajs/mosta-orm-vscode`](https://github.com/apolocine/mosta-orm-vscode).

### Generic by design

The validator is **fully generic** — no hardcoded entity name, no
project-specific assumption. The set of "known entities"
(`KNOWN_ENTITY_REFS`) is derived at runtime from the schemas you pass.
Same binary detects the same anti-patterns in any consumer codebase.

### TypeScript schemas

The CLI loads `.ts`/`.tsx`/`.js`/`.mjs` files directly via [`jiti`](https://github.com/unjs/jiti)
— no pre-compile step required. TypeScript `paths` aliases are resolved
automatically.

## Recipes *(cookbook)*

### Pagination + total count

```typescript
const [rows, total] = await Promise.all([
  postRepo.findAll({ author: userId }, { sort: { createdAt: -1 }, skip: 20, limit: 10 }),
  postRepo.count({ author: userId }),
])
```

### Composite unique upsert *(idempotent seed)*

```typescript
// Reuses the {tenantId, slug} composite unique to avoid race conditions
await memberRepo.upsert(
  { tenantId: 't1', slug: 'admin' },
  { tenantId: 't1', slug: 'admin', email: 'admin@t1.io', role: 'owner' },
)
```

### Many-to-many through junction *(read + insert)*

```typescript
// Schema : User.roles = many-to-many → Role through 'user_roles'
const user = await userRepo.findByIdWithRelations(userId, ['roles'])
console.log(user.roles)                                     // [{ name: 'admin' }, …]

// Add a role link (writes into the junction table) :
await dialect.linkRelation('User', userId, 'roles', roleId)
await dialect.unlinkRelation('User', userId, 'roles', roleId)
```

### Cross-dialect bootstrap *(one codebase, two environments)*

```typescript
// boot.ts — runs identically against SQLite (dev) and PostgreSQL (prod)
import { registerSchemas, getDialect } from '@mostajs/orm'
import { schemas } from './schemas'

export async function boot() {
  registerSchemas(schemas)
  const dialect = await getDialect()                        // picks env at runtime
  await dialect.initSchema(schemas)                         // DDL per strategy
  return dialect
}

// dev : DB_DIALECT=sqlite SGBD_URI=./data.sqlite npm run boot
// prod: DB_DIALECT=postgres SGBD_URI=$DATABASE_URL npm run boot
```

### Transaction with isolation upgrade

```typescript
await dialect.$transaction(
  async (tx) => {
    const acct = await tx.findOne('accounts', { id: 'a' })
    if (acct.balance < 100) throw new Error('insufficient')
    await tx.update('accounts', { id: 'a' }, { $inc: { balance: -100 } })
    await tx.create('ledger',   { type: 'debit', amount: 100, accountId: 'a' })
  },
  { isolation: 'SERIALIZABLE' },                            // upgrade isolation
)
```

### Lint your schemas in a pre-commit hook

```bash
# .husky/pre-commit
#!/bin/sh
npx mostajs-orm-validator ./schemas --src ./lib --ci --max-warnings 0
```

### Soft-delete migration *(legacy to native)*

```bash
# Detects manual deleted/deletedAt pattern, suggests softDelete: true natif
npx mostajs-orm-validator ./schemas --fix-dry-run --fix-rules R003

# Apply when satisfied :
npx mostajs-orm-validator ./schemas --fix --fix-rules R003
```

The validator will :

1. Add `softDelete: true` to the schema object.
2. Remove the manual `deleted` and `deletedAt` fields from `fields: {}`.
3. Leave a `.bak` backup so you can `--rollback-fix` if your runtime code
   relied on the manual fields directly.

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
| [@mostajs/orm-bridge](https://www.npmjs.com/package/@mostajs/orm-bridge) | Keep your Prisma code, run it on any of the 19 databases (`createPrismaLikeDb()` is a drop-in replacement for `new PrismaClient()`). |
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

# Audit : @mostajs/orm Dialects vs Hibernate ORM Dialects

> Auteur : Dr Hamid MADANI drmdh@msn.com
> Date : 2026-03-07
> Source Hibernate : https://github.com/hibernate/hibernate-orm/tree/main/hibernate-core/src/main/java/org/hibernate/dialect
> Source MostaJS : /home/hmd/dev/MostaGare-Install/mostajs/mosta-orm/src/dialects/

---

## 1. Hierarchie des classes

### Hibernate ORM

```
Dialect (classe abstraite racine)
├── PostgreSQLDialect
├── MySQLDialect
│   └── MariaDBDialect
├── OracleDialect
├── AbstractTransactSQLDialect
│   ├── SQLServerDialect
│   └── SybaseDialect
│       └── SybaseASEDialect
├── DB2Dialect
├── CockroachDialect
├── HANADialect
├── SpannerDialect
└── HSQLDialect
```

### @mostajs/orm

```
AbstractSqlDialect (classe abstraite racine)
├── PostgresDialect
│   └── CockroachDBDialect
├── MySQLDialect
│   └── MariaDBDialect
├── OracleDialect
├── MSSQLDialect
│   └── SybaseDialect
├── DB2Dialect
├── HANADialect
├── HSQLDialect
└── SpannerDialect

MongoDialect (implements IDialect directement)
SQLiteDialect (implements IDialect directement)
```

### Ecarts constates

| Point | Hibernate | @mostajs/orm | Ecart |
|-------|-----------|-------------|-------|
| MSSQL/Sybase heritage | `AbstractTransactSQLDialect` → `SQLServerDialect` et `SybaseDialect` → `SybaseASEDialect` | `MSSQLDialect` → `SybaseDialect` | OK — meme logique, noms simplifies |
| CockroachDB | Etend `Dialect` directement | Etend `PostgresDialect` | OK — CockroachDB est wire-compatible PostgreSQL |
| MongoDB | N'existe pas dans Hibernate | `MongoDialect` (implements IDialect) | OK — Hibernate est SQL only |
| SQLite | N'existe pas dans Hibernate core | `SQLiteDialect` (implements IDialect) | OK — Hibernate a un module communautaire |
| SQLite/MongoDB hors AbstractSqlDialect | - | Ces 2 dialects n'etendent pas AbstractSqlDialect | ATTENTION — ils dupliquent du code CRUD |

---

## 2. Architecture : Dialect vs Connexion

### Principe Hibernate (REFERENCE)

Dans Hibernate, le Dialect est une **couche de definition SQL pure**. Il ne gere **JAMAIS** :
- Les connexions JDBC
- Les transactions
- L'execution des requetes
- Le transport reseau (I/O)

```
Hibernate :
┌─────────────────────────────────────────────────┐
│ Dialect                                         │
│ = Definition SQL pure                           │
│ - Type mappings, quotes, placeholders           │
│ - Fonctions SQL (~75 pour HSQLDB)               │
│ - Feature flags (30+ booleans)                  │
│ - Patterns SQL (cast, temporal, limit...)        │
│ ❌ ZERO connexion, ZERO I/O, ZERO transport      │
├─────────────────────────────────────────────────┤
│ SessionFactory / ConnectionProvider             │
│ = Gestion connexion + pool + transactions       │
├─────────────────────────────────────────────────┤
│ JDBC Driver (jar)                               │
│ = Transport reseau                              │
└─────────────────────────────────────────────────┘
```

### @mostajs/orm (ACTUEL)

Chaque dialect gere **a la fois** la definition SQL **et** la connexion/execution :

```
@mostajs/orm :
┌─────────────────────────────────────────────────┐
│ Dialect                                         │
│ = Definition SQL + Connexion + Execution        │
│ - Type mappings, quotes, placeholders           │
│ - doConnect() → import('driver')                │
│ - executeQuery() → driver.query(sql)            │
│ - executeRun() → driver.execute(sql)            │
│ ⚠️ Melange responsabilites                       │
└─────────────────────────────────────────────────┘
```

### Verdict

| Critere | Hibernate | @mostajs/orm | Conformite |
|---------|-----------|-------------|------------|
| Dialect = SQL pur | OUI | NON — contient connexion + execution | ⚠️ ECART |
| Connexion separee | OUI (ConnectionProvider) | NON — dans le dialect | ⚠️ ECART |
| Execution separee | OUI (Session/Executor) | NON — dans le dialect | ⚠️ ECART |

**Note importante** : cet ecart est **volontaire et acceptable** pour @mostajs/orm. Hibernate est un framework Java massif avec des dizaines de classes intermediaires. @mostajs/orm est un ORM leger ou regrouper connexion + SQL dans le dialect simplifie enormement l'architecture. L'important est que **tous les dialects suivent le meme pattern** — ce qui est le cas sauf pour HSQLDB (voir section 10).

---

## 3. Type Mappings

### 3.1 Comparaison detaillee

#### PostgreSQL

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | TEXT | varchar($l) / text | OK |
| number | DOUBLE PRECISION | float8 / double precision | OK |
| boolean | BOOLEAN | boolean (natif) | OK |
| date | TIMESTAMPTZ | timestamp with time zone | OK |
| json | JSONB | jsonb | OK |
| array | JSONB | (arrays natifs + jsonb) | ⚠️ Hibernate utilise les arrays natifs PostgreSQL |
| ID | TEXT | varchar(255) / uuid | ⚠️ Hibernate utilise souvent UUID natif |

#### MySQL

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | TEXT | varchar($l) | ⚠️ Hibernate utilise varchar(255) par defaut, TEXT pour large |
| number | DOUBLE | double | OK |
| boolean | TINYINT(1) | bit | ⚠️ Hibernate utilise BIT, pas TINYINT(1) |
| date | DATETIME | datetime($p) | OK |
| json | JSON | json | OK |
| array | JSON | json | OK |
| ID | VARCHAR(36) | varchar(255) | ⚠️ Taille differente |

#### Oracle

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | VARCHAR2(4000) | varchar2($l char) | OK — meme type, taille par defaut differente |
| number | NUMBER | number($p,$s) / binary_double | OK |
| boolean | NUMBER(1) | number(1,0) / boolean (v23+) | OK |
| date | TIMESTAMP | timestamp($p) | OK |
| json | CLOB | json (v21+) / blob | ⚠️ Hibernate utilise JSON natif si v21+, sinon BLOB |
| array | CLOB | (pas de support natif) | OK |
| ID | VARCHAR2(36) | varchar2(255) | ⚠️ Taille differente |

#### SQL Server (MSSQL)

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | NVARCHAR(MAX) | nvarchar($l) | ⚠️ Hibernate utilise nvarchar(255) par defaut |
| number | FLOAT | float | OK |
| boolean | BIT | bit | OK |
| date | DATETIME2 | datetime2($p) | OK |
| json | NVARCHAR(MAX) | nvarchar(max) | OK |
| array | NVARCHAR(MAX) | nvarchar(max) | OK |
| ID | NVARCHAR(36) | nvarchar(255) | ⚠️ Taille differente |

#### DB2

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | VARCHAR(4000) | varchar($l) | OK |
| number | DOUBLE | double | OK |
| boolean | BOOLEAN | boolean | OK |
| date | TIMESTAMP | timestamp($p) | OK |
| json | CLOB | clob | OK |
| array | CLOB | clob | OK |
| ID | VARCHAR(36) | varchar(255) | ⚠️ Taille differente |

#### HANA

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | NVARCHAR(5000) | nvarchar($l) | OK |
| number | DOUBLE | double | OK |
| boolean | BOOLEAN | tinyint ou boolean | ⚠️ Hibernate utilise tinyint par defaut (legacy), boolean en option |
| date | TIMESTAMP | timestamp | OK |
| json | NCLOB | nclob | OK |
| array | NCLOB | nclob | OK |
| ID | NVARCHAR(36) | nvarchar(255) | ⚠️ Taille differente |

#### HSQLDB

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | VARCHAR(4000) | varchar($l) | OK |
| number | DOUBLE | double | OK |
| boolean | BOOLEAN | boolean (natif) | OK |
| date | TIMESTAMP | timestamp($p) | OK |
| json | CLOB | clob | OK |
| array | CLOB | (arrays natifs supportes) | ⚠️ HSQLDB supporte ARRAY[] nativement |
| ID | VARCHAR(36) | varchar(255) | ⚠️ Taille differente |

#### Spanner

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | STRING(MAX) | string($l) | OK |
| number | FLOAT64 | float64 | OK |
| boolean | BOOL | bool | OK |
| date | TIMESTAMP | timestamp | OK |
| json | JSON | json | OK |
| array | JSON | json | OK |
| ID | STRING(36) | string(36) | OK |

#### Sybase ASE

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| string | NVARCHAR(MAX) | varchar($l) | ⚠️ Hibernate utilise varchar, pas nvarchar |
| number | FLOAT | float / double | OK |
| boolean | TINYINT | tinyint | OK |
| date | DATETIME | datetime | OK |
| json | TEXT | text | OK |
| array | TEXT | text | OK |
| ID | (herite MSSQL) NVARCHAR(36) | varchar(255) | ⚠️ |

#### MariaDB

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| (herite MySQL) | (herite MySQL) | (herite MySQLDialect) | OK — meme approche heritage |

#### CockroachDB

| Type DAL | @mostajs/orm | Hibernate | Conformite |
|----------|-------------|-----------|------------|
| (herite PostgreSQL) | (herite PostgresDialect) | Etend Dialect directement | ⚠️ Hibernate ne herite pas de PostgreSQLDialect |

### 3.2 Ecarts recurrents sur les types

| Ecart | Detail | Impact | Recommandation |
|-------|--------|--------|----------------|
| Taille ID | @mostajs utilise VARCHAR(36), Hibernate utilise VARCHAR(255) | Faible — 36 suffit pour UUID | Garder VARCHAR(36) — plus optimise |
| string par defaut | @mostajs utilise TEXT/VARCHAR(MAX), Hibernate utilise VARCHAR(255) | Moyen — TEXT est plus flexible | Garder TEXT — evite les troncatures |
| boolean MySQL | @mostajs: TINYINT(1), Hibernate: BIT | Faible — les deux fonctionnent | Acceptable, TINYINT(1) est le standard MySQL historique |
| boolean HANA | @mostajs: BOOLEAN, Hibernate: TINYINT (legacy) | Faible | @mostajs est plus moderne |
| array HSQLDB | @mostajs: CLOB, Hibernate: ARRAY[] natif | Moyen | Peut etre ameliore plus tard |
| json Oracle | @mostajs: CLOB, Hibernate: JSON natif (v21+) | Moyen | Peut etre ameliore avec detection version |

---

## 4. Identifier Quoting

| Dialect | @mostajs/orm | Hibernate | Conformite |
|---------|-------------|-----------|------------|
| PostgreSQL | `"name"` | `"name"` | OK |
| MySQL | `` `name` `` | `` `name` `` | OK |
| MariaDB | `` `name` `` (herite) | `` `name` `` (herite) | OK |
| Oracle | `"name"` | `"name"` | OK |
| MSSQL | `[name]` | `[name]` | OK |
| DB2 | `"name"` | `"name"` | OK |
| CockroachDB | `"name"` (herite) | `"name"` | OK |
| HANA | `"name"` | `"name"` | OK |
| HSQLDB | `"name"` | `"name"` | OK |
| Spanner | `` `name` `` | `` `name` `` | OK |
| Sybase | `[name]` (herite MSSQL) | `"name"` | ⚠️ ECART — Hibernate utilise `"` pour Sybase ASE |

### Ecart Sybase

Hibernate utilise `"` (guillemets doubles) pour Sybase ASE. @mostajs/orm herite de MSSQL et utilise `[` (crochets). Les deux fonctionnent dans Sybase ASE, mais `"` est le standard SQL. Impact faible.

---

## 5. Placeholder Style

| Dialect | @mostajs/orm | Hibernate (JDBC) | Conformite |
|---------|-------------|------------------|------------|
| PostgreSQL | `$1, $2, $3` | `?` (JDBC standard) | ⚠️ ECART — `pg` npm driver utilise $N, JDBC utilise ? |
| MySQL | `?` | `?` | OK |
| MariaDB | `?` (herite) | `?` (herite) | OK |
| Oracle | `:1, :2, :3` | `?` (JDBC standard) | ⚠️ ECART — `oracledb` npm utilise :N, JDBC utilise ? |
| MSSQL | `@p1, @p2` | `?` (JDBC standard) | ⚠️ ECART — `mssql` npm utilise @pN, JDBC utilise ? |
| DB2 | `?` | `?` | OK |
| CockroachDB | `$1, $2` (herite) | `?` | ⚠️ ECART — meme raison que PostgreSQL |
| HANA | `?` | `?` | OK |
| HSQLDB | `?` | `?` | OK |
| Spanner | `@p1, @p2` | `?` (JDBC) ou `@p` (Spanner JDBC) | OK — Spanner JDBC utilise aussi @p |
| Sybase | `@p1, @p2` (herite) | `?` | ⚠️ ECART |

### Explication des ecarts

Ces ecarts sont **normaux et attendus**. Hibernate utilise JDBC qui standardise sur `?`. @mostajs/orm utilise des drivers npm natifs qui ont leurs propres conventions :
- `pg` (PostgreSQL) → `$1, $2`
- `oracledb` (Oracle) → `:1, :2`
- `mssql` (SQL Server) → `@p1, @p2`

**Impact sur le bridge JDBC** : quand le bridge JDBC est actif, il faudra utiliser `?` (standard JDBC) au lieu des placeholders npm. C'est le normalizer qui fera cette conversion.

---

## 6. Feature Flags

### 6.1 supportsIfNotExists

| Dialect | @mostajs/orm | Hibernate | Conformite |
|---------|-------------|-----------|------------|
| PostgreSQL | true | true | OK |
| MySQL | true | true | OK |
| MariaDB | true (herite) | true (herite) | OK |
| Oracle | false | false (true si v23+) | OK — @mostajs peut ajouter detection version |
| MSSQL | false | false (true si v16+) | OK |
| DB2 | false | false (true si v11.5+) | OK |
| CockroachDB | true (herite) | true | OK |
| HANA | false | false | OK |
| HSQLDB | true | true | OK |
| Spanner | false | true | ⚠️ ECART — Hibernate dit true pour Spanner |
| Sybase | false (herite) | false | OK |

### 6.2 supportsReturning (INSERT RETURNING / OUTPUT)

| Dialect | @mostajs/orm | Hibernate | Conformite |
|---------|-------------|-----------|------------|
| PostgreSQL | true | true | OK |
| MySQL | false | false | OK |
| MariaDB | true | true | OK |
| Oracle | false | true (generated keys) | ⚠️ ECART — Hibernate gere les generated keys Oracle |
| MSSQL | true (OUTPUT) | true (OUTPUT) | OK |
| DB2 | false | true | ⚠️ ECART — Hibernate dit true pour DB2 |
| CockroachDB | true (herite) | true | OK |
| HANA | false | false | OK |
| HSQLDB | false | false | OK |
| Spanner | false | false | OK |
| Sybase | false | false | OK |

### 6.3 Boolean Handling

| Dialect | @mostajs/orm serialize | @mostajs/orm type SQL | Hibernate type SQL | Conformite |
|---------|----------------------|----------------------|-------------------|------------|
| PostgreSQL | natif (v) | BOOLEAN | boolean | OK |
| MySQL | 1/0 | TINYINT(1) | bit | ⚠️ Type different, meme comportement |
| MariaDB | 1/0 (herite) | TINYINT(1) (herite) | bit (herite) | ⚠️ |
| Oracle | 1/0 | NUMBER(1) | number(1,0) / boolean(v23+) | OK |
| MSSQL | 1/0 | BIT | bit | OK |
| DB2 | natif (v) | BOOLEAN | boolean | OK |
| CockroachDB | natif (herite) | BOOLEAN (herite) | boolean | OK |
| HANA | natif (v) | BOOLEAN | tinyint (legacy) / boolean | OK — @mostajs est plus moderne |
| HSQLDB | natif (v) | BOOLEAN | boolean | OK |
| Spanner | natif (v) | BOOL | bool | OK |
| Sybase | 1/0 | TINYINT | tinyint | OK |

### 6.4 Limit/Offset Syntax

| Dialect | @mostajs/orm | Hibernate | Conformite |
|---------|-------------|-----------|------------|
| PostgreSQL | LIMIT n OFFSET m (defaut) | OFFSET n ROWS FETCH FIRST n ROWS ONLY | ⚠️ ECART — les deux fonctionnent en PostgreSQL |
| MySQL | LIMIT n OFFSET m (defaut) | LIMIT n OFFSET m | OK |
| MariaDB | LIMIT n OFFSET m (herite) | LIMIT n OFFSET m (herite) | OK |
| Oracle | OFFSET n ROWS FETCH FIRST m ROWS ONLY | FETCH FIRST n ROWS ONLY | OK |
| MSSQL | OFFSET n ROWS FETCH NEXT m ROWS ONLY | OFFSET n ROWS FETCH NEXT n ROWS ONLY | OK |
| DB2 | OFFSET n ROWS FETCH FIRST m ROWS ONLY | DB2-specific fetch | OK |
| CockroachDB | LIMIT n OFFSET m (herite) | OFFSET/FETCH | ⚠️ |
| HANA | LIMIT n OFFSET m (defaut) | LIMIT n OFFSET m | OK |
| HSQLDB | LIMIT n OFFSET m (defaut) | OFFSET n ROWS FETCH FIRST n ROWS ONLY | ⚠️ ECART — HSQLDB supporte les deux syntaxes |
| Spanner | LIMIT n OFFSET m (defaut) | LIMIT n OFFSET m | OK |
| Sybase | (vide — TOP gere separement) | TOP n | OK — meme approche |

### 6.5 Regex / LIKE

| Dialect | @mostajs/orm | Hibernate | Conformite |
|---------|-------------|-----------|------------|
| PostgreSQL | ILIKE (case-insensitive) | `~` operator / ILIKE | OK |
| MySQL | LIKE (defaut) | REGEXP | ⚠️ Hibernate utilise REGEXP natif |
| Oracle | UPPER(col) LIKE UPPER(?) | REGEXP_LIKE() | ⚠️ Hibernate utilise REGEXP_LIKE natif |
| MSSQL | LIKE (defaut) | LIKE (pas de regex natif < v17) | OK |
| DB2 | UPPER(col) LIKE UPPER(?) | REGEXP_LIKE() | ⚠️ |
| HANA | UPPER(col) LIKE UPPER(?) | LIKE-based | OK |
| HSQLDB | LIKE (defaut) | REGEXP_LIKE | ⚠️ HSQLDB a regexp_like natif |
| Spanner | LOWER(col) LIKE LOWER(?) | REGEXP_CONTAINS() | ⚠️ |
| Sybase | LIKE (defaut) | Pas de regex | OK |

---

## 7. Table List Query

| Dialect | @mostajs/orm | Hibernate equivalent | Conformite |
|---------|-------------|---------------------|------------|
| PostgreSQL | `SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'` | pg_tables / pg_catalog | OK |
| MySQL | `SELECT table_name as name FROM information_schema.tables WHERE table_schema = DATABASE()` | information_schema | OK |
| Oracle | `SELECT table_name as name FROM user_tables` | user_tables | OK |
| MSSQL | `SELECT name FROM sys.tables WHERE type = 'U'` | sys.tables | OK |
| DB2 | `SELECT tabname as name FROM syscat.tables WHERE tabschema = CURRENT SCHEMA AND type = 'T'` | syscat.tables | OK |
| HANA | `SELECT table_name as name FROM tables WHERE schema_name = CURRENT_SCHEMA` | tables system view | OK |
| HSQLDB | `SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'PUBLIC'` | information_schema | OK |
| Spanner | `SELECT table_name as name FROM information_schema.tables WHERE table_schema = ''` | information_schema | OK |
| Sybase | `SELECT name FROM sysobjects WHERE type = 'U'` | sysobjects | OK |

Tous les table list queries sont **conformes** aux conventions de chaque SGBD.

---

## 8. Connexion et Execution (specifique @mostajs/orm)

Hibernate ne gere pas la connexion dans les dialects. @mostajs/orm le fait — voici l'audit de chaque implementation :

### 8.1 Pattern de connexion par dialect

| Dialect | Driver npm | API style | Pool | Test query |
|---------|-----------|-----------|------|------------|
| PostgreSQL | `pg` | Promise (Pool) | Oui (Pool) | `SELECT 1` |
| MySQL | `mysql2/promise` | Promise (Pool) | Oui (createPool) | `SELECT 1` |
| MariaDB | `mariadb` (fallback `mysql2`) | Promise (Pool) | Oui | `SELECT 1` |
| Oracle | `oracledb` | Promise (Pool) | Oui (createPool) | `SELECT 1 FROM DUAL` |
| MSSQL | `mssql` | Promise (ConnectionPool) | Oui | `SELECT 1` |
| DB2 | `ibm_db` | Callback → Promise | Non (connexion directe) | `SELECT 1 FROM SYSIBM.SYSDUMMY1` |
| HANA | `@sap/hana-client` | Callback → Promise | Non (connexion directe) | `SELECT 1 FROM DUMMY` |
| HSQLDB | `fetch` (HTTP) | Promise (HTTP) | Non | `SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS` |
| Spanner | `@google-cloud/spanner` | Promise (gRPC) | Cloud-managed | `SELECT 1` |
| Sybase | `sybase` | Callback → Promise | Oui (custom pool) | (herite) |
| CockroachDB | `pg` (herite) | Promise (Pool) | Oui (herite) | `SELECT 1` |
| MongoDB | `mongoose` | Promise | Oui (interne) | `admin().ping()` |
| SQLite | `better-sqlite3` | Synchrone | Non (fichier) | `SELECT 1` |

### 8.2 Ecarts dans les patterns de connexion

| Ecart | Dialects concernes | Detail |
|-------|-------------------|--------|
| HSQLDB utilise HTTP au lieu d'un driver | hsqldb | Seul dialect qui ne suit pas le pattern `import('driver')` |
| DB2 n'a pas de pool | db2 | Connexion unique — risque sous charge |
| HANA n'a pas de pool | hana | Connexion unique — risque sous charge |
| Sybase inline les params | sybase | Pas de PreparedStatement — risque injection SQL |

---

## 9. Fonctions SQL enregistrees

Hibernate enregistre ~75 fonctions SQL par dialect. @mostajs/orm n'enregistre pas de fonctions SQL car il traduit les filtres et aggregations via son propre DSL (FilterQuery, AggregateStage). Ceci n'est pas un ecart mais une difference d'architecture.

### Fonctions SQL couvertes par @mostajs/orm via le DSL

| Categorie | Support @mostajs/orm | Comment |
|-----------|---------------------|---------|
| WHERE / filtres | OUI | $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $regex, $exists, $or, $and |
| ORDER BY | OUI | Via QueryOptions.sort |
| LIMIT/OFFSET | OUI | Via QueryOptions.limit, skip |
| COUNT | OUI | Via count() method |
| DISTINCT | OUI | Via distinct() method |
| Aggregation | OUI | Via aggregate() — $match, $group, $sort, $limit |
| GROUP BY + SUM/AVG/MIN/MAX/COUNT | OUI | Via $group stage |
| JOIN / Relations | OUI | Via findWithRelations, populate |
| UPSERT | OUI | Via upsert() method |
| INCREMENT | OUI | Via increment() method |

### Fonctions Hibernate NON couvertes par @mostajs/orm

| Categorie | Fonctions | Impact |
|-----------|----------|--------|
| Math | cot, radians, degrees, log10, rand, pi, trunc, bitwise | Faible — rarement utilise en ORM |
| String | soundex, reverse, space, repeat, translate, overlay | Faible |
| Temporal | extract, timestampadd, timestampdiff, monthsBetween | Moyen — utile pour reporting |
| Regex | REGEXP_LIKE, ~ operator | Moyen — couvert partiellement via $regex |
| Window | ROW_NUMBER, RANK, DENSE_RANK | Moyen |
| JSON | jsonObject, jsonArray, jsonArrayAgg | Faible |
| Array | array operations (17 fonctions HSQLDB) | Faible |

---

## 10. Ecart majeur : HSQLDB Dialect

### Le probleme

Le dialect HSQLDB est le **seul** qui ne suit pas le pattern des autres dialects :

```
Oracle :  doConnect() → import('oracledb')  → pool = createPool()
DB2 :     doConnect() → import('ibm_db')    → conn = openSync()
HANA :    doConnect() → import('@sap/hana') → conn = createConnection()
HSQLDB :  doConnect() → this.baseUrl = ...  → httpPost() via fetch()  ← DIFFERENT
```

Tous les autres dialects :
1. Importent un driver npm dans `doConnect()`
2. Creent un pool/connexion
3. Executent via le driver dans `executeQuery()` / `executeRun()`

HSQLDB :
1. Parse une URL HTTP dans `doConnect()`
2. Utilise `fetch()` pour envoyer du JSON
3. A sa propre methode privee `httpPost()`

### Pourquoi c'est un probleme

1. **Inconsistance** — tous les dialects suivent le meme pattern sauf HSQLDB
2. **Code HTTP dans le dialect** — viole le principe Hibernate (dialect = SQL pur)
3. **Non reutilisable** — le code httpPost() ne peut pas servir pour Oracle/DB2 via bridge
4. **URI parsing specifique** — logique de conversion `hsqldb:hsql://` → `http://` dans le dialect

### La solution (traitee dans jdbc-normalizer-study.md)

Remettre HSQLDB dans le meme moule que les autres : `doConnect()`, `executeQuery()`, `executeRun()` avec des placeholders qui attendent un driver. La couche superieure (AbstractSqlDialect) gerera le bridge HTTP de maniere transparente pour TOUS les dialects JDBC.

---

## 11. Ecarts specifiques par dialect

### 11.1 PostgreSQL

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| Arrays | JSONB (serialise en JSON) | Arrays natifs PostgreSQL (ARRAY[]) | Peut etre ameliore — PostgreSQL a des arrays natifs puissants |
| UUID | TEXT (varchar) | UUID natif PostgreSQL | Peut etre ameliore — type UUID natif est plus efficace |
| LIMIT | LIMIT/OFFSET | OFFSET/FETCH | Acceptable — les deux fonctionnent |
| Regex | ILIKE | `~` operator natif | Acceptable — ILIKE couvre le besoin principal |
| Filter clause | Non supporte | supportsFilterClause = true | PostgreSQL est le seul SGBD avec FILTER |

### 11.2 MySQL

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| Boolean type | TINYINT(1) | BIT | Acceptable — TINYINT(1) est le standard historique MySQL |
| String par defaut | TEXT | varchar(255) | @mostajs est plus flexible |
| Regex | LIKE | REGEXP natif | Peut etre ameliore |
| NULL ordering | Non gere | SMALLEST (NULLs premier) | Peut ajouter le flag |
| Sequences | N/A | NoSequenceSupport | OK — MySQL n'a pas de sequences |

### 11.3 Oracle

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| JSON | CLOB | JSON natif (v21+) | Peut etre ameliore avec detection version |
| RETURNING | false | true (generated keys) | Peut etre ameliore |
| Regex | UPPER LIKE UPPER | REGEXP_LIKE() natif | Peut etre ameliore |
| Sequences | Non gere | OracleSequenceSupport | N/A pour @mostajs (utilise UUID) |
| Locking | Non gere | FOR UPDATE avec NOWAIT/WAIT | N/A pour @mostajs |
| Temporary tables | Non gere | LOCAL + GLOBAL | N/A pour @mostajs |

### 11.4 SQL Server (MSSQL)

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| IF NOT EXISTS | Check sys.tables | Check sys.tables | OK — meme approche |
| OUTPUT | true | true | OK |
| Regex | LIKE | LIKE (pas de regex < v17) | OK |
| Locking | Non gere | Table hints | N/A pour @mostajs |

### 11.5 DB2

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| RETURNING | false | true | Peut etre ameliore |
| Regex | UPPER LIKE UPPER | REGEXP_LIKE() | Peut etre ameliore |
| executeRun changes | Retourne toujours 0 | rowsAffected disponible | ⚠️ BUG — devrait retourner affectedRows |
| Pool | Pas de pool | Pool via DataSource | Peut etre ameliore |

### 11.6 HANA

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| Boolean | BOOLEAN natif | TINYINT (legacy) | @mostajs est plus moderne |
| Pool | Pas de pool | Pool via DataSource | Peut etre ameliore |
| Locking | Non gere | FOR UPDATE + NOWAIT + IGNORE LOCKED | N/A |

### 11.7 Spanner

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| IF NOT EXISTS | false | true | ⚠️ ECART — Spanner supporte IF NOT EXISTS |
| DDL execution | Via updateSchema() | Via DDL batching | OK — meme approche |
| Locking | Non gere | DoNothingLockingStrategy | OK — Spanner n'a pas de locking |
| PRIMARY KEY | Clause separee | Clause separee | OK |

### 11.8 Sybase ASE

| Point | @mostajs/orm | Hibernate | Recommandation |
|-------|-------------|-----------|----------------|
| Quoting | `[name]` (herite MSSQL) | `"name"` | ⚠️ ECART — Hibernate utilise guillemets doubles |
| Params | Inline dans SQL (resolveParams) | `?` PreparedStatement | ⚠️ RISQUE — injection SQL possible |
| Regex | LIKE | Pas de regex | OK |
| TOP | Gere separement | TopLimitHandler | OK |

---

## 12. Resume des ecarts critiques

### Ecarts a corriger (priorite haute)

| # | Dialect | Ecart | Impact | Correction |
|---|---------|-------|--------|------------|
| 1 | HSQLDB | Seul dialect avec HTTP/fetch au lieu de driver pattern | Architecture | Remettre dans le moule des autres dialects |
| 2 | Sybase | resolveParams() inline les params dans le SQL | Securite (injection SQL) | Utiliser PreparedStatement via bridge JDBC |
| 3 | DB2 | executeRun retourne toujours { changes: 0 } | Bug fonctionnel | Extraire affectedRows du resultat |
| 4 | Spanner | supportsIfNotExists devrait etre true | Bug fonctionnel | Corriger le flag |

### Ecarts acceptables (priorite basse)

| # | Dialect | Ecart | Raison d'acceptation |
|---|---------|-------|---------------------|
| 5 | Tous | Taille ID (36 vs 255) | 36 chars suffit pour UUID, plus optimise |
| 6 | Tous | Placeholders ($N, :N, @pN vs ?) | Impose par les drivers npm, pas un choix |
| 7 | MySQL | TINYINT(1) vs BIT pour boolean | Standard historique MySQL, equivalent fonctionnel |
| 8 | PostgreSQL | LIMIT/OFFSET vs OFFSET/FETCH | Les deux syntaxes fonctionnent |
| 9 | PostgreSQL | JSONB pour arrays au lieu de ARRAY[] natif | Simplifie, JSON est universel |
| 10 | Plusieurs | LIKE au lieu de REGEXP_LIKE | LIKE couvre 90% des cas, regex est un bonus |

### Ecarts positifs (@mostajs meilleur que Hibernate)

| # | Dialect | Point | Detail |
|---|---------|-------|--------|
| 1 | HANA | Boolean type | @mostajs utilise BOOLEAN natif, Hibernate utilise TINYINT legacy |
| 2 | Tous | String par defaut | @mostajs utilise TEXT/VARCHAR(MAX), evite les troncatures |
| 3 | Tous | ID type | VARCHAR(36) plus optimise que VARCHAR(255) |

---

## 13. Matrice de conformite finale

| Dialect | Types | Quoting | Placeholder | Features | Connexion | Conformite globale |
|---------|-------|---------|-------------|----------|-----------|-------------------|
| PostgreSQL | OK | OK | ⚠️ ($N) | OK | OK | 90% |
| MySQL | ⚠️ (bool) | OK | OK | OK | OK | 90% |
| MariaDB | ⚠️ (herite) | OK | OK | OK | OK | 90% |
| Oracle | OK | OK | ⚠️ (:N) | ⚠️ (returning) | OK | 85% |
| MSSQL | OK | OK | ⚠️ (@pN) | OK | OK | 90% |
| DB2 | OK | OK | OK | ⚠️ (returning, changes=0) | ⚠️ (pas pool) | 75% |
| CockroachDB | OK (herite) | OK | ⚠️ ($N) | OK | OK | 90% |
| HANA | OK | OK | OK | OK | ⚠️ (pas pool) | 85% |
| HSQLDB | OK | OK | OK | OK | ❌ (HTTP dans dialect) | 60% |
| Spanner | OK | OK | ⚠️ (@pN) | ⚠️ (IF EXISTS) | OK | 85% |
| Sybase | ⚠️ (nvarchar) | ⚠️ ([] vs ") | ⚠️ (@pN inline) | OK | ⚠️ (injection) | 65% |

### Score moyen de conformite : **83%**

Les ecarts principaux sont :
1. **HSQLDB** : architecture de connexion completement differente (HTTP dans le dialect)
2. **Sybase** : risque injection SQL + quoting different
3. **DB2** : bug executeRun + pas de pool
4. Les placeholders ($N, :N, @pN) sont des ecarts **normaux** imposes par les drivers npm

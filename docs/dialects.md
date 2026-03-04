# MostaORM — Guide des dialectes

> Configuration détaillée de chacun des 13 dialectes supportés.

---

## Table des matières

1. [SQLite](#1-sqlite)
2. [PostgreSQL](#2-postgresql)
3. [MySQL](#3-mysql)
4. [MariaDB](#4-mariadb)
5. [MongoDB](#5-mongodb)
6. [Microsoft SQL Server (MSSQL)](#6-microsoft-sql-server-mssql)
7. [Oracle Database](#7-oracle-database)
8. [CockroachDB](#8-cockroachdb)
9. [IBM DB2](#9-ibm-db2)
10. [SAP HANA](#10-sap-hana)
11. [HyperSQL (HSQLDB)](#11-hypersql-hsqldb)
12. [Google Cloud Spanner](#12-google-cloud-spanner)
13. [Sybase / SAP ASE](#13-sybase--sap-ase)
14. [Variables d'environnement communes](#14-variables-denvironnement-communes)
15. [Comparaison des fonctionnalités](#15-comparaison-des-fonctionnalités)

---

## 1. SQLite

**Driver** : `better-sqlite3`
**Idéal pour** : applications embarquées, développement, tests, Electron, CLI tools

### Installation

```bash
npm install better-sqlite3
npm install @types/better-sqlite3 --save-dev
```

### Configuration

```typescript
import { createConnection } from '@mosta/orm'

const dialect = await createConnection({
  dialect: 'sqlite',
  uri: './data/myapp.db',        // chemin relatif ou absolu
  schemaStrategy: 'update',
})
```

### URIs SQLite

```env
# Fichier local
SGBD_URI=./data/myapp.db
SGBD_URI=/absolute/path/to/db.sqlite

# Base de données en mémoire (tests)
SGBD_URI=:memory:
```

### Notes importantes

- Pas de serveur requis — le fichier `.db` est la base de données
- Les tableaux (`array`) et JSON sont stockés sous forme de texte sérialisé
- La recherche full-text utilise `LIKE %query%` (pas d'index FTS par défaut)
- Excellent pour les tests unitaires avec `schemaStrategy: 'create-drop'`
- Thread-safe en lecture seule ; en écriture, les accès sont sérialisés automatiquement

### Exemple complet

```env
DB_DIALECT=sqlite
SGBD_URI=./data/dev.db
DB_SCHEMA_STRATEGY=update
DB_SHOW_SQL=true
```

---

## 2. PostgreSQL

**Driver** : `pg`
**Idéal pour** : applications web de production, données géographiques (PostGIS), full-text search avancé

### Installation

```bash
npm install pg
npm install @types/pg --save-dev
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'postgres',
  uri: 'postgresql://user:password@localhost:5432/mydb',
  schemaStrategy: 'update',
  poolSize: 10,
  showSql: false,
})
```

### Formats d'URI PostgreSQL

```env
# Format standard
SGBD_URI=postgresql://user:password@localhost:5432/mydb

# Avec SSL
SGBD_URI=postgresql://user:password@host:5432/mydb?sslmode=require

# Supabase
SGBD_URI=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# Neon (serverless)
SGBD_URI=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/mydb?sslmode=require

# Railway
SGBD_URI=postgresql://postgres:password@containers-us-west.railway.app:5432/railway

# URL encodé (avec caractères spéciaux dans le mot de passe)
SGBD_URI=postgresql://user:p%40ssword@localhost:5432/mydb
```

### Variables d'environnement

```env
DB_DIALECT=postgres
SGBD_URI=postgresql://user:pass@localhost:5432/mydb
DB_SCHEMA_STRATEGY=validate
DB_POOL_SIZE=10
DB_SHOW_SQL=false
DB_CACHE_ENABLED=true
DB_CACHE_TTL=120
```

### Notes importantes

- Les champs `json` utilisent `JSONB` pour des performances optimales
- Les index `text` utilisent `to_tsvector` pour la recherche full-text
- Compatible avec PgBouncer (connection pooling)
- SSL recommandé en production (`?sslmode=require`)

---

## 3. MySQL

**Driver** : `mysql2`
**Idéal pour** : applications web traditionnelles, grande communauté, hébergements mutualisés

### Installation

```bash
npm install mysql2
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'mysql',
  uri: 'mysql://user:password@localhost:3306/mydb',
  schemaStrategy: 'update',
  poolSize: 5,
})
```

### Formats d'URI MySQL

```env
# Format standard
SGBD_URI=mysql://user:password@localhost:3306/mydb

# Avec charset
SGBD_URI=mysql://user:password@localhost:3306/mydb?charset=utf8mb4

# PlanetScale
SGBD_URI=mysql://user:password@aws.connect.psdb.cloud/mydb?ssl={"rejectUnauthorized":true}

# Amazon RDS MySQL
SGBD_URI=mysql://admin:password@mydb.cluster.us-east-1.rds.amazonaws.com:3306/mydb
```

### Variables d'environnement

```env
DB_DIALECT=mysql
SGBD_URI=mysql://root:rootpass@localhost:3306/myapp
DB_SCHEMA_STRATEGY=update
DB_POOL_SIZE=5
```

### Notes importantes

- Utilisez `utf8mb4` comme charset pour le support complet Unicode (emojis inclus)
- Les champs `json` utilisent le type `JSON` de MySQL 5.7+
- MySQL 8.0+ recommandé pour les meilleures performances

---

## 4. MariaDB

**Driver** : `mariadb`
**Idéal pour** : compatible MySQL avec fonctionnalités étendues, open source à 100%

### Installation

```bash
npm install mariadb
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'mariadb',
  uri: 'mariadb://user:password@localhost:3306/mydb',
  schemaStrategy: 'update',
})
```

### Formats d'URI MariaDB

```env
SGBD_URI=mariadb://user:password@localhost:3306/mydb
SGBD_URI=mariadb://user:password@mariadb.host.com:3306/mydb?ssl=true
```

### Notes importantes

- Syntaxe SQL identique à MySQL — les schémas sont entièrement compatibles
- Légèrement plus rapide que MySQL pour les opérations d'écriture
- Meilleur support des clauses `RETURNING` (MariaDB 10.5+)

---

## 5. MongoDB

**Driver** : `mongoose`
**Idéal pour** : données semi-structurées, documents imbriqués, scalabilité horizontale

### Installation

```bash
npm install mongoose
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'mongodb',
  uri: 'mongodb://localhost:27017/mydb',
  schemaStrategy: 'update',   // crée les collections et index automatiquement
})
```

### Formats d'URI MongoDB

```env
# Local sans authentification
SGBD_URI=mongodb://localhost:27017/mydb

# Local avec authentification
SGBD_URI=mongodb://user:password@localhost:27017/mydb?authSource=admin

# MongoDB Atlas (cloud)
SGBD_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/mydb

# Replica Set
SGBD_URI=mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0

# MongoDB Atlas avec options TLS
SGBD_URI=mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority
```

### Variables d'environnement

```env
DB_DIALECT=mongodb
SGBD_URI=mongodb://devuser:devpass@localhost:27017/myappdb
DB_SCHEMA_STRATEGY=update
DB_SHOW_SQL=false
```

### Notes importantes

- Les `relations` utilisent `populate()` de Mongoose (références par ObjectId)
- Les `indexes` sont créés comme index MongoDB
- Les champs `array` et `json` sont natifs — pas de sérialisation
- `schemaStrategy: 'create'` supprime et recrée toutes les collections

---

## 6. Microsoft SQL Server (MSSQL)

**Driver** : `mssql`
**Idéal pour** : environnements Microsoft, Azure SQL, intégration .NET

### Installation

```bash
npm install mssql
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'mssql',
  uri: 'mssql://sa:Password123!@localhost:1433/mydb',
  schemaStrategy: 'update',
})
```

### Formats d'URI MSSQL

```env
# Authentification SQL Server
SGBD_URI=mssql://username:password@localhost:1433/mydb

# Azure SQL Database
SGBD_URI=mssql://user@server:password@server.database.windows.net:1433/mydb?encrypt=true

# SQL Server Express (instance nommée)
SGBD_URI=mssql://sa:pass@localhost\\SQLEXPRESS:1433/mydb

# Avec options SSL
SGBD_URI=mssql://user:pass@host:1433/mydb?encrypt=true&trustServerCertificate=true
```

### Notes importantes

- SQL Server 2017+ ou Azure SQL Database requis
- Les champs `boolean` sont stockés comme `BIT`
- Les champs `json` sont stockés comme `NVARCHAR(MAX)`
- L'authentification Windows (`trusted_connection=true`) nécessite des options supplémentaires

---

## 7. Oracle Database

**Driver** : `oracledb`
**Idéal pour** : entreprises Oracle, Oracle Cloud, compatibilité legacy

### Installation

```bash
npm install oracledb
```

> Oracle Instant Client requis — voir la [documentation officielle oracledb](https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html).

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'oracle',
  uri: 'oracle://user:password@localhost:1521/ORCL',
  schemaStrategy: 'update',
})
```

### Formats d'URI Oracle

```env
# Service name
SGBD_URI=oracle://user:password@localhost:1521/XEPDB1

# SID (ancien format)
SGBD_URI=oracle://user:password@localhost:1521:ORCL

# Oracle Cloud (TNS)
SGBD_URI=oracle://user:password@tcps://adb.region.oraclecloud.com:1522/service_name
```

### Notes importantes

- Oracle Database 12c+ recommandé
- Les noms de tables sont convertis en UPPERCASE (convention Oracle)
- Les colonnes `CLOB` sont utilisées pour les champs `json` et `array`
- Nécessite Oracle Instant Client (bibliothèques C partagées)

---

## 8. CockroachDB

**Driver** : `pg` (protocole PostgreSQL compatible)
**Idéal pour** : scalabilité horizontale, résistance aux pannes, multi-région

### Installation

```bash
npm install pg
npm install @types/pg --save-dev
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'cockroachdb',
  uri: 'postgresql://root@localhost:26257/defaultdb?sslmode=disable',
  schemaStrategy: 'update',
})
```

### Formats d'URI CockroachDB

```env
# Local (développement, sans SSL)
SGBD_URI=postgresql://root@localhost:26257/defaultdb?sslmode=disable

# CockroachDB Cloud (Serverless)
SGBD_URI=postgresql://user:password@free-tier.gcp-us-central1.cockroachlabs.cloud:26257/mydb?sslmode=verify-full&sslrootcert=/path/to/ca.crt

# CockroachDB Dedicated
SGBD_URI=postgresql://user:password@cluster.region.cockroachlabs.cloud:26257/mydb?sslmode=require
```

### Notes importantes

- Syntaxe SQL très proche de PostgreSQL — haute compatibilité
- Transactions distribuées ACID par défaut
- `SERIAL` → `UUID` recommandé pour les IDs distribués
- La stratégie `schemaStrategy: 'update'` est sans risque (ALTER TABLE)

---

## 9. IBM DB2

**Driver** : `ibm_db`
**Idéal pour** : environnements IBM mainframe, IBM Cloud

### Installation

```bash
npm install ibm_db
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'db2',
  uri: 'db2://user:password@localhost:50000/SAMPLE',
  schemaStrategy: 'update',
})
```

### Formats d'URI DB2

```env
# Local
SGBD_URI=db2://user:password@localhost:50000/SAMPLE

# IBM Cloud Db2
SGBD_URI=db2://user:password@dashdb-txn-sbox-yp-xxx.services.dal.bluemix.net:50000/BLUDB:SECURITY=SSL;
```

### Notes importantes

- DB2 for LUW (Linux, Unix, Windows) — pas DB2 for z/OS
- Les noms de schéma sont en UPPERCASE par convention
- `ibm_db` nécessite le client CLI IBM Data Server (bibliothèques C natives)

---

## 10. SAP HANA

**Driver** : `@sap/hana-client`
**Idéal pour** : analytics temps réel, SAP ecosystem, in-memory computing

### Installation

```bash
npm install @sap/hana-client
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'hana',
  uri: 'hana://user:password@host:39013/myschema',
  schemaStrategy: 'update',
})
```

### Formats d'URI HANA

```env
# HANA on-premises
SGBD_URI=hana://user:password@hanahost:39013

# SAP HANA Cloud
SGBD_URI=hana://user:password@xxx.hanacloud.ondemand.com:443?encrypt=true&sslValidateCertificate=false

# Avec schéma par défaut
SGBD_URI=hana://user:password@host:39013?currentSchema=MYSCHEMA
```

### Notes importantes

- HANA utilise des schémas (namespaces) — définissez `currentSchema` dans l'URI
- Colonnes en UPPERCASE par défaut
- Performances analytiques exceptionnelles sur les agrégations
- `@sap/hana-client` disponible sur npm.sap.com

---

## 11. HyperSQL (HSQLDB)

**Driver** : Java via JDBC (pont JavaScript)
**Idéal pour** : tests embarqués, compatibilité Java, bases de données in-memory

### Notes

HSQLDB est une base de données Java. L'adaptateur MostaORM utilise un pont JDBC-to-Node. Pour la plupart des cas d'usage embarqués, préférez SQLite qui ne nécessite pas de JVM.

```typescript
const dialect = await createConnection({
  dialect: 'hsqldb',
  uri: 'hsqldb:mem:testdb',
  schemaStrategy: 'create-drop',
})
```

---

## 12. Google Cloud Spanner

**Driver** : `@google-cloud/spanner`
**Idéal pour** : scalabilité mondiale, transactions distribuées à l'échelle globale

### Installation

```bash
npm install @google-cloud/spanner
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'spanner',
  uri: 'spanner://projects/my-project/instances/my-instance/databases/my-database',
  schemaStrategy: 'update',
  options: {
    credentials: {
      client_email: '...',
      private_key: '...',
    }
  }
})
```

### Authentification

```bash
# Via fichier de compte de service
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Via gcloud CLI
gcloud auth application-default login
```

### Formats d'URI Spanner

```env
SGBD_URI=spanner://projects/my-gcp-project/instances/my-instance/databases/mydb
```

### Notes importantes

- Nécessite un compte GCP avec l'API Spanner activée
- Facturation à l'usage — voir tarifs Google Cloud
- Excellent pour les applications nécessitant une cohérence globale forte
- Interleaved tables pour les relations parent-enfant (performance)

---

## 13. Sybase / SAP ASE

**Driver** : `mssql` (protocole compatible TDS)
**Idéal pour** : migration depuis Sybase, environnements SAP ASE legacy

### Installation

```bash
npm install mssql
```

### Configuration

```typescript
const dialect = await createConnection({
  dialect: 'sybase',
  uri: 'sybase://user:password@localhost:5000/mydb',
  schemaStrategy: 'update',
})
```

### Notes importantes

- Utilise le protocole TDS (compatible avec le driver `mssql`)
- SAP ASE (Adaptive Server Enterprise) — anciennement Sybase ASE
- SQL proche de T-SQL (Microsoft SQL Server)

---

## 14. Variables d'environnement communes

Ces variables s'appliquent à tous les dialectes :

```env
# === Connexion (obligatoires) ===
DB_DIALECT=sqlite             # Dialecte (voir liste ci-dessus)
SGBD_URI=./data/myapp.db      # URI de connexion

# === Schema management (hibernate.hbm2ddl.auto) ===
DB_SCHEMA_STRATEGY=update     # none | validate | update | create | create-drop

# === Logging SQL (hibernate.show_sql / format_sql) ===
DB_SHOW_SQL=false             # true = affiche les requêtes dans la console
DB_FORMAT_SQL=false           # true = indente les requêtes affichées

# === Connection pool (hibernate.connection.pool_size) ===
DB_POOL_SIZE=10               # Nombre maximum de connexions simultanées

# === Cache de requêtes (hibernate.cache.use_second_level) ===
DB_CACHE_ENABLED=false        # true = active le cache en mémoire
DB_CACHE_TTL=60               # Durée de vie du cache en secondes

# === Performance ===
DB_BATCH_SIZE=25              # Taille des lots pour les opérations bulk
```

---

## 15. Comparaison des fonctionnalités

| Fonctionnalité | SQLite | PostgreSQL | MySQL | MariaDB | MongoDB | MSSQL | Oracle |
|----------------|--------|-----------|-------|---------|---------|-------|--------|
| CRUD complet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Relations JOIN | ✅ | ✅ | ✅ | ✅ | ✅ (populate) | ✅ | ✅ |
| Agrégations | ✅ | ✅ | ✅ | ✅ | ✅ (pipeline) | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ (4.0+) | ✅ | ✅ |
| Full-text search | LIKE | `tsvector` | FULLTEXT | FULLTEXT | `$text` | CONTAINS | CONTAINS |
| JSON natif | TEXT | JSONB | JSON | JSON | Natif | NVARCHAR | CLOB |
| Tableaux natifs | TEXT | `ARRAY[]` | TEXT | TEXT | Natif | TEXT | CLOB |
| Connexion pool | N/A | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SSL/TLS | N/A | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Schemaless | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Cloud managé | ❌ | Supabase, Neon | PlanetScale | ❌ | Atlas | Azure SQL | Oracle Cloud |
| Licence | Public domain | PostgreSQL | GPL/Commercial | GPL | SSPL | Commercial | Commercial |

---

## Choisir son dialecte

```
Développement/prototypage rapide → SQLite
Application web classique        → PostgreSQL (recommandé) ou MySQL
Entreprise Microsoft             → MSSQL ou CockroachDB
Données documentaires            → MongoDB
Grande scalabilité               → PostgreSQL + replicas ou CockroachDB
Scalabilité mondiale             → Google Cloud Spanner
Analytics temps réel             → SAP HANA
Écosystème IBM                   → DB2
```

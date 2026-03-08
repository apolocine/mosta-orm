# Plan de dev : SessionMostaORMFactory + Multi-Bridge + Auto-Start

> Auteur : Dr Hamid MADANI drmdh@msn.com
> Date : 2026-03-08
> Projet : @mostajs/orm (mosta-orm)

---

## Sommaire

1. [Analyse de l'existant](#1-analyse-de-lexistant)
2. [Schemas de connexion et comportement](#2-schemas-de-connexion-et-comportement)
3. [Renommage AbstractSqlDialect → SessionMostaORMFactory](#3-renommage)
4. [Multi-Bridge : plusieurs instances JDBC simultanees](#4-multi-bridge)
5. [Auto-Start controlable par .env](#5-auto-start)
6. [Protection contre boucles et processus orphelins](#6-protections)
7. [Variables .env](#7-variables-env)
8. [Plan d'implementation](#8-plan-dimplementation)
9. [Matrice de risques](#9-matrice-de-risques)

---

## 1. Analyse de l'existant

### 1.1 Architecture actuelle

```
factory.ts (getDialect/createConnection)
    │  singleton — UNE seule instance dialect a la fois
    ▼
AbstractSqlDialect (abstract-sql.dialect.ts)
    │  - connect() avec interception JDBC bridge
    │  - executeQuery() / executeRun() routage bridge ou natif
    │  - UN seul JdbcNormalizer (1 bridge, 1 port)
    ▼
Dialect concret (oracle.dialect.ts, hsqldb.dialect.ts...)
    │  - doConnect() / doExecuteQuery() / doExecuteRun()
    │  - SQL pur (types, quotes, placeholders)
    ▼
MostaJdbcBridge.java
    │  - UN seul processus Java sur port 8765
    ▼
SGBD cible
```

### 1.2 Problemes identifies

| # | Probleme | Detail |
|---|----------|--------|
| 1 | **Nom** | `AbstractSqlDialect` ne reflete pas son role de SessionFactory |
| 2 | **Mono-bridge** | Un seul bridge JDBC a la fois — impossible de connecter HSQLDB + Oracle simultanement |
| 3 | **Port fixe** | Port 8765 en dur — conflit si 2 bridges |
| 4 | **Auto-start non controlable** | Le bridge demarre toujours si JAR present — pas de choix |
| 5 | **Processus orphelins** | Si l'app crash, le process Java reste en memoire |
| 6 | **Boucle de demarrage** | Si le bridge echoue, il pourrait etre relance en boucle |

### 1.3 Mapping Hibernate

| Hibernate | @mostajs/orm actuel | @mostajs/orm propose |
|-----------|--------------------|--------------------|
| `Dialect` (SQL pur) | `AbstractSqlDialect` (SQL + connexion + bridge) | Dialect concret (SQL pur) |
| `SessionFactory` | `factory.ts` (getDialect) + `AbstractSqlDialect` (connect) | `SessionMostaORMFactory` |
| `ConnectionProvider` | Dans chaque dialect (doConnect) | Dans `SessionMostaORMFactory` (interception) |
| JDBC `DataSource` | `JdbcNormalizer` | `BridgeManager` (multi-instance) |

---

## 2. Schemas de connexion et comportement

### 2.1 Schema global — Vue d'ensemble de l'architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                            APPLICATION (SecuAccessPro)                                  │
│                                                                                         │
│   .env.local :                                                                          │
│     DB_DIALECT=hsqldb                                                                   │
│     SGBD_URI=hsqldb:hsql://localhost:9001/mydb                                          │
│     MOSTA_BRIDGE_AUTOSTART=true                                                         │
│     MOSTA_BRIDGE_PORT_INCREMENT=true                                                    │
└──────────────────────────────────┬──────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        factory.ts — createConnection()                                  │
│                                                                                         │
│   1. Lit DB_DIALECT + SGBD_URI depuis .env                                              │
│   2. Charge le dialect : import('hsqldb.dialect.js')                                    │
│   3. Appelle dialect.connect(config)                                                    │
│                                                                                         │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│   │            SessionMostaORMFactory.connect(config)                                │  │
│   │                                                                                  │  │
│   │   ┌─ JAR detecte dans jar_files/ ?                                               │  │
│   │   │                                                                              │  │
│   │   │  OUI ──┐     MOSTA_BRIDGE_AUTOSTART ?                                        │  │
│   │   │        │     ├── true   → BridgeManager.getOrCreate()                        │  │
│   │   │        │     ├── detect → Health check port → reutilise ou lance             │  │
│   │   │        │     └── false  → Erreur "Start bridge manually"                     │  │
│   │   │        │                                                                      │  │
│   │   │  NON ──┘──── doConnect() du dialect (driver npm)                              │  │
│   │   │              ex: import('oracledb') → createPool()                            │  │
│   │   │                                                                              │  │
│   │   │   executeQuery(sql, params) / executeRun(sql, params)                        │  │
│   │   │   ├── Bridge actif ? → HTTP POST vers BridgeManager                          │  │
│   │   │   └── Bridge inactif ? → doExecuteQuery() du dialect                         │  │
│   │   └──────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     BridgeManager (singleton global)                                    │
│                                                                                         │
│   bridges: Map<cle, BridgeInstance>                                                     │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│   │                                                                                  │  │
│   │  Cle                              Port    PID     JDBC URL                       │  │
│   │  ─────────────────────────────    ─────   ─────   ───────────────────────────    │  │
│   │  hsqldb:localhost:9001/mydb       8765    14201   jdbc:hsqldb:hsql://...         │  │
│   │  oracle:db.prod:1521/ORCLPDB1     8766    14305   jdbc:oracle:thin:@//...        │  │
│   │  db2:srv:50000/MYDB              8767    14410   jdbc:db2://...                  │  │
│   │                                                                                  │  │
│   │  nextPort: 8768                                                                  │  │
│   │  basePort: 8765 (MOSTA_BRIDGE_PORT_BASE)                                         │  │
│   │                                                                                  │  │
│   └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                         │
│   Protections :                                                                         │
│   ├── Anti-boucle : max 3 tentatives / 60s par cle                                     │
│   ├── PID files : jar_files/.bridge-{port}.pid                                          │
│   ├── Cleanup orphelins au demarrage                                                    │
│   └── process.on('exit') → stopAll()                                                    │
└───────────┬─────────────────────┬──────────────────────┬───────────────────────────────┘
            │                     │                      │
            ▼                     ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ MostaJdbcBridge  │  │ MostaJdbcBridge  │  │ MostaJdbcBridge  │
│ Java :8765       │  │ Java :8766       │  │ Java :8767       │
│                  │  │                  │  │                  │
│ POST /query      │  │ POST /query      │  │ POST /query      │
│ GET  /health     │  │ GET  /health     │  │ GET  /health     │
│                  │  │                  │  │                  │
│ -cp hsqldb.jar   │  │ -cp ojdbc11.jar  │  │ -cp db2jcc4.jar  │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │ JDBC                │ JDBC                │ JDBC
         ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   HSQLDB         │  │   Oracle DB      │  │   IBM DB2        │
│   :9001          │  │   :1521          │  │   :50000         │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### 2.2 Schema — Flux de connexion (decision tree)

```
                        connect(config) appele
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Dialect dans        │
                    │ JDBC_REGISTRY ?     │
                    │ (hsqldb/oracle/     │
                    │  db2/sybase/hana)   │
                    └──────┬──────────────┘
                           │
              NON ─────────┤────────── OUI
              │                        │
              ▼                        ▼
    ┌──────────────────┐    ┌──────────────────────┐
    │ doConnect()      │    │ JAR present dans     │
    │ du dialect       │    │ jar_files/ ?         │
    │                  │    └──────┬───────────────┘
    │ import('pg')     │           │
    │ import('mysql2') │  NON ─────┤────────── OUI
    │ import('mssql')  │  │                    │
    │ etc.             │  ▼                    ▼
    │                  │  ┌──────────┐  ┌───────────────────────┐
    │ npm driver natif │  │ doConnect│  │ MOSTA_BRIDGE_AUTOSTART│
    └──────────────────┘  │ du       │  │ = ?                   │
                          │ dialect  │  └──────┬────────────────┘
                          │ (npm)    │         │
                          │          │    ┌────┼────────┐
                          │ Si echec │    │    │        │
                          │ → erreur │  true  detect  false
                          │ "npm     │    │    │        │
                          │ install" │    ▼    ▼        ▼
                          └──────────┘   ┌─────────┐  ┌──────────────────┐
                                         │ Bridge  │  │ doConnect()      │
                                         │ Manager │  │ du dialect (npm) │
                                         │ .get    │  │                  │
                                         │  Or     │  │ Si echec :       │
                                         │ Create()│  │ "Start bridge    │
                                         └────┬────┘  │  manually or set │
                                              │       │  AUTOSTART=true" │
                                              ▼       └──────────────────┘
                                    ┌──────────────────────┐
                                    │ Bridge deja actif    │
                                    │ pour cette cle ?     │
                                    └──────┬───────────────┘
                                           │
                              OUI ─────────┤────────── NON
                              │                        │
                              ▼                        ▼
                    ┌──────────────────┐    ┌──────────────────────┐
                    │ Reutiliser       │    │ Port libre ?         │
                    │ le bridge        │    └──────┬───────────────┘
                    │ existant         │           │
                    │                  │  NON ─────┤────────── OUI
                    │ Pas de nouveau   │  │                    │
                    │ process Java     │  ▼                    ▼
                    └──────────────────┘  ┌──────────┐  ┌──────────────────┐
                                         │ INCRE-   │  │ Lancer           │
                                         │ MENT ?   │  │ MostaJdbcBridge  │
                                         │          │  │ .java            │
                                         │ true:    │  │                  │
                                         │ port++   │  │ java --source 11 │
                                         │          │  │ -cp JAR bridge   │
                                         │ false:   │  │ --port PORT      │
                                         │ ERREUR   │  │ --jdbc-url URL   │
                                         │ "Port    │  │                  │
                                         │ occupe"  │  │ Ecrire PID file  │
                                         └──────────┘  │ Attendre health  │
                                                       └────────┬─────────┘
                                                                │
                                                                ▼
                                                     ┌──────────────────────┐
                                                     │ Health check OK ?    │
                                                     └──────┬───────────────┘
                                                            │
                                               OUI ────────┤──────── NON
                                               │                     │
                                               ▼                     ▼
                                     ┌──────────────────┐  ┌───────────────────┐
                                     │ CONNECTE         │  │ Tentative < 3 ?   │
                                     │                  │  │                   │
                                     │ bridgeActive     │  │ OUI → retry       │
                                     │   = true         │  │ NON → ERREUR      │
                                     │ bridgeUrl        │  │ "Bridge failed    │
                                     │   = http://      │  │  3 times. Check   │
                                     │   localhost:PORT │  │  Java/JAR/SGBD"   │
                                     └──────────────────┘  └───────────────────┘
```

### 2.3 Schema — Execution des requetes (routage)

```
              Application : dialect.find({ name: 'test' })
                               │
                               ▼
              SessionMostaORMFactory
              ├── translateFilter() → WHERE "name" = ?
              ├── buildSelectColumns() → SELECT "id", "name"...
              ├── buildOrderBy() → ORDER BY ...
              └── buildLimitOffset() → LIMIT ... OFFSET ...
                               │
                               ▼  SQL genere par le dialect
                       ┌───────────────┐
                       │ executeQuery() │
                       └───────┬───────┘
                               │
                    ┌──────────┴──────────┐
                    │ jdbcBridgeActive ?  │
                    └──────────┬──────────┘
                               │
              true ────────────┤──────────── false
              │                               │
              ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │ bridgeExecuteQuery()│       │ doExecuteQuery()    │
    │                     │       │ du dialect concret  │
    │ HTTP POST           │       │                     │
    │ http://localhost:    │       │ PostgreSQL:         │
    │   PORT/query        │       │   pool.query(sql)   │
    │                     │       │                     │
    │ Body:               │       │ MySQL:              │
    │ {                   │       │   pool.execute(sql) │
    │   "sql": "SELECT.." │       │                     │
    │   "params": [...]   │       │ Oracle:             │
    │ }                   │       │   conn.execute(sql) │
    └─────────┬───────────┘       └──────────┬──────────┘
              │                               │
              ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │ MostaJdbcBridge     │       │ Driver npm natif    │
    │ (Java)              │       │ (pg/mysql2/mssql    │
    │                     │       │  oracledb/ibm_db    │
    │ PreparedStatement   │       │  @sap/hana-client)  │
    │ JDBC execute        │       │                     │
    │ → JSON response     │       │ Protocol natif      │
    └─────────┬───────────┘       └──────────┬──────────┘
              │                               │
              ▼                               ▼
    ┌─────────────────────┐       ┌─────────────────────┐
    │ SGBD via JDBC       │       │ SGBD via protocol   │
    │                     │       │ natif               │
    │ HSQLDB (HSQL)       │       │ PostgreSQL (TCP)    │
    │ Oracle (TNS)        │       │ MySQL (TCP)         │
    │ DB2 (DRDA)          │       │ MongoDB (BSON)      │
    │ Sybase (TDS)        │       │ SQLite (file)       │
    │ HANA (TCP)          │       │ Spanner (gRPC)      │
    └─────────────────────┘       └─────────────────────┘
```

### 2.4 Schema — Cycle de vie des bridges

```
    Demarrage Application
              │
              ▼
    ┌─────────────────────────────────────────────────────────┐
    │ BridgeManager.getInstance()                             │
    │                                                         │
    │ 1. Lire fichiers PID : jar_files/.bridge-*.pid          │
    │ 2. Pour chaque PID :                                    │
    │    ├── Process vivant ? → Tuer (orphelin)               │
    │    └── Process mort ? → Supprimer fichier PID           │
    │ 3. Enregistrer handlers :                               │
    │    ├── process.on('exit') → stopAll()                   │
    │    ├── process.on('SIGINT') → stopAll() + exit          │
    │    └── process.on('SIGTERM') → stopAll() + exit         │
    └──────────────────────────┬──────────────────────────────┘
                               │
                               ▼
    ┌──────────────── Vie de l'application ────────────────────┐
    │                                                          │
    │  connect(hsqldb) ──┐                                     │
    │                    ▼                                     │
    │         BridgeManager.getOrCreate('hsqldb:...')           │
    │         ├── Nouveau bridge → port 8765                   │
    │         └── Ecrire .bridge-8765.pid                      │
    │                                                          │
    │  connect(oracle) ──┐                                     │
    │                    ▼                                     │
    │         BridgeManager.getOrCreate('oracle:...')           │
    │         ├── Nouveau bridge → port 8766                   │
    │         └── Ecrire .bridge-8766.pid                      │
    │                                                          │
    │  connect(hsqldb) ──┐  (meme cle que le 1er)              │
    │                    ▼                                     │
    │         BridgeManager.getOrCreate('hsqldb:...')           │
    │         └── Bridge existe deja → REUTILISER port 8765    │
    │             (pas de nouveau process Java)                │
    │                                                          │
    │  disconnect(hsqldb) ──┐                                  │
    │                       ▼                                  │
    │         Le bridge N'EST PAS arrete                        │
    │         (d'autres connexions peuvent l'utiliser)          │
    │         bridgeActive = false sur CE dialect               │
    │                                                          │
    └──────────────────────────────────────────────────────────┘
                               │
                               ▼
    ┌─────────────────────────────────────────────────────────┐
    │ Arret Application (exit / SIGINT / SIGTERM / crash)     │
    │                                                         │
    │ BridgeManager.stopAll()                                  │
    │ ├── bridge hsqldb:8765 → kill(PID, SIGTERM)             │
    │ │   └── Supprimer .bridge-8765.pid                      │
    │ ├── bridge oracle:8766 → kill(PID, SIGTERM)             │
    │ │   └── Supprimer .bridge-8766.pid                      │
    │ └── bridges.clear()                                      │
    │                                                         │
    │ Si crash sans cleanup :                                  │
    │ ├── Fichiers .bridge-*.pid restent                       │
    │ └── Au prochain demarrage → cleanupOrphans() les tue    │
    └─────────────────────────────────────────────────────────┘
```

### 2.5 Schema — Messages d'erreur et diagnostics

```
    ┌──────────────────────────────────────────────────────────────────────────┐
    │                        ARBRE DES MESSAGES D'ERREUR                      │
    └──────────────────────────────────────────────────────────────────────────┘

    connect() appele
         │
         ▼
    JAR present ?
         │
    NON ─┤
         │  Driver npm disponible ?
         │  │
         │  OUI → doConnect() → Succes ✓
         │  │
         │  NON → ╔════════════════════════════════════════════════════╗
         │         ║ ERREUR: No driver found for {dialect}.            ║
         │         ║ Option 1: npm install {driver}                    ║
         │         ║ Option 2: Place {jar}*.jar in jar_files/          ║
         │         ║           and set MOSTA_BRIDGE_AUTOSTART=true     ║
         │         ╚════════════════════════════════════════════════════╝
         │
    OUI ─┤
         ▼
    MOSTA_BRIDGE_AUTOSTART ?
         │
    false ┤── Driver npm disponible ?
         │   │
         │   OUI → doConnect() (npm) → Succes ✓
         │   │
         │   NON → ╔════════════════════════════════════════════════════╗
         │          ║ ERREUR: JDBC bridge disabled.                     ║
         │          ║ Start manually:                                   ║
         │          ║   java --source 11 -cp {jar}                     ║
         │          ║     MostaJdbcBridge.java                          ║
         │          ║     --jdbc-url {jdbcUrl}                          ║
         │          ║     --port {port}                                 ║
         │          ║ Or set MOSTA_BRIDGE_AUTOSTART=true               ║
         │          ╚════════════════════════════════════════════════════╝
         │
    true/detect
         │
         ▼
    Java installe ?
         │
    NON ─┤── ╔════════════════════════════════════════════════════════╗
         │   ║ ERREUR: Java 11+ required for JDBC bridge.            ║
         │   ║ Install: sudo apt install openjdk-11-jre              ║
         │   ║ Or: sudo apt install default-jre                      ║
         │   ║ Verify: java --version                                ║
         │   ╚════════════════════════════════════════════════════════╝
         │
    OUI ─┤
         ▼
    Port libre ?
         │
    NON ─┤── INCREMENT active ?
         │   │
         │   OUI → port++ → retry
         │   │
         │   NON → ╔════════════════════════════════════════════════════╗
         │          ║ ERREUR: Port {port} already in use.               ║
         │          ║ Set MOSTA_BRIDGE_PORT_INCREMENT=true              ║
         │          ║ Or change MOSTA_BRIDGE_PORT_BASE                  ║
         │          ║ Or stop process using port {port}:                ║
         │          ║   lsof -i :{port}                                 ║
         │          ╚════════════════════════════════════════════════════╝
         │
    OUI ─┤
         ▼
    Lancement bridge...
         │
    Health check OK ?
         │
    NON ─┤── Tentatives < MAX_RETRIES ?
         │   │
         │   OUI → retry (compteur++)
         │   │
         │   NON → ╔════════════════════════════════════════════════════╗
         │          ║ ERREUR: JDBC bridge failed {n} times in 60s.     ║
         │          ║ Diagnostic:                                       ║
         │          ║   1. Java installed?  → java --version           ║
         │          ║   2. JAR valid?       → ls jar_files/{jar}*.jar  ║
         │          ║   3. SGBD running?    → check port {sgbdPort}    ║
         │          ║   4. Firewall?        → check port {bridgePort}  ║
         │          ║   5. Bridge log:      → stderr output above      ║
         │          ╚════════════════════════════════════════════════════╝
         │
    OUI ─┤
         ▼
    ╔═══════════════════════════════════════════════════════════════╗
    ║ SUCCES: Connected to {dialect} via JDBC bridge              ║
    ║ Bridge: http://localhost:{port}                              ║
    ║ JDBC:   {jdbcUrl}                                            ║
    ║ PID:    {pid}                                                ║
    ╚═══════════════════════════════════════════════════════════════╝
```

### 2.6 Schema — Comparaison driver npm vs JDBC bridge

```
    ┌─────────────────────────────────────────────────────────────────────┐
    │              CHEMIN A : Driver npm natif                            │
    │              (postgres, mysql, mariadb, mssql, cockroachdb)         │
    │                                                                     │
    │   SecuAccessPro                                                     │
    │        │                                                            │
    │        ▼                                                            │
    │   SessionMostaORMFactory                                            │
    │        │  connect()                                                 │
    │        ▼                                                            │
    │   doConnect()                                                       │
    │        │  import('pg')                                              │
    │        ▼                                                            │
    │   ┌──────────┐     Protocol natif (TCP)     ┌──────────────┐       │
    │   │ npm      │ ──────────────────────────── │ PostgreSQL   │       │
    │   │ driver   │                               │ Server       │       │
    │   │ (pg)     │     Latence : ~0.1ms          │ :5432        │       │
    │   └──────────┘                               └──────────────┘       │
    │                                                                     │
    │   Avantages : Direct, rapide, zero overhead                         │
    │   Inconvenients : Depend de npm, parfois binaires C++               │
    └─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────┐
    │              CHEMIN B : JDBC Bridge                                 │
    │              (hsqldb, oracle, db2, sybase, hana)                    │
    │                                                                     │
    │   SecuAccessPro                                                     │
    │        │                                                            │
    │        ▼                                                            │
    │   SessionMostaORMFactory                                            │
    │        │  connect()                                                 │
    │        ▼                                                            │
    │   BridgeManager.getOrCreate()                                       │
    │        │                                                            │
    │        ▼                                                            │
    │   ┌──────────┐  HTTP POST   ┌──────────────┐  JDBC   ┌─────────┐  │
    │   │ Node.js  │ ──────────── │ MostaJdbc    │ ─────── │ Oracle  │  │
    │   │ fetch()  │  localhost   │ Bridge.java  │  TCP    │ Server  │  │
    │   │          │  :8765       │              │  :1521  │         │  │
    │   └──────────┘              └──────────────┘         └─────────┘  │
    │                                                                     │
    │   Latence : ~1-2ms (HTTP localhost)                                 │
    │   Avantages : Zero npm binaire, driver officiel editeur (JDBC)      │
    │   Inconvenients : Process Java supplementaire                       │
    └─────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────┐
    │              CHEMIN C : Pas de driver disponible                    │
    │              (npm absent + JAR absent)                              │
    │                                                                     │
    │   SecuAccessPro                                                     │
    │        │                                                            │
    │        ▼                                                            │
    │   SessionMostaORMFactory                                            │
    │        │  connect()                                                 │
    │        ▼                                                            │
    │   ╔═══════════════════════════════════════════════════════════╗     │
    │   ║ ERREUR                                                    ║     │
    │   ║                                                           ║     │
    │   ║ No driver found for Oracle Database.                      ║     │
    │   ║                                                           ║     │
    │   ║ Option 1 (npm):                                           ║     │
    │   ║   npm install oracledb                                    ║     │
    │   ║                                                           ║     │
    │   ║ Option 2 (JDBC bridge):                                   ║     │
    │   ║   1. Download ojdbc11.jar from oracle.com                 ║     │
    │   ║   2. Place it in jar_files/                               ║     │
    │   ║   3. Set MOSTA_BRIDGE_AUTOSTART=true in .env              ║     │
    │   ╚═══════════════════════════════════════════════════════════╝     │
    └─────────────────────────────────────────────────────────────────────┘
```

### 2.7 Schema — Multi-bridge en action (exemple concret)

```
    Scenario : Application qui migre des donnees HSQLDB → Oracle

    .env.local :
      MOSTA_BRIDGE_AUTOSTART=true
      MOSTA_BRIDGE_PORT_BASE=8765
      MOSTA_BRIDGE_PORT_INCREMENT=true

    jar_files/ :
      hsqldb-2.7.2.jar
      ojdbc11.jar

    ┌───────────────────────────────────────────────────────────────────┐
    │  Code application :                                              │
    │                                                                   │
    │  // Connexion source (HSQLDB)                                    │
    │  const source = await createConnection({                          │
    │    dialect: 'hsqldb',                                             │
    │    uri: 'hsqldb:hsql://localhost:9001/legacy',                    │
    │  });                                                              │
    │  → BridgeManager lance bridge sur port 8765                      │
    │  → PID 14201, hsqldb-2.7.2.jar                                   │
    │                                                                   │
    │  // Connexion destination (Oracle)                                │
    │  const dest = await createConnection({                            │
    │    dialect: 'oracle',                                             │
    │    uri: 'oracle://system:pwd@db.prod:1521/ORCLPDB1',             │
    │  });                                                              │
    │  → BridgeManager lance bridge sur port 8766                      │
    │  → PID 14305, ojdbc11.jar                                        │
    │                                                                   │
    │  // Migration                                                    │
    │  const clients = await source.find(ClientSchema, {});             │
    │  //  → HTTP POST localhost:8765/query                             │
    │  //  → SELECT * FROM clients                                     │
    │                                                                   │
    │  for (const client of clients) {                                  │
    │    await dest.create(ClientSchema, client);                       │
    │    //  → HTTP POST localhost:8766/query                           │
    │    //  → INSERT INTO "clients" (...) VALUES (:1, :2, ...)        │
    │  }                                                                │
    │                                                                   │
    │  // Deconnexion                                                  │
    │  await source.disconnect();  // bridge 8765 reste actif           │
    │  await dest.disconnect();    // bridge 8766 reste actif           │
    │                                                                   │
    │  // A la sortie de l'app → BridgeManager.stopAll()               │
    │  // → kill 14201, kill 14305                                      │
    │  // → supprimer .bridge-8765.pid, .bridge-8766.pid               │
    └───────────────────────────────────────────────────────────────────┘

    Etat des ports pendant l'execution :

    Port    Process              JDBC URL                          PID file
    ─────   ──────────────────   ────────────────────────────────  ──────────────────
    8765    MostaJdbcBridge      jdbc:hsqldb:hsql://localhost/     .bridge-8765.pid
    8766    MostaJdbcBridge      jdbc:oracle:thin:@//db.prod/ORC   .bridge-8766.pid
    9001    HSQLDB Server        (natif)                            —
    1521    Oracle Server        (natif)                            —
```

---

## 3. Renommage AbstractSqlDialect → SessionMostaORMFactory

### 3.1 Justification

Dans Hibernate :
- `Dialect` = definition SQL pure (types, quotes, fonctions)
- `SessionFactory` = fabrique de sessions, gere le cycle de vie connexion

Notre `AbstractSqlDialect` fait les deux : SQL pur + connexion + bridge JDBC.
Le renommage reflete ce double role et aligne avec Hibernate.

### 2.2 Fichiers impactes

| Fichier | Modification |
|---------|-------------|
| `abstract-sql.dialect.ts` | Renommer la classe `AbstractSqlDialect` → `SessionMostaORMFactory` |
| | Renommer le fichier → `session-factory.ts` |
| `postgres.dialect.ts` | `extends SessionMostaORMFactory` |
| `mysql.dialect.ts` | `extends SessionMostaORMFactory` |
| `oracle.dialect.ts` | `extends SessionMostaORMFactory` |
| `mssql.dialect.ts` | `extends SessionMostaORMFactory` |
| `db2.dialect.ts` | `extends SessionMostaORMFactory` |
| `hana.dialect.ts` | `extends SessionMostaORMFactory` |
| `hsqldb.dialect.ts` | `extends SessionMostaORMFactory` |
| `spanner.dialect.ts` | `extends SessionMostaORMFactory` |
| `mariadb.dialect.ts` | Herite de MySQLDialect (pas de changement) |
| `cockroachdb.dialect.ts` | Herite de PostgresDialect (pas de changement) |
| `sybase.dialect.ts` | Herite de MSSQLDialect (pas de changement) |
| `JdbcNormalizer.ts` | Mettre a jour les commentaires |
| `index.ts` | Exporter `SessionMostaORMFactory` |

### 2.3 Retrocompatibilite

```typescript
// Dans session-factory.ts — alias pour retrocompatibilite
export { SessionMostaORMFactory as AbstractSqlDialect };
```

---

## 3. Multi-Bridge : plusieurs instances JDBC simultanees

### 3.1 Besoin

Pouvoir connecter simultanement :
- HSQLDB sur port 8765
- Oracle sur port 8766
- DB2 sur port 8767

Sans devoir arreter l'un pour demarrer l'autre.

### 3.2 Architecture proposee : BridgeManager (singleton global)

```
                       BridgeManager (singleton)
                       ┌──────────────────────────────────────┐
                       │ bridges: Map<string, BridgeInstance>  │
                       │                                      │
                       │ hsqldb:8765 → { process, url, pid }  │
                       │ oracle:8766 → { process, url, pid }  │
                       │ db2:8767    → { process, url, pid }  │
                       │                                      │
                       │ nextPort: 8768                        │
                       │ basePort: 8765                        │
                       └──────────┬───────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
  MostaJdbcBridge:8765    MostaJdbcBridge:8766    MostaJdbcBridge:8767
          │                       │                       │
          ▼                       ▼                       ▼
    HSQLDB :9001            Oracle :1521             DB2 :50000
```

### 3.3 Cle d'identification d'un bridge

Chaque bridge est identifie par une cle unique :

```
cle = `${dialect}:${host}:${port}/${database}`
```

Exemples :
- `hsqldb:localhost:9001/` → bridge sur port 8765
- `oracle:db.prod:1521/ORCLPDB1` → bridge sur port 8766
- `hsqldb:localhost:9001/testdb` → bridge sur port 8767 (autre base)

Cela permet :
- Deux connexions HSQLDB vers des bases differentes
- Reutiliser un bridge existant si meme cle (pas de duplication)

### 3.4 Incrementation des ports

```
Mode 1 : MOSTA_BRIDGE_PORT_INCREMENT=true (defaut)
─────────────────────────────────────────────────────
  1er bridge  → port 8765 (MOSTA_BRIDGE_PORT_BASE)
  2eme bridge → port 8766
  3eme bridge → port 8767
  ...

Mode 2 : MOSTA_BRIDGE_PORT_INCREMENT=false
─────────────────────────────────────────────────────
  Tous les bridges sur le meme port → ERREUR si 2eme bridge demande
  Utile si un seul SGBD JDBC a la fois
```

### 3.5 BridgeManager API

```typescript
class BridgeManager {
  // Singleton
  private static instance: BridgeManager;
  static getInstance(): BridgeManager;

  // Etat
  private bridges: Map<string, BridgeInstance>;
  private nextPort: number;

  // Obtenir ou creer un bridge pour un dialect/URI
  // Si le bridge existe deja (meme cle) → le reutilise
  // Si nouveau → lance un process Java sur le prochain port
  async getOrCreate(dialect, uri, options?): Promise<BridgeInstance>;

  // Arreter un bridge specifique
  async stop(key: string): Promise<void>;

  // Arreter TOUS les bridges (cleanup global)
  async stopAll(): Promise<void>;

  // Lister les bridges actifs
  list(): BridgeInstance[];

  // Verifier si un bridge existe pour cette cle
  has(key: string): boolean;
}

interface BridgeInstance {
  key: string;           // cle unique
  dialect: DialectType;
  port: number;          // port HTTP du bridge
  url: string;           // http://localhost:port
  pid: number;           // PID du process Java
  jdbcUrl: string;       // URL JDBC utilisee
  startedAt: Date;
  process: ChildProcess;
}
```

### 3.6 Integration avec SessionMostaORMFactory

```typescript
// Dans SessionMostaORMFactory.connect() :

async connect(config: ConnectionConfig): Promise<void> {
  // ...
  if (hasJdbcDriver(this.dialectType) && JdbcNormalizer.isAvailable(...)) {
    // Utilise le BridgeManager au lieu de creer un JdbcNormalizer directement
    const manager = BridgeManager.getInstance();
    this.bridgeInstance = await manager.getOrCreate(
      this.dialectType,
      config.uri,
      { jarDir, bridgeJavaFile }
    );
    this.jdbcBridgeActive = true;
  }
  // ...
}

async disconnect(): Promise<void> {
  // NE PAS arreter le bridge — d'autres dialects peuvent l'utiliser
  // Le bridge sera arrete par BridgeManager.stopAll() ou manuellement
  this.jdbcBridgeActive = false;
  this.bridgeInstance = null;
}
```

---

## 4. Auto-Start controlable par .env

### 4.1 Modes de fonctionnement

```
Mode 1 : MOSTA_BRIDGE_AUTOSTART=true (defaut si JAR present)
─────────────────────────────────────────────────────────────
  SessionMostaORMFactory.connect() lance automatiquement le bridge
  si un JAR JDBC est detecte pour le dialect.

  Comportement actuel — aucun changement.

Mode 2 : MOSTA_BRIDGE_AUTOSTART=false
─────────────────────────────────────────────────────────────
  Le bridge n'est JAMAIS lance automatiquement.
  L'utilisateur doit :
  a) Lancer le bridge manuellement :
     java --source 11 -cp hsqldb.jar MostaJdbcBridge.java --jdbc-url ...
  b) Ou utiliser le CLI :
     npx mosta-bridge start --dialect hsqldb --port 8765

  Le dialect tente de se connecter au bridge sur le port configure.
  Si le bridge n'est pas la → erreur claire.

Mode 3 : MOSTA_BRIDGE_AUTOSTART=detect (nouveau)
─────────────────────────────────────────────────────────────
  Avant de lancer un nouveau bridge :
  1. Verifier si un bridge tourne deja sur le port
  2. Si oui → le reutiliser (pas de nouveau process)
  3. Si non → le lancer automatiquement

  Evite les doublons apres un redemarrage de l'app.
```

### 4.2 Flux de decision au connect()

```
connect(config) appelé
        │
        ▼
  dialect est-il dans JDBC_REGISTRY ?
        │
   NON ─┤── ▶ doConnect() natif (npm driver)
        │
   OUI ─┤
        ▼
  MOSTA_BRIDGE_AUTOSTART ?
        │
  false ─┤── ▶ doConnect() natif (npm driver)
        │      Si echec ET JAR present :
        │      → message "Set MOSTA_BRIDGE_AUTOSTART=true or start bridge manually"
        │
  true ──┤── ▶ BridgeManager.getOrCreate()
        │      Lance un nouveau bridge si necessaire
        │
  detect ┤── ▶ Verifie si bridge deja sur le port
               │
          OUI ─┤── ▶ Reutilise le bridge existant
               │
          NON ─┤── ▶ Lance un nouveau bridge
```

### 4.3 Detection d'un bridge existant (mode detect)

```typescript
async function detectExistingBridge(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

---

## 5. Protection contre boucles et processus orphelins

### 5.1 Protection anti-boucle

| Risque | Scenario | Protection |
|--------|----------|------------|
| Relance infinie | Bridge crash → connect() relance → crash → relance... | Compteur de tentatives : max 3, puis erreur fatale |
| Start simultane | 2 connect() en parallele lancent 2 bridges sur le meme port | Mutex/lock dans BridgeManager |
| Port occupe | Le port est pris par un autre process | Verifier avant de lancer, incrementer si occupe |

```typescript
// Dans BridgeManager :

private startAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
private MAX_START_ATTEMPTS = 3;
private ATTEMPT_RESET_MS = 60_000; // reset compteur apres 1 minute

async getOrCreate(dialect, uri, options?): Promise<BridgeInstance> {
  const key = this.buildKey(dialect, uri);

  // Bridge deja actif ? → reutiliser
  if (this.bridges.has(key)) {
    const bridge = this.bridges.get(key)!;
    // Verifier qu'il est encore vivant
    if (await this.isAlive(bridge)) return bridge;
    // Mort → nettoyer et relancer
    this.bridges.delete(key);
  }

  // Protection anti-boucle
  const attempts = this.startAttempts.get(key);
  if (attempts) {
    const elapsed = Date.now() - attempts.lastAttempt.getTime();
    if (elapsed < this.ATTEMPT_RESET_MS && attempts.count >= this.MAX_START_ATTEMPTS) {
      throw new Error(
        `JDBC bridge for "${key}" failed ${this.MAX_START_ATTEMPTS} times ` +
        `in the last ${this.ATTEMPT_RESET_MS / 1000}s. Giving up.\n` +
        `Check Java installation, JAR file, and SGBD server.`
      );
    }
    if (elapsed >= this.ATTEMPT_RESET_MS) {
      this.startAttempts.delete(key); // Reset
    }
  }

  // Lancer le bridge
  try {
    const bridge = await this.startBridge(dialect, uri, options);
    this.startAttempts.delete(key); // Succes → reset compteur
    return bridge;
  } catch (e) {
    // Incrementer le compteur
    const current = this.startAttempts.get(key) || { count: 0, lastAttempt: new Date() };
    current.count++;
    current.lastAttempt = new Date();
    this.startAttempts.set(key, current);
    throw e;
  }
}
```

### 5.2 Protection processus orphelins

| Strategie | Detail |
|-----------|--------|
| **PID file** | Ecrire le PID dans `jar_files/.bridge-{port}.pid` au demarrage |
| **process.on('exit')** | Enregistrer un handler qui arrete tous les bridges a la sortie de Node |
| **process.on('SIGINT/SIGTERM')** | Idem pour Ctrl+C et kill |
| **uncaughtException** | Arreter les bridges meme en cas de crash |
| **Health check periodique** | Verifier toutes les 30s que les bridges sont vivants |
| **Cleanup au demarrage** | Verifier les PID files au demarrage, tuer les orphelins |

```typescript
// Dans BridgeManager constructor :

constructor() {
  // Cleanup global — arreter tous les bridges quand Node s'arrete
  const cleanup = () => this.stopAllSync();

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('uncaughtException', (err) => {
    console.error('[BridgeManager] Uncaught exception — stopping bridges', err);
    cleanup();
    process.exit(1);
  });

  // Nettoyer les orphelins du demarrage precedent
  this.cleanupOrphans();
}

private cleanupOrphans(): void {
  // Lire les fichiers .bridge-*.pid dans jar_files/
  // Pour chaque PID : verifier si le process existe encore
  // Si oui : le tuer (c'est un orphelin d'un run precedent)
  // Supprimer le fichier PID
}

private stopAllSync(): void {
  for (const [key, bridge] of this.bridges) {
    try { bridge.process.kill('SIGTERM'); } catch {}
    this.removePidFile(bridge.port);
  }
  this.bridges.clear();
}
```

### 5.3 PID File format

```
jar_files/.bridge-8765.pid
contenu : 12345
```

Au demarrage :
1. Lire `.bridge-8765.pid` → PID 12345
2. Verifier `kill(12345, 0)` → process existe ?
3. Si oui → tuer `kill(12345, 'SIGTERM')`
4. Supprimer le fichier `.bridge-8765.pid`
5. Le port 8765 est maintenant libre

---

## 6. Variables .env

### 6.1 Liste complete

```bash
# ============================================================
# JDBC Bridge — Configuration (.env.local)
# ============================================================

# Demarrage automatique du bridge JDBC (defaut: true)
# true    = lance le bridge si JAR present
# false   = ne lance jamais (demarrage manuel requis)
# detect  = reutilise un bridge existant ou en lance un nouveau
MOSTA_BRIDGE_AUTOSTART=true

# Port de base pour le premier bridge (defaut: 8765)
MOSTA_BRIDGE_PORT_BASE=8765

# Incrementation automatique des ports (defaut: true)
# true  = chaque bridge prend le port suivant (8765, 8766, 8767...)
# false = tous sur le meme port (erreur si conflit)
MOSTA_BRIDGE_PORT_INCREMENT=true

# Repertoire des fichiers JAR JDBC (defaut: auto-detect jar_files/)
MOSTA_JAR_DIR=/home/hmd/dev/MostaGare-Install/mostajs/jar_files

# Chemin vers MostaJdbcBridge.java (defaut: auto-detect bridge/)
MOSTA_BRIDGE_JAVA=/home/hmd/dev/MostaGare-Install/mostajs/mosta-orm/bridge/MostaJdbcBridge.java

# Nombre max de tentatives de demarrage avant abandon (defaut: 3)
MOSTA_BRIDGE_MAX_RETRIES=3

# Timeout en ms pour attendre que le bridge soit pret (defaut: 15000)
MOSTA_BRIDGE_TIMEOUT=15000
```

### 6.2 Exemple de configurations

#### Developpement local (multi-base)

```bash
MOSTA_BRIDGE_AUTOSTART=true
MOSTA_BRIDGE_PORT_INCREMENT=true
MOSTA_BRIDGE_PORT_BASE=8765
```

→ HSQLDB sur 8765, Oracle sur 8766 si besoin

#### Production (bridge demarrage manuel)

```bash
MOSTA_BRIDGE_AUTOSTART=false
```

→ L'admin lance le bridge avec systemd/docker
→ L'app se connecte au bridge deja en cours

#### CI/CD (detection)

```bash
MOSTA_BRIDGE_AUTOSTART=detect
MOSTA_BRIDGE_PORT_BASE=9900
```

→ Reutilise le bridge d'un test precedent si encore actif
→ Ports hauts pour eviter les conflits

---

## 7. Plan d'implementation

### Phase 1 : Renommage (faible risque)

| Etape | Fichier | Action | Complexite |
|-------|---------|--------|------------|
| 1.1 | `abstract-sql.dialect.ts` | Renommer classe → `SessionMostaORMFactory` | Simple |
| 1.2 | `abstract-sql.dialect.ts` | Ajouter alias `AbstractSqlDialect` pour retrocompatibilite | Simple |
| 1.3 | `abstract-sql.dialect.ts` | Renommer fichier → `session-factory.ts` | Simple |
| 1.4 | 8 dialects | Mettre a jour `import` et `extends` | Repetitif |
| 1.5 | `index.ts` | Ajouter export `SessionMostaORMFactory` | Simple |
| 1.6 | Commentaires | Mettre a jour les references dans JdbcNormalizer, docs | Simple |
| 1.7 | Build + test | `tsc` + verification | Validation |

### Phase 2 : BridgeManager multi-instance (risque moyen)

| Etape | Fichier | Action | Complexite |
|-------|---------|--------|------------|
| 2.1 | `src/bridge/BridgeManager.ts` | Creer la classe singleton BridgeManager | Moyen |
| 2.2 | `src/bridge/BridgeManager.ts` | Gestion des ports (base + increment) | Simple |
| 2.3 | `src/bridge/BridgeManager.ts` | Map des bridges actifs par cle | Simple |
| 2.4 | `src/bridge/BridgeManager.ts` | Reutilisation si meme cle | Simple |
| 2.5 | `session-factory.ts` | Remplacer JdbcNormalizer direct par BridgeManager | Moyen |
| 2.6 | `session-factory.ts` | `disconnect()` ne tue plus le bridge (BridgeManager gere) | Simple |
| 2.7 | `JdbcNormalizer.ts` | Deviens interne au BridgeManager (ou supprime) | Moyen |
| 2.8 | `index.ts` | Exporter BridgeManager | Simple |
| 2.9 | Build + test | Test avec 2 bridges simultanees | Validation |

### Phase 3 : Auto-Start controlable (risque moyen)

| Etape | Fichier | Action | Complexite |
|-------|---------|--------|------------|
| 3.1 | `src/bridge/BridgeManager.ts` | Lire MOSTA_BRIDGE_AUTOSTART depuis process.env | Simple |
| 3.2 | `session-factory.ts` | Implementer la logique true/false/detect | Moyen |
| 3.3 | `src/bridge/BridgeManager.ts` | Mode detect : health check avant lancement | Simple |
| 3.4 | `session-factory.ts` | Si autostart=false ET pas de driver npm → erreur claire | Simple |
| 3.5 | Build + test | Test des 3 modes | Validation |

### Phase 4 : Protections (risque faible)

| Etape | Fichier | Action | Complexite |
|-------|---------|--------|------------|
| 4.1 | `src/bridge/BridgeManager.ts` | Anti-boucle : compteur de tentatives + timeout | Moyen |
| 4.2 | `src/bridge/BridgeManager.ts` | PID files : ecriture au start, lecture au cleanup | Simple |
| 4.3 | `src/bridge/BridgeManager.ts` | Cleanup orphelins au demarrage du BridgeManager | Moyen |
| 4.4 | `src/bridge/BridgeManager.ts` | process.on('exit/SIGINT/SIGTERM') → stopAll | Simple |
| 4.5 | `src/bridge/BridgeManager.ts` | Detection port occupe avant lancement | Simple |
| 4.6 | Build + test | Test crash + restart + orphelins | Validation |

### Phase 5 : Documentation et cleanup

| Etape | Action | Complexite |
|-------|--------|------------|
| 5.1 | Mettre a jour jdbc-normalizer-study.md | Simple |
| 5.2 | Mettre a jour audit-dialects-vs-hibernate.md | Simple |
| 5.3 | Supprimer le backup `_hsqldb.dialect (copie).ts_` | Simple |
| 5.4 | Build final `tsc` + verification dist/ | Validation |

---

## 8. Matrice de risques

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Regression sur les dialects npm (pg, mysql2...) | Faible | Haut | Le renommage ne touche pas la logique, juste les noms |
| Port deja occupe | Moyen | Moyen | Detection avant lancement + increment |
| Process Java orphelin | Moyen | Faible | PID files + cleanup au demarrage + process.on('exit') |
| Boucle de relance | Faible | Haut | Compteur max 3 tentatives + timeout |
| Java non installe | Moyen | Moyen | Message d'erreur clair + mode autostart=false |
| 2 bridges meme JDBC URL | Faible | Moyen | Cle unique par bridge, reutilisation |
| Crash Node sans cleanup | Moyen | Moyen | PID files persistent + cleanup orphelins au restart |
| Trop de bridges ouverts | Faible | Moyen | Limite configurable (max 10 bridges) |

---

## Annexe : Structure finale des fichiers

```
mosta-orm/
├── src/
│   ├── index.ts
│   ├── core/
│   │   ├── types.ts
│   │   ├── factory.ts
│   │   ├── config.ts
│   │   ├── registry.ts
│   │   ├── base-repository.ts
│   │   ├── normalizer.ts
│   │   └── errors.ts
│   ├── dialects/
│   │   ├── session-factory.ts          ← ex abstract-sql.dialect.ts (renomme)
│   │   ├── mongo.dialect.ts
│   │   ├── sqlite.dialect.ts
│   │   ├── postgres.dialect.ts
│   │   ├── mysql.dialect.ts
│   │   ├── mariadb.dialect.ts
│   │   ├── oracle.dialect.ts
│   │   ├── mssql.dialect.ts
│   │   ├── cockroachdb.dialect.ts
│   │   ├── db2.dialect.ts
│   │   ├── hana.dialect.ts
│   │   ├── hsqldb.dialect.ts
│   │   ├── spanner.dialect.ts
│   │   └── sybase.dialect.ts
│   └── bridge/
│       ├── jdbc-registry.ts             ← table dialect → JAR → JDBC URL
│       ├── JdbcNormalizer.ts            ← lancement d'UN bridge (bas niveau)
│       └── BridgeManager.ts             ← NOUVEAU : singleton multi-bridge
├── bridge/
│   └── MostaJdbcBridge.java            ← bridge HTTP-JDBC universel
├── jar_files/                           ← JARs JDBC (gitignore)
│   ├── hsqldb-2.7.2.jar
│   ├── .bridge-8765.pid                 ← PID file (auto-genere)
│   └── .bridge-8766.pid
└── docs/
    ├── jdbc-normalizer-study.md
    ├── audit-dialects-vs-hibernate.md
    └── plan-session-factory-multi-bridge.md  ← ce document
```

###   Vos points :

  1. Le fichier .env ne peut pas être en dur

  Vous avez raison. Le BridgeManager lit déjà process.env dynamiquement — il 
  ne hardcode pas de fichier .env. Peu importe si c'est .env, .env.local, ou 
  .env.production, c'est Next.js (ou dotenv) qui charge les variables dans   
  process.env, et le BridgeManager les lit de là. Rien à changer côté ORM.

  2. Ne changer le port que si on change de SGBD — si même SGBD déjà lancé,
  ne pas relancer

  C'est exactement le comportement implémenté. Le BridgeManager.getOrCreate()
   utilise une clé unique par SGBD :

  clé = `${dialect}:${host}:${port}/${database}`

  - Même SGBD, même URI → la clé est identique → le bridge existant est
  réutilisé (pas de nouveau process, même port)
  - SGBD différent (ou URI différente) → nouvelle clé → nouveau bridge sur le
   port suivant

  Laissez-moi ajuster le BridgeManager pour renforcer cette logique — le port
   ne doit s'incrémenter qu'au lancement d'un nouveau bridge, pas à chaque
  appel.

● Read 1 file (ctrl+o to expand)

● La logique est déjà correcte. Récapitulons le flux :

  1. getOrCreate("hsqldb", "hsqldb:hsql://localhost:9001/") → clé =
  hsqldb:localhost:9001/ → nouveau bridge port 8765
  2. getOrCreate("hsqldb", "hsqldb:hsql://localhost:9001/") → même clé →
  réutilise bridge port 8765 (pas de relancement)
  3. getOrCreate("oracle", "oracle://host:1521/db") → clé différente →
  nouveau bridge port 8766
  4. getOrCreate("oracle", "oracle://host:1521/db") → même clé → réutilise
  bridge port 8766

  Le port ne s'incrémente que quand un nouveau SGBD distinct est connecté. Si
   le même SGBD est déjà lancé, il est réutilisé directement sans toucher aux
   ports.

  La compilation TypeScript passe sans erreurs. Les phases 2-4 du plan sont
  implémentées dans BridgeManager.ts :
  - Multi-bridge avec clé unique par SGBD
  - Autostart contrôlable via process.env.MOSTA_BRIDGE_AUTOSTART
  (true/false/detect)
  - Protection anti-boucle (max 3 tentatives en 60s)
  - PID files + cleanup orphelins au démarrage
  - process.on('exit/SIGINT/SIGTERM') → stopAll()
  - Détection port occupé avec incrémentation automatique


  Architecture JAR Upload                                                    
                                                                             
  Navigateur (ReconfigPanel)                                                 
      │  upload .jar via <input type="file">                                 
      ▼                                                                      
  POST /api/setup/upload-jar    (SecuAccessPro route)
      │  createUploadJarHandlers()
      ▼
  @mostajs/setup/api/upload-jar.route.ts    (route factory)
      │  import('@mostajs/orm')
      ▼
  @mostajs/orm/bridge/jar-upload.ts    (logique metier)
      │  saveJarFile() / deleteJarFile() / listJarFiles()
      ▼
  jar_files/hsqldb-2.7.2.jar    (fichier sauvegardé)

  Fichiers créés/modifiés

  ┌───────────┬───────────────────────────────────┬─────────────────────┐
  │  Package  │              Fichier              │       Action        │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ mosta-orm │ src/bridge/jar-upload.ts          │ Logique upload/dele │
  │           │                                   │ te/list/detect      │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ mosta-orm │ src/bridge/BridgeManager.ts       │ Multi-bridge        │
  │           │                                   │ singleton           │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ mosta-orm │ src/index.ts                      │ Exports ajoutés     │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ mosta-orm │ README.md                         │ Section JDBC Bridge │
  │           │                                   │  + JAR Upload       │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ mosta-set │ api/upload-jar.route.ts           │ Route factory       │
  │ up        │                                   │ GET/POST/DELETE     │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ mosta-set │                                   │ 13 dialects +       │
  │ up        │ components/ReconfigPanel.tsx      │ premium badge +     │
  │           │                                   │ section upload JAR  │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ mosta-set │ README.md                         │ Route upload-jar    │
  │ up        │                                   │ documentée          │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ SecuAcces │ src/app/api/setup/upload-jar/rout │ Route Next.js       │
  │ sPro      │ e.ts                              │                     │
  ├───────────┼───────────────────────────────────┼─────────────────────┤
  │ SecuAcces │ src/app/dashboard/settings/reconf │ Ajout jarEndpoint   │
  │ sPro      │ ig/page.tsx                       │                     │
  └───────────┴───────────────────────────────────┴─────────────────────┘

  Versions publiées

  - @mostajs/orm@1.3.1 — avec BridgeManager, jar-upload,
  jar_files/hsqldb-2.7.2.jar
  - @mostajs/setup@1.3.1 — avec ReconfigPanel (13 dialects, premium, upload
  JAR)


                                                                             
  Page setup alignée avec ReconfigPanel                                      
                                                                             
  ┌───────────────┬──────────────────────┬──────────────────────────────┐    
  │ Modification  │    ReconfigPanel     │          Setup page          │
  ├───────────────┼──────────────────────┼──────────────────────────────┤    
  │ 13 dialects   │ Oui (corrigé avant)  │ Oui (déjà present)           │
  ├───────────────┼──────────────────────┼──────────────────────────────┤    
  │ Premium grisé │ Oui (opacity: 0.45,  │ Oui (opacity-40 grayscale,   │    
  │               │ badge "Premium")     │ badge "Premium")             │    
  ├───────────────┼──────────────────────┼──────────────────────────────┤
  │ Upload JAR    │ Oui (section         │ Oui (composant               │
  │               │ complète avec table) │ JarUploadSection inline)     │
  ├───────────────┼──────────────────────┼──────────────────────────────┤
  │ JDBC          │ Oui (JDBC_DIALECTS)  │ Oui (JDBC_DIALECTS)          │
  │ indicator     │                      │                              │
  ├───────────────┼──────────────────────┼──────────────────────────────┤
  │ Driver hint   │                      │ Corrigé: "Uploader           │
  │ hsqldb        │ N/A                  │ hsqldb*.jar" au lieu de "npm │
  │               │                      │  install hsqldb"             │
  └───────────────┴──────────────────────┴──────────────────────────────┘

  Les deux pages (setup initial + reconfiguration) sont maintenant alignées
  avec les mêmes fonctionnalités : 13 dialects, premium grisé, upload JAR
  pour les dialects JDBC.

✻ Worked for 1m 40s

❯ publie sur npm et install                                                  
                            
● Read 2 files (ctrl+o to expand)                                            
                                                             
● Les modifications de la page setup sont dans SecuAccessPro (pas dans les   
  packages npm). Mais mosta-setup n'a pas changé depuis la dernière          
  publication. Seul mosta-orm n'a pas changé non plus. Pas besoin de         
  republier — les versions 1.3.1 sont déjà installées et à jour.             
                                                                             
  Vérifions que tout est bien installé.                                      
                                     
● Bash(npm ls @mostajs/orm @mostajs/setup 2>&1 | head -10)                   
  ⎿  secuaccesspro@1.0.0 /home/hmd/dev/MostaGare-Install/SecuAccessPro       
     ├─┬ @mostajs/audit@1.0.3                                                
     │ └── @mostajs/orm@1.3.1 deduped                                        
     … +7 lines (ctrl+o to expand)                                           
                                                                             
● @mostajs/orm@1.3.1 et @mostajs/setup@1.3.1 sont déjà installés et à jour.
  Les packages n'ont pas changé — seule la page src/app/setup/page.tsx de    
  SecuAccessPro a été modifiée (premium + JAR upload), et c'est un fichier   
  local, pas un package npm.                                                 
                                                                             
  Rien à publier ni à installer — tout est déjà en place.
                                                                             
❯ la page setup devrait se trouvé dans mosta-setup                           
                                                                             
● Compris — la page setup doit être un composant dans mosta-setup, comme     
  ReconfigPanel. Voyons d'abord la page complète.
                                                        

# Etude : JdbcNormalizer — Bridge JDBC Universel pour @mostajs/orm

> Auteur : Dr Hamid MADANI drmdh@msn.com
> Date : 2026-03-07
> Projet : @mostajs/orm (mosta-orm)
> Contexte : SecuAccessPro utilise mosta-setup + mosta-orm pour se connecter a HSQLDB via un bridge HTTP-JDBC. Cette etude generalise le bridge a tous les SGBD accessibles via JDBC.

---

## 1. Contexte et problematique

### 1.1 Situation actuelle

@mostajs/orm supporte 13 SGBD via le pattern Hibernate (un dialect par SGBD). Chaque dialect utilise un driver npm natif pour se connecter :

| Dialect | Driver npm | Type connexion |
|---------|-----------|----------------|
| mongodb | mongoose | npm natif |
| sqlite | better-sqlite3 | npm natif |
| postgres | pg | npm natif |
| mysql | mysql2 | npm natif |
| mariadb | mariadb | npm natif |
| oracle | oracledb | npm natif (binaires C++) |
| mssql | mssql | npm natif |
| cockroachdb | pg | npm natif |
| db2 | ibm_db | npm natif (binaires C++) |
| hana | @sap/hana-client | npm natif |
| hsqldb | fetch (HTTP) | **bridge HTTP-JDBC** |
| spanner | @google-cloud/spanner | npm natif (gRPC) |
| sybase | mssql / sybase | npm natif |

### 1.2 Probleme identifie

- **HSQLDB** n'a aucun driver npm — il necessite un bridge Java (HTTP → JDBC)
- **Oracle** (`oracledb`) requiert des binaires C++ complexes a installer
- **DB2** (`ibm_db`) necessite des binaires IBM difficiles a compiler
- **Sybase** a un ecosysteme npm faible/instable
- **HANA** (`@sap/hana-client`) n'est disponible que via le registre SAP

Ces editeurs (Oracle, IBM, SAP, Sybase) investissent massivement dans leurs **drivers JDBC** (Java), pas dans npm.

### 1.3 Solution proposee

Un **JdbcNormalizer** — couche TypeScript qui :
1. Detecte automatiquement les JARs dans un repertoire `jar_files/`
2. Compose l'URL JDBC adaptee au dialect selectionne
3. Lance le bridge Java (`MostaJdbcBridge.java`) avec le bon classpath
4. Expose une interface HTTP identique pour tous les dialects JDBC

---

## 2. Architecture

### 2.1 Architecture actuelle (HSQLDB seulement)

```
SecuAccessPro (Next.js)
    |
    v
hsqldb.dialect.ts          <-- SQL specifique HSQLDB
    |
    v  HTTP POST /query { sql, params }
MostaJdbcBridge.java       <-- port 8765
    |
    v  JDBC
HSQLDB Server              <-- port 9001
```

Les 12 autres dialects utilisent chacun un driver npm different.

### 2.2 Architecture proposee (Normalizer universel)

```
SecuAccessPro (Next.js)
    |
    v
dialect.ts (inchange)      <-- SQL specifique (types, quotes, placeholders)
    |
    v
JdbcNormalizer.ts           <-- NOUVEAU : detecte JAR, compose JDBC URL, lance bridge
    |
    v  HTTP POST /query { sql, params }
MostaJdbcBridge.java        <-- port configurable (8765 par defaut)
    |                           classpath = jar detecte
    v  JDBC
SGBD cible                  <-- HSQLDB, Oracle, DB2, Sybase, HANA
```

### 2.3 Diagramme des couches

```
┌─────────────────────────────────────────────────────────────────────┐
│                     APPLICATION (SecuAccessPro)                     │
│                                                                     │
│  .env.local :  DB_DIALECT=oracle                                    │
│                SGBD_URI=oracle://system:pwd@localhost:1521/ORCLPDB1  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────────┐
│                    DIALECT (oracle.dialect.ts)                       │
│                                                                     │
│  - quoteIdentifier() → "column"                                     │
│  - getPlaceholder() → :1, :2                                        │
│  - fieldToSqlType() → VARCHAR2(4000), NUMBER, TIMESTAMP             │
│  - buildLimitOffset() → OFFSET n ROWS FETCH FIRST m ROWS ONLY      │
│  - executeQuery() → this.httpPost(sql, params)   <-- delègue au     │
│  - executeRun()   → this.httpPost(sql, params)       normalizer     │
│                                                                     │
│  Le SQL specifique reste INTACT — comme dans Hibernate               │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            v
┌─────────────────────────────────────────────────────────────────────┐
│                 JDBC NORMALIZER (JdbcNormalizer.ts)                  │
│                                                                     │
│  1. Lit le dialect demande (ex: "oracle")                           │
│  2. Cherche dans jar_files/ un JAR correspondant (ojdbc*.jar)       │
│  3. Compose l'URL JDBC : jdbc:oracle:thin:@//localhost:1521/ORCLPDB1│
│  4. Lance MostaJdbcBridge.java avec le bon classpath                │
│  5. Attend que le bridge soit pret (health check)                   │
│  6. Retourne le baseUrl HTTP (http://localhost:8765)                │
│                                                                     │
│  Table de correspondance :                                          │
│  ┌──────────┬──────────────┬──────────────────────────────────────┐ │
│  │ dialect  │ JAR pattern  │ JDBC URL template                    │ │
│  ├──────────┼──────────────┼──────────────────────────────────────┤ │
│  │ hsqldb   │ hsqldb*.jar  │ jdbc:hsqldb:hsql://host:port/db     │ │
│  │ oracle   │ ojdbc*.jar   │ jdbc:oracle:thin:@//host:port/db    │ │
│  │ db2      │ db2jcc*.jar  │ jdbc:db2://host:port/db             │ │
│  │ sybase   │ jconn*.jar   │ jdbc:sybase:Tds:host:port/db        │ │
│  │ hana     │ ngdbc*.jar   │ jdbc:sap://host:port                │ │
│  └──────────┴──────────────┴──────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            v  HTTP POST /query
┌─────────────────────────────────────────────────────────────────────┐
│              BRIDGE JAVA (MostaJdbcBridge.java)                     │
│                                                                     │
│  - Ecoute HTTP sur port 8765                                        │
│  - Recoit { "sql": "...", "params": [...] }                         │
│  - Execute via JDBC (PreparedStatement)                             │
│  - SELECT → retourne JSON array [{ col: val }, ...]                 │
│  - INSERT/UPDATE/DELETE → retourne { "changes": N }                 │
│  - GET /health → { "status": "ok", "jdbcUrl": "..." }              │
│                                                                     │
│  UNIVERSEL : le meme code Java pour tous les SGBD                   │
│  Seul le classpath (JAR) et l'URL JDBC changent                     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            v  JDBC
┌─────────────────────────────────────────────────────────────────────┐
│                         SGBD CIBLE                                  │
│                                                                     │
│  HSQLDB :9001  |  Oracle :1521  |  DB2 :50000                      │
│  Sybase :5000  |  HANA :30015                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Registre des drivers JDBC

### 3.1 HSQLDB (deja en place)

| Propriete | Valeur |
|-----------|--------|
| JAR | `hsqldb-2.7.2.jar` |
| Pattern de detection | `hsqldb*.jar` |
| Classe driver | `org.hsqldb.jdbc.JDBCDriver` |
| URL JDBC | `jdbc:hsqldb:hsql://<host>:<port>/<db>` |
| Port par defaut | 9001 |
| User par defaut | SA |
| Password par defaut | (vide) |
| Emplacement | `/home/hmd/dev/MostaGare-Install/mostajs/jar_files/hsqldb-2.7.2.jar` |
| Statut | Disponible et teste |

### 3.2 Oracle Database

| Propriete | Valeur |
|-----------|--------|
| JAR principal | `ojdbc11.jar` (JDK 11+) ou `ojdbc8.jar` (JDK 8+) ou `ojdbc17.jar` (JDK 17+) |
| Pattern de detection | `ojdbc*.jar` |
| Classe driver | `oracle.jdbc.OracleDriver` |
| URL JDBC (service) | `jdbc:oracle:thin:@//<host>:<port>/<service_name>` |
| URL JDBC (SID) | `jdbc:oracle:thin:@<host>:<port>:<SID>` (deprecie) |
| Port par defaut | 1521 |
| User par defaut | system |
| JARs compagnons | `orai18n.jar` (i18n), `ucp.jar` (pool), `oraclepki.jar` (wallet) |
| Telechargement | https://www.oracle.com/database/technologies/appdev/jdbc-downloads.html |
| Maven | `com.oracle.database.jdbc:ojdbc11` |

#### Versions disponibles

| Version DB | JAR | Java | Taille |
|-----------|-----|------|--------|
| 26ai (23.26.1.0.0) | ojdbc17.jar | JDK 17, 19, 21, 25 | 7.3 MB |
| 26ai (23.26.1.0.0) | ojdbc11.jar | JDK 11, 21 | 7.3 MB |
| 26ai (23.26.1.0.0) | ojdbc8.jar | JDK 8, 11 | 7.2 MB |
| 21c (21.21.0.0) | ojdbc11.jar | JDK 11, 17, 19, 21 | 5.0 MB |
| 21c (21.21.0.0) | ojdbc8.jar | JDK 8, 11 | 4.9 MB |
| 19c (19.30.0.0) | ojdbc10.jar | JDK 11, 17, 19, 21 | 4.4 MB |
| 19c (19.30.0.0) | ojdbc8.jar | JDK 8, 11, 17, 19, 21 | 4.3 MB |

**Recommandation** : `ojdbc11.jar` (26ai) — couvre JDK 11+ et toutes les versions DB recentes.

### 3.3 IBM DB2

| Propriete | Valeur |
|-----------|--------|
| JAR | `db2jcc4.jar` (JDBC 4+) |
| Pattern de detection | `db2jcc*.jar` |
| Classe driver | `com.ibm.db2.jcc.DB2Driver` |
| URL JDBC | `jdbc:db2://<host>:<port>/<database>` |
| Port par defaut | 50000 |
| User par defaut | db2inst1 (Linux), db2admin (Windows) |
| Telechargement | Inclus avec DB2, ou IBM Support |

### 3.4 SAP Sybase ASE

| Propriete | Valeur |
|-----------|--------|
| JAR | `jconn4.jar` (JDBC 4) |
| Pattern de detection | `jconn*.jar` |
| Classe driver | `com.sybase.jdbc4.jdbc.SybDriver` |
| URL JDBC | `jdbc:sybase:Tds:<host>:<port>/<database>` |
| Port par defaut | 5000 |
| User par defaut | sa |
| Telechargement | SAP Software Downloads (compte SAP requis) |

### 3.5 SAP HANA

| Propriete | Valeur |
|-----------|--------|
| JAR | `ngdbc.jar` |
| Pattern de detection | `ngdbc*.jar` |
| Classe driver | `com.sap.db.jdbc.Driver` |
| URL JDBC | `jdbc:sap://<host>:<port>[/?databaseName=<db>]` |
| Port par defaut | 3xx15 (ex: instance 00 = 30015) |
| User par defaut | SYSTEM |
| Maven | `com.sap.cloud.db.jdbc:ngdbc` |

### 3.6 Tableau recapitulatif

| Dialect | JAR pattern | URL JDBC | Port | User |
|---------|------------|----------|------|------|
| hsqldb | `hsqldb*.jar` | `jdbc:hsqldb:hsql://host:port/db` | 9001 | SA |
| oracle | `ojdbc*.jar` | `jdbc:oracle:thin:@//host:port/service` | 1521 | system |
| db2 | `db2jcc*.jar` | `jdbc:db2://host:port/db` | 50000 | db2inst1 |
| sybase | `jconn*.jar` | `jdbc:sybase:Tds:host:port/db` | 5000 | sa |
| hana | `ngdbc*.jar` | `jdbc:sap://host:port` | 30015 | SYSTEM |

---

## 4. Comparatif : Driver npm natif vs Bridge JDBC

### 4.1 Tableau comparatif general

| Critere | Driver npm natif | Bridge JDBC |
|---------|------------------|-------------|
| **Installation** | `npm install oracledb` (binaires C++, dependances OS) | Deposer un `.jar` dans `jar_files/` |
| **Prerequis** | Node.js + compilateur C++ + libs systeme | Java 11+ (JRE suffit) |
| **Compatibilite OS** | Variable (certains drivers ne compilent pas sur ARM, Alpine...) | Java = universel |
| **Performance** | Direct in-process (~0ms overhead) | +1-2ms latence HTTP par requete |
| **Fiabilite** | Variable (`ibm_db` crashe souvent, `oracledb` complexe) | JDBC = API de reference, testee par l'editeur |
| **Mise a jour driver** | `npm update` + potentielle recompilation | Remplacer le `.jar` |
| **Debugging** | Stack traces melangees JS/C++ | Stack traces Java claires |
| **Isolation** | In-process (crash = crash Node) | Process separe (crash bridge ≠ crash app) |
| **Memoire** | Partage le heap Node.js | Process Java separe (~50-100MB) |
| **Qualite driver** | Variable selon la communaute npm | Maintenu par l'editeur du SGBD |

### 4.2 Comparatif par SGBD

#### Oracle

| Critere | npm `oracledb` | Bridge + `ojdbc11.jar` |
|---------|----------------|------------------------|
| Installation | Necessite Oracle Instant Client (300MB+) | Deposer ojdbc11.jar (7.3MB) |
| Compilation | Binaires C++ precompiles ou a compiler | Aucune compilation |
| ARM/Alpine | Support partiel | Fonctionne partout ou Java tourne |
| Fonctionnalites | Bon support mais API specifique | JDBC complet (API native Oracle) |
| Documentation | npm README | Oracle Docs officielle (exhaustive) |
| **Verdict** | Complexe a installer | **Recommande** |

#### IBM DB2

| Critere | npm `ibm_db` | Bridge + `db2jcc4.jar` |
|---------|-------------|------------------------|
| Installation | Necessite CLI/ODBC driver IBM (~200MB) | Deposer db2jcc4.jar (~4MB) |
| Compilation | C++ bindings, souvent echoue | Aucune compilation |
| Stabilite | Crashs frequents, maintenance faible | JDBC stable, maintenu par IBM |
| **Verdict** | Tres problematique | **Fortement recommande** |

#### Sybase ASE

| Critere | npm `sybase` / `mssql` | Bridge + `jconn4.jar` |
|---------|------------------------|------------------------|
| Driver | `mssql` (partiel) ou `sybase` (abandonne) | jConnect officiel SAP |
| Compatibilite | SQL Server ≠ Sybase (differences subtiles) | Driver natif Sybase |
| Maintenance | Communaute faible | SAP maintient jConnect |
| **Verdict** | Ecosysteme faible | **Recommande** |

#### SAP HANA

| Critere | npm `@sap/hana-client` | Bridge + `ngdbc.jar` |
|---------|------------------------|----------------------|
| Installation | Registre SAP specifique | Maven Central ou SAP |
| API | Callback-based (ancien style) | JDBC standard |
| **Verdict** | Fonctionnel mais contraignant | **Alternative viable** |

### 4.3 Dialects qui restent en npm natif

Ces SGBD ont des drivers npm **excellents** — le bridge JDBC n'apporte rien :

| Dialect | Driver npm | Raison de rester en npm |
|---------|-----------|------------------------|
| mongodb | mongoose | NoSQL, pas de JDBC |
| sqlite | better-sqlite3 | Embarque, synchrone, rapide |
| postgres | pg | Driver npm mature, maintenu, performant |
| mysql | mysql2 | Driver npm solide, zero binaire |
| mariadb | mariadb | Driver npm natif, RETURNING support |
| mssql | mssql | Driver npm TDS adequat |
| cockroachdb | pg | Compatible PostgreSQL wire protocol |
| spanner | @google-cloud/spanner | Cloud-native gRPC, pas JDBC |

### 4.4 Impact sur les performances

```
Benchmark theorique (latence par requete) :

Driver npm natif :    ~0.1ms overhead (in-process)
Bridge JDBC HTTP :    ~1-2ms overhead (serialisation JSON + HTTP localhost)

Pour une application web typique :
- Requete DB simple : 5-50ms
- Overhead bridge : 1-2ms = 2-4% de plus
- Imperceptible pour l'utilisateur final

Le bridge est adapte aux applications metier (CRUD, dashboards, setup)
et non aux applications a haute frequence (trading, streaming temps reel).
```

---

## 5. Le Normalizer : specification technique

### 5.1 Responsabilites

Le `JdbcNormalizer` est le composant TypeScript qui :

1. **Detecte** les JARs disponibles dans le repertoire `jar_files/`
2. **Selectionne** le bon JAR selon le dialect demande
3. **Compose** l'URL JDBC a partir de l'URI applicative (SGBD_URI)
4. **Lance** le process Java `MostaJdbcBridge.java`
5. **Verifie** que le bridge est pret (health check)
6. **Arrete** le bridge proprement a la deconnexion
7. **Gere** les erreurs (JAR manquant, Java absent, port occupe...)

### 5.2 Registre de correspondance (jdbc-registry.ts)

```typescript
// bridge/jdbc-registry.ts

export interface JdbcDriverInfo {
  /** Glob pattern pour trouver le JAR dans jar_files/ */
  jarPattern: string;

  /** Template d'URL JDBC — les placeholders {host}, {port}, {db} sont remplaces */
  jdbcUrlTemplate: string;

  /** Port par defaut du SGBD */
  defaultPort: number;

  /** User par defaut */
  defaultUser: string;

  /** Password par defaut */
  defaultPassword: string;

  /** Classe du driver JDBC (pour information/log) */
  driverClass: string;

  /** Label affiche dans les logs */
  label: string;
}

export const JDBC_REGISTRY: Record<string, JdbcDriverInfo> = {
  hsqldb: {
    jarPattern:        'hsqldb*.jar',
    jdbcUrlTemplate:   'jdbc:hsqldb:hsql://{host}:{port}/{db}',
    defaultPort:       9001,
    defaultUser:       'SA',
    defaultPassword:   '',
    driverClass:       'org.hsqldb.jdbc.JDBCDriver',
    label:             'HyperSQL (HSQLDB)',
  },
  oracle: {
    jarPattern:        'ojdbc*.jar',
    jdbcUrlTemplate:   'jdbc:oracle:thin:@//{host}:{port}/{db}',
    defaultPort:       1521,
    defaultUser:       'system',
    defaultPassword:   'oracle',
    driverClass:       'oracle.jdbc.OracleDriver',
    label:             'Oracle Database',
  },
  db2: {
    jarPattern:        'db2jcc*.jar',
    jdbcUrlTemplate:   'jdbc:db2://{host}:{port}/{db}',
    defaultPort:       50000,
    defaultUser:       'db2inst1',
    defaultPassword:   'db2inst1',
    driverClass:       'com.ibm.db2.jcc.DB2Driver',
    label:             'IBM DB2',
  },
  sybase: {
    jarPattern:        'jconn*.jar',
    jdbcUrlTemplate:   'jdbc:sybase:Tds:{host}:{port}/{db}',
    defaultPort:       5000,
    defaultUser:       'sa',
    defaultPassword:   '',
    driverClass:       'com.sybase.jdbc4.jdbc.SybDriver',
    label:             'Sybase ASE',
  },
  hana: {
    jarPattern:        'ngdbc*.jar',
    jdbcUrlTemplate:   'jdbc:sap://{host}:{port}',
    defaultPort:       30015,
    defaultUser:       'SYSTEM',
    defaultPassword:   'manager',
    driverClass:       'com.sap.db.jdbc.Driver',
    label:             'SAP HANA',
  },
};
```

### 5.3 Normalizer (JdbcNormalizer.ts)

```typescript
// bridge/JdbcNormalizer.ts

import { spawn, ChildProcess } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';
import { JDBC_REGISTRY, JdbcDriverInfo } from './jdbc-registry.js';

export interface NormalizerConfig {
  dialect: string;
  host: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  bridgePort?: number;       // port HTTP du bridge (defaut: 8765)
  jarDir?: string;           // repertoire des JARs (defaut: jar_files/)
  bridgeJavaFile?: string;   // chemin vers MostaJdbcBridge.java
}

export class JdbcNormalizer {
  private process: ChildProcess | null = null;
  private bridgeUrl: string = '';
  private config: NormalizerConfig;
  private driverInfo: JdbcDriverInfo;

  constructor(config: NormalizerConfig) {
    this.config = config;
    const info = JDBC_REGISTRY[config.dialect];
    if (!info) {
      throw new Error(
        `Dialect "${config.dialect}" non supporte par le bridge JDBC.\n` +
        `Dialects disponibles : ${Object.keys(JDBC_REGISTRY).join(', ')}`
      );
    }
    this.driverInfo = info;
  }

  /** Detecter le JAR dans jar_files/ */
  findJar(): string {
    const jarDir = this.config.jarDir || join(__dirname, '../../jar_files');
    const pattern = this.driverInfo.jarPattern.replace('*', '');
    const files = readdirSync(jarDir).filter(f =>
      f.startsWith(pattern.replace('*.', '').replace('*', ''))
      && f.endsWith('.jar')
    );

    if (files.length === 0) {
      throw new Error(
        `Aucun JAR trouve pour "${this.driverInfo.label}".\n` +
        `Pattern recherche : ${this.driverInfo.jarPattern}\n` +
        `Repertoire : ${jarDir}\n` +
        `Deposez le JAR du driver JDBC dans ce repertoire.`
      );
    }

    // Prendre le plus recent (tri alphabetique = version la plus haute)
    files.sort();
    return join(jarDir, files[files.length - 1]);
  }

  /** Composer l'URL JDBC */
  composeJdbcUrl(): string {
    const port = this.config.port || this.driverInfo.defaultPort;
    return this.driverInfo.jdbcUrlTemplate
      .replace('{host}', this.config.host)
      .replace('{port}', String(port))
      .replace('{db}', this.config.database);
  }

  /** Lancer le bridge Java */
  async start(): Promise<string> {
    const jarPath = this.findJar();
    const jdbcUrl = this.composeJdbcUrl();
    const bridgePort = this.config.bridgePort || 8765;
    const user = this.config.user || this.driverInfo.defaultUser;
    const password = this.config.password ?? this.driverInfo.defaultPassword;

    const bridgeJava = this.config.bridgeJavaFile
      || join(__dirname, 'MostaJdbcBridge.java');

    // Lancer : java --source 11 -cp <jar> MostaJdbcBridge.java --jdbc-url ...
    this.process = spawn('java', [
      '--source', '11',
      '-cp', jarPath,
      bridgeJava,
      '--jdbc-url', jdbcUrl,
      '--user', user,
      '--password', password,
      '--port', String(bridgePort),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.bridgeUrl = `http://localhost:${bridgePort}`;

    // Attendre que le bridge soit pret
    await this.waitForReady(bridgePort, 10000);

    return this.bridgeUrl;
  }

  /** Attendre le health check */
  private async waitForReady(port: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${port}/health`);
        if (res.ok) return;
      } catch { /* bridge pas encore pret */ }
      await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(
      `Bridge JDBC non pret apres ${timeoutMs}ms sur le port ${port}`
    );
  }

  /** Arreter le bridge */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  /** URL du bridge HTTP */
  getBaseUrl(): string {
    return this.bridgeUrl;
  }
}
```

### 5.4 Flux de detection automatique

```
1. L'application demarre avec DB_DIALECT=oracle, SGBD_URI=oracle://system:pwd@db.local:1521/ORCLPDB1

2. factory.ts charge oracle.dialect.ts

3. oracle.dialect.ts (modifie) detecte qu'il doit utiliser le bridge JDBC :
   - Cree un JdbcNormalizer({ dialect: 'oracle', host: 'db.local', port: 1521, ... })

4. JdbcNormalizer :
   a. Consulte JDBC_REGISTRY['oracle'] → jarPattern = 'ojdbc*.jar'
   b. Scanne jar_files/ → trouve ojdbc11.jar
   c. Compose : jdbc:oracle:thin:@//db.local:1521/ORCLPDB1
   d. Lance : java --source 11 -cp ojdbc11.jar MostaJdbcBridge.java
              --jdbc-url "jdbc:oracle:thin:@//db.local:1521/ORCLPDB1"
              --user system --password pwd --port 8765
   e. Attend le health check sur http://localhost:8765/health

5. oracle.dialect.ts utilise httpPost('http://localhost:8765/query', { sql, params })
   → exactement comme hsqldb.dialect.ts le fait deja
```

---

## 6. Structure des fichiers

### 6.1 Arborescence actuelle

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
│   │   ├── normalizer.ts        <-- normalisation _id → id (existant, different)
│   │   └── errors.ts
│   └── dialects/
│       ├── abstract-sql.dialect.ts
│       ├── mongo.dialect.ts
│       ├── sqlite.dialect.ts
│       ├── postgres.dialect.ts
│       ├── mysql.dialect.ts
│       ├── mariadb.dialect.ts
│       ├── oracle.dialect.ts
│       ├── mssql.dialect.ts
│       ├── cockroachdb.dialect.ts
│       ├── db2.dialect.ts
│       ├── hana.dialect.ts
│       ├── hsqldb.dialect.ts
│       ├── spanner.dialect.ts
│       └── sybase.dialect.ts
├── bridge/
│   └── MostaJdbcBridge.java     <-- bridge HTTP-JDBC (cree)
└── jar_files/                   <-- (lien symbolique ou copie)
```

### 6.2 Arborescence apres implementation

```
mosta-orm/
├── src/
│   ├── index.ts                 <-- ajouter exports bridge
│   ├── core/
│   │   └── (inchange)
│   ├── dialects/
│   │   ├── abstract-sql.dialect.ts   <-- ajouter httpPost() factorise
│   │   ├── hsqldb.dialect.ts         <-- simplifie (herite httpPost)
│   │   ├── oracle.dialect.ts         <-- modifie : utilise bridge JDBC
│   │   ├── db2.dialect.ts            <-- modifie : utilise bridge JDBC
│   │   ├── sybase.dialect.ts         <-- modifie : utilise bridge JDBC
│   │   ├── hana.dialect.ts           <-- modifie : utilise bridge JDBC
│   │   └── (autres inchanges)
│   └── bridge/
│       ├── jdbc-registry.ts          <-- NOUVEAU : table dialect → JAR → JDBC URL
│       └── JdbcNormalizer.ts         <-- NOUVEAU : detecte JAR, lance bridge
├── bridge/
│   └── MostaJdbcBridge.java         <-- inchange (bridge universel)
└── docs/
    └── jdbc-normalizer-study.md      <-- ce document
```

---

## 7. Impact sur les dialects existants

### 7.1 Principe : les dialects restent inchanges dans leur SQL

Chaque dialect garde :
- Son `quoteIdentifier()` (", `, [])
- Son `getPlaceholder()` (?, $N, :N, @pN)
- Son `fieldToSqlType()` (VARCHAR2 vs VARCHAR vs NVARCHAR)
- Son `buildLimitOffset()` (LIMIT/OFFSET vs FETCH FIRST vs TOP)
- Son `serializeBoolean()` / `deserializeBoolean()`
- Son `getTableListQuery()`

Seule la couche **connexion/execution** change : au lieu d'importer un driver npm, le dialect delegue au bridge HTTP via `httpPost()`.

### 7.2 Modification type d'un dialect (exemple Oracle)

```
AVANT (oracle.dialect.ts) :
────────────────────────────
doConnect() → import('oracledb') → oracledb.createPool(uri)
executeQuery() → pool.execute(sql, params) → rows
executeRun() → pool.execute(sql, params) → { rowsAffected }

APRES (oracle.dialect.ts) :
────────────────────────────
doConnect() → new JdbcNormalizer({ dialect: 'oracle', ... }).start()
              → baseUrl = 'http://localhost:8765'
executeQuery() → fetch(baseUrl + '/query', { sql, params }) → rows
executeRun() → fetch(baseUrl + '/query', { sql, params }) → { changes }
```

Le SQL genere reste **identique** — seul le transport change.

### 7.3 Factorisation dans AbstractSqlDialect

Pour eviter la duplication du code HTTP entre hsqldb, oracle, db2, sybase, hana :

```
abstract-sql.dialect.ts (ajouter) :
────────────────────────────────────
protected bridgeUrl: string = '';
protected usesJdbcBridge: boolean = false;

protected async httpPost<T>(sql: string, params: unknown[]): Promise<T> {
  const response = await fetch(`${this.bridgeUrl}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Query failed (${response.status}): ${text}`);
  }
  return response.json() as Promise<T>;
}
```

Chaque dialect JDBC n'a plus qu'a :
1. Setter `this.usesJdbcBridge = true` dans son constructeur
2. Appeler le normalizer dans `doConnect()`
3. Utiliser `this.httpPost()` dans `executeQuery()` et `executeRun()`

---

## 8. Repertoire jar_files/

### 8.1 Convention de nommage

Le normalizer detecte les JARs par **prefixe de nom** :

```
jar_files/
├── hsqldb-2.7.2.jar       ← detecte par 'hsqldb*.jar'
├── ojdbc11.jar             ← detecte par 'ojdbc*.jar'
├── orai18n.jar             ← compagnon Oracle (optionnel)
├── db2jcc4.jar             ← detecte par 'db2jcc*.jar'
├── jconn4.jar              ← detecte par 'jconn*.jar'
└── ngdbc.jar               ← detecte par 'ngdbc*.jar'
```

### 8.2 Regles

1. Un seul JAR principal par SGBD (le normalizer prend le plus recent si plusieurs)
2. Les JARs compagnons (orai18n.jar, ucp.jar) sont ajoutes au classpath automatiquement
3. Le repertoire `jar_files/` est **gitignore** (les JARs sont proprietaires)
4. Un fichier `jar_files/README.md` explique ou telecharger chaque JAR

### 8.3 Classpath compose

Pour Oracle avec JARs compagnons :

```bash
java --source 11 \
  -cp "ojdbc11.jar:orai18n.jar:ucp.jar" \
  MostaJdbcBridge.java \
  --jdbc-url "jdbc:oracle:thin:@//localhost:1521/ORCLPDB1"
```

Le normalizer compose automatiquement le classpath en incluant tous les `.jar` du repertoire.

---

## 9. Plan d'implementation

### Phase 1 : Normalizer + Registre (priorite haute)

| Etape | Fichier | Action |
|-------|---------|--------|
| 1.1 | `src/bridge/jdbc-registry.ts` | Creer le registre des 5 drivers JDBC |
| 1.2 | `src/bridge/JdbcNormalizer.ts` | Creer le normalizer (detection JAR, lancement bridge, health check) |
| 1.3 | `bridge/MostaJdbcBridge.java` | Deja cree — aucune modification |
| 1.4 | `src/index.ts` | Exporter JdbcNormalizer et JDBC_REGISTRY |

### Phase 2 : Factoriser httpPost dans AbstractSqlDialect

| Etape | Fichier | Action |
|-------|---------|--------|
| 2.1 | `src/dialects/abstract-sql.dialect.ts` | Ajouter `httpPost()`, `bridgeUrl`, `usesJdbcBridge` |
| 2.2 | `src/dialects/hsqldb.dialect.ts` | Simplifier (supprimer httpPost local, utiliser celui du parent) |

### Phase 3 : Adapter les dialects JDBC (un par un)

| Etape | Dialect | Action |
|-------|---------|--------|
| 3.1 | `oracle.dialect.ts` | Remplacer `import('oracledb')` par JdbcNormalizer + httpPost |
| 3.2 | `db2.dialect.ts` | Remplacer `import('ibm_db')` par JdbcNormalizer + httpPost |
| 3.3 | `sybase.dialect.ts` | Remplacer `import('mssql')` par JdbcNormalizer + httpPost |
| 3.4 | `hana.dialect.ts` | Remplacer `import('@sap/hana-client')` par JdbcNormalizer + httpPost |

### Phase 4 : Tests et documentation

| Etape | Action |
|-------|--------|
| 4.1 | Test HSQLDB (deja fonctionnel) |
| 4.2 | Test Oracle (necessite ojdbc11.jar + Oracle DB) |
| 4.3 | Test DB2, Sybase, HANA (quand JARs disponibles) |
| 4.4 | Mettre a jour docs/dialects.md |
| 4.5 | Creer jar_files/README.md avec instructions de telechargement |

### Estimation des fichiers a creer/modifier

| Action | Fichier | Lignes estimees |
|--------|---------|-----------------|
| Creer | `src/bridge/jdbc-registry.ts` | ~60 lignes |
| Creer | `src/bridge/JdbcNormalizer.ts` | ~120 lignes |
| Modifier | `src/dialects/abstract-sql.dialect.ts` | +20 lignes |
| Modifier | `src/dialects/hsqldb.dialect.ts` | -15 lignes (simplification) |
| Modifier | `src/dialects/oracle.dialect.ts` | ~30 lignes modifiees |
| Modifier | `src/dialects/db2.dialect.ts` | ~30 lignes modifiees |
| Modifier | `src/dialects/sybase.dialect.ts` | ~20 lignes modifiees |
| Modifier | `src/dialects/hana.dialect.ts` | ~25 lignes modifiees |
| Existant | `bridge/MostaJdbcBridge.java` | 0 (inchange) |

---

## 10. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Java non installe sur la machine | Bridge ne demarre pas | Verifier `java --version` au demarrage, message d'erreur clair |
| JAR manquant dans jar_files/ | Connexion impossible | Message explicite avec lien de telechargement |
| Port bridge deja occupe | Conflit | Port configurable, detection de port libre |
| Bridge Java crash | Requetes echouent | Reconnexion automatique, relance du process |
| Latence HTTP | Performance | Negligeable (<2ms), acceptable pour apps metier |
| JARs proprietaires dans git | Probleme legal | `.gitignore` sur jar_files/, documentation des sources |

---

## 11. Conclusion

### Ce qui ne change pas

- Les 13 dialects SQL gardent leur logique Hibernate (types, quotes, placeholders)
- Les 8 dialects avec bons drivers npm (mongodb, sqlite, postgres, mysql, mariadb, mssql, cockroachdb, spanner) restent en npm natif
- Le bridge Java `MostaJdbcBridge.java` reste universel et inchange
- L'API publique de @mostajs/orm reste identique

### Ce qui est ajoute

- **JdbcNormalizer** : couche TypeScript qui detecte les JARs et lance le bridge
- **jdbc-registry** : table de correspondance dialect → JAR pattern → JDBC URL
- **httpPost factorise** dans AbstractSqlDialect pour eviter la duplication

### Benefice principal

Deposer un fichier `.jar` dans `jar_files/` suffit pour connecter n'importe quel SGBD JDBC — sans `npm install` de binaires C++, sans compilation, sans dependances systeme. Le normalizer fait le reste automatiquement.

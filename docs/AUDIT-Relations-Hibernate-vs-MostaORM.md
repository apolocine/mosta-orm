# Audit Relations — @mostajs/orm vs Hibernate ORM (3→6)
// Author: Dr Hamid MADANI drmdh@msn.com
// Date: 2026-04-06

---

## 1. Etat actuel @mostajs/orm

### 1.1 Types de relations (types.ts)

```typescript
type RelationType = 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';

interface RelationDef {
  target: string;       // entite cible
  type: RelationType;
  required?: boolean;
  nullable?: boolean;
  select?: string[];    // champs a projeter au populate
  through?: string;     // table de jointure (M2M SQL uniquement)
}
```

### 1.2 Ce qui manque vs Hibernate

| Propriete Hibernate | @mostajs/orm | Statut |
|---|---|---|
| `cascade` (PERSIST, MERGE, REMOVE, ALL) | Absent | **MANQUANT** |
| `orphanRemoval` | Absent | **MANQUANT** |
| `fetch` (LAZY, EAGER) | Absent (toujours eager) | **MANQUANT** |
| `mappedBy` (bidirectionnel) | Absent | **MANQUANT** |
| `joinColumn` / `inverseJoinColumn` | Absent (auto-genere) | **MANQUANT** |
| `onDelete` / `onUpdate` (CASCADE, SET NULL) | Absent | **MANQUANT** |

### 1.3 Comportement par dialect

#### SQL (abstract-sql.dialect.ts)

| Relation | Schema (DDL) | Create | Update | Delete | Read |
|---|---|---|---|---|---|
| **many-to-one** | Colonne FK (ID) sans FOREIGN KEY constraint | Stocke l'ID | Stocke l'ID | Supprime la ligne (pas de cascade) | findById sur FK |
| **one-to-one** | Colonne FK (ID) sans constraint | Stocke l'ID | Stocke l'ID | Supprime la ligne | findById sur FK |
| **one-to-many** | ⚠️ Colonne JSON (`DEFAULT '[]'`) | Stocke array JSON | Stocke array JSON | Supprime la ligne | Parse JSON + findById par ID |
| **many-to-many** | ✅ Table de jointure (sourceId, targetId) | Insert dans junction | Delete-all + re-insert | ⚠️ Supprime la ligne SANS nettoyer la junction | Query junction + findById |

#### MongoDB (mongo.dialect.ts)

| Relation | Schema | Create | Update | Delete | Read |
|---|---|---|---|---|---|
| **many-to-one** | ObjectId ref | Stocke ObjectId | Stocke ObjectId | Supprime le doc | .populate() |
| **one-to-one** | ObjectId ref | Stocke ObjectId | Stocke ObjectId | Supprime le doc | .populate() |
| **one-to-many** | Array [ObjectId ref] | Stocke array | Stocke array | Supprime le doc | .populate() |
| **many-to-many** | Array [ObjectId ref] | Stocke array | Stocke array | Supprime le doc | .populate() |

### 1.4 Bugs identifies

| # | Bug | Impact | Severite |
|---|---|---|---|
| 1 | ~~M2M SQL: `delete()` ne nettoie pas la table de jointure~~ | ~~Lignes orphelines dans junction~~ | ✅ **CORRIGE** |
| 2 | ~~M2M SQL: `update()` fait DELETE-ALL + re-INSERT~~ | ~~Performance catastrophique~~ | ✅ **CORRIGE** (diff-based) |
| 3 | ~~O2M SQL: stocke comme JSON au lieu d'utiliser FK sur la table enfant~~ | ~~Non-relationnel~~ | ✅ **CORRIGE** |
| 4 | ~~SQL: pas de FOREIGN KEY constraints dans le DDL~~ | ~~Aucune integrite referentielle~~ | ✅ **CORRIGE** |
| 5 | ~~SQL: populate utilise N+1 queries~~ | ~~Performances degradees~~ | ✅ **CORRIGE** (batch IN) |
| 6 | ~~M2M SQL: `create()` avec `roles: [id]` ne persiste PAS dans la junction~~ | ~~**Le bug actuel SecuAccessPro**~~ | ✅ **CORRIGE** |

---

## 2. Hibernate — Evolution de la gestion des relations (3→6)

### 2.1 Hibernate 3 (2005-2010)

- Configuration XML (`hbm.xml`) : `<set>`, `<bag>`, `<list>`, `<map>`
- Junction tables via `<join-table>`
- Cascade : `none`, `save-update`, `delete`, `all`, `all-delete-orphan`
- Fetch modes : `select` (N+1), `join`, `subselect`, `batch`
- API proprietaire (`Session.save()`, `Session.saveOrUpdate()`)

### 2.2 Hibernate 4 (2011-2015)

- Support complet JPA 2.0/2.1
- Annotations standard : `@OneToOne`, `@OneToMany`, `@ManyToOne`, `@ManyToMany`
- `@JoinTable(name, joinColumns, inverseJoinColumns)` standardise
- CascadeType enum : `PERSIST`, `MERGE`, `REMOVE`, `REFRESH`, `DETACH`, `ALL`
- `orphanRemoval = true` sur `@OneToOne` et `@OneToMany`
- `FetchType.LAZY` / `FetchType.EAGER`
- Defauts : M2O/O2O = EAGER, O2M/M2M = LAZY
- `mappedBy` pour les relations bidirectionnelles

### 2.3 Hibernate 5 (2015-2022)

- `@BatchSize` pour le batch fetching (resout N+1)
- `@Fetch(FetchMode.SUBSELECT)` pour le chargement efficace
- Distinction critique `PersistentSet` vs `PersistentBag` :
  - **Set** : DELETE cible par element → performant
  - **List/Bag** : DELETE-ALL + re-INSERT → destructif
- Bytecode enhancement pour le vrai lazy loading

### 2.4 Hibernate 6 (2022-present)

- Migration `javax.persistence` → `jakarta.persistence`
- `@SoftDelete` natif
- Meilleure generation SQL pour les collections
- UUID natif multi-dialect
- M2M avec Set : single DELETE par element supprime

### 2.5 Comment Hibernate gere chaque type de relation

#### @ManyToOne (la plus simple)

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "category_id", nullable = false)
private Category category;
```

- FK sur le cote "owning" (toujours)
- Default EAGER en JPA (mais LAZY recommande)
- Pas d'orphanRemoval

#### @OneToMany (la plus complexe)

```java
@OneToMany(mappedBy = "parent", cascade = CascadeType.ALL, orphanRemoval = true)
private Set<Child> children = new HashSet<>();
```

- **Bidirectionnel** (avec `mappedBy`) : FK est sur la table enfant
- **Unidirectionnel** (sans `mappedBy`) : Hibernate cree une junction table (anti-pattern)
- `orphanRemoval = true` : retirer un enfant de la collection le supprime de la DB

#### @ManyToMany (la plus delicate)

```java
@ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
@JoinTable(
    name = "student_course",
    joinColumns = @JoinColumn(name = "student_id"),
    inverseJoinColumns = @JoinColumn(name = "course_id")
)
private Set<Course> courses = new HashSet<>();
```

- **Toujours** une table de jointure
- **JAMAIS** CascadeType.REMOVE ou ALL sur M2M (supprimerait l'entite cible !)
- Utiliser **Set** (pas List) pour des DELETE cibles
- `orphanRemoval` NON supporte sur M2M

### 2.6 Propagation Hibernate (create/update/delete)

#### Sur persist (create) :
1. Insert parent
2. Si cascade PERSIST → persist recursif des entites dans les collections
3. M2M → INSERT dans la junction table pour chaque element
4. O2M avec mappedBy → set FK sur l'enfant, puis INSERT enfant

#### Sur merge (update) :
1. Update parent
2. Si cascade MERGE → merge recursif
3. M2M avec Set → compare ancien vs nouveau, genere INSERT/DELETE cibles
4. M2M avec List/Bag → DELETE ALL junction + re-INSERT (anti-pattern)

#### Sur remove (delete) :
1. Si cascade REMOVE → delete recursif
2. M2M → DELETE junction rows seulement (pas les entites cibles)
3. O2M avec orphanRemoval → DELETE entites enfants orphelines
4. DELETE parent en dernier

---

## 3. Verification P0 — Etat du code (2026-04-06)

### 3.1 P0-1 : M2M create — ✅ CORRIGE

**Fichier** : `abstract-sql.dialect.ts` lignes 967-989

Le `create()` detecte les champs M2M dans data, normalise l'input (array, CSV, ID unique), et insere dans la junction table apres l'INSERT principal. Fonctionne correctement.

```typescript
// Ligne 969 — boucle sur les relations du schema
for (const [relName, rel] of Object.entries(schema.relations || {})) {
  if (rel.type === 'many-to-many' && rel.through && data[relName] != null) {
    let relIds = data[relName];
    if (!Array.isArray(relIds)) {
      relIds = typeof relIds === 'string'
        ? (relIds as string).split(',').map(s => s.trim()).filter(Boolean)
        : [relIds];
    }
    // INSERT INTO junction (sourceId, targetId) VALUES (?, ?) — par element
  }
}
```

### 3.2 P0-2 : M2M delete — ✅ CORRIGE (2026-04-06)

**Fichiers modifies** : `abstract-sql.dialect.ts` (delete + deleteMany), `sqlite.dialect.ts` (herite maintenant de abstract)

Le cleanup M2M est effectue AVANT le DELETE principal. Teste sur 7 SGBD (231 tests).

**Code actuel (bugge)** :
```typescript
// Ligne 1061 — AUCUN nettoyage M2M avant le DELETE
async delete(schema: EntitySchema, id: string): Promise<boolean> {
  if (schema.softDelete) { /* ... soft delete ... */ }
  // Va directement au DELETE FROM table WHERE id = ?
  const sql = `DELETE FROM ${table} WHERE ${where.sql}`;
  const result = await this.executeRun(sql, where.params);
  return result.changes > 0;
}
```

**Fix requis** : ajouter avant le DELETE principal (ligne 1074) :
```typescript
// Cleanup M2M junction tables before hard delete
for (const [relName, rel] of Object.entries(schema.relations || {})) {
  if (rel.type === 'many-to-many' && rel.through) {
    this.resetParams();
    const sourceKey = `${schema.name.toLowerCase()}Id`;
    const ph = this.nextPlaceholder();
    await this.executeRun(
      `DELETE FROM ${this.quoteIdentifier(rel.through)} WHERE ${this.quoteIdentifier(sourceKey)} = ${ph}`,
      [id]
    );
  }
}
```

### 3.3 P0-3 : O2M SQL — ✅ CORRIGE (2026-04-06)

Le stockage O2M utilise une colonne JSON sur la table PARENT au lieu d'une FK sur la table ENFANT.

**6 endroits impactes dans abstract-sql.dialect.ts** :

| Lieu | Ligne | Comportement actuel | Comportement correct |
|---|---|---|---|
| DDL (createTable) | 709-710 | `cols.push(JSON DEFAULT '[]')` | Ne pas creer de colonne O2M |
| prepareInsertData | 606-616 | `JSON.stringify(data[name])` | Ignorer O2M (gere cote enfant) |
| update | 665-666 | `JSON.stringify(val)` | Ignorer O2M ou update FK sur enfants |
| deserializeRow | 344-345 | `parseJsonSafe(val, [])` | Ne pas deserialiser (pas de colonne) |
| populateRelations | 1283-1294 | Parse JSON + N findById | `SELECT * FROM child WHERE parentId = ?` |
| M2M update | 1012-1039 | Correct (DELETE + re-INSERT junction) | OK — pas concerne |

**Fix requis** — chaque lieu :

1. **DDL** (ligne 709) : `if (rel.type === 'one-to-many') continue;` (comme M2M)
2. **prepareInsertData** (ligne 602) : `if (rel.type === 'many-to-many' || rel.type === 'one-to-many') continue;`
3. **update** (ligne 663) : `if (rel.type === 'many-to-many' || rel.type === 'one-to-many') continue;`
4. **deserializeRow** (ligne 344) : supprimer le cas O2M JSON parse
5. **populateRelations** (ligne 1283) : remplacer le parse JSON par une query FK :
```typescript
} else if (relDef.type === 'one-to-many') {
  // Query enfants par FK inverse
  const fkColumn = relDef.mappedBy || `${schema.name.toLowerCase()}Id`;
  const children = await this.findAll(targetSchema, { [fkColumn]: result.id });
  result[relName] = children;
}
```

---

## 4. Plan d'implementation pour @mostajs/orm

### 4.1 Phase 1 — Corrections critiques (P0)

| # | Fix | Statut | Lignes |
|---|---|---|---|
| 1 | M2M create (junction insert) | ✅ **FAIT** | 967-989 |
| 2 | M2M delete (junction cleanup) | ✅ **FAIT** | 1074-1084 (abstract), herite par SQLite |
| 3 | O2M SQL (JSON → FK enfant) | ✅ **FAIT** | DDL, insert, update, deserialize, populate |

### 4.2 Phase 2 — Ameliorations (P1)

#### 4. Ajouter `cascade` et `mappedBy` a RelationDef

**Fichier** : `src/types.ts`

```typescript
interface RelationDef {
  target: string;
  type: RelationType;
  required?: boolean;
  nullable?: boolean;
  select?: string[];
  through?: string;
  // --- P1 ajouts ---
  cascade?: ('persist' | 'merge' | 'remove' | 'all')[];
  orphanRemoval?: boolean;   // O2O et O2M uniquement (comme Hibernate)
  fetch?: 'lazy' | 'eager';
  mappedBy?: string;         // FK inverse cote enfant (O2M bidirectionnel)
  joinColumn?: string;       // nom explicite de la colonne FK
  inverseJoinColumn?: string;// M2M : colonne cible dans junction
  onDelete?: 'cascade' | 'set-null' | 'restrict' | 'no-action';
}
```

**Regles Hibernate a respecter** :
- `cascade: ['remove']` ou `cascade: ['all']` — **JAMAIS** sur M2M (supprimerait l'entite cible)
- `orphanRemoval` — **NON supporte** sur M2M (comme Hibernate)
- `fetch` defaults : M2O/O2O = `'eager'`, O2M/M2M = `'lazy'`
- `mappedBy` requis pour O2M bidirectionnel (sinon Hibernate cree une junction = anti-pattern)

#### 5. FOREIGN KEY constraints dans le DDL

**Fichier** : `abstract-sql.dialect.ts`, methode `createTable()` apres les colonnes

**Implementation** :
```typescript
// Apres la creation de la table principale
const fkStatements: string[] = [];

for (const [name, rel] of Object.entries(schema.relations || {})) {
  if (rel.type === 'many-to-one' || rel.type === 'one-to-one') {
    const targetSchema = this.getSchemaByName(rel.target);
    const onDel = rel.onDelete || (rel.nullable ? 'set-null' : 'restrict');
    fkStatements.push(
      `ALTER TABLE ${q(schema.collection)} ADD CONSTRAINT fk_${schema.collection}_${name}` +
      ` FOREIGN KEY (${q(name)}) REFERENCES ${q(targetSchema.collection)}(id)` +
      ` ON DELETE ${onDel.toUpperCase().replace('-', ' ')}`
    );
  }
}

// Junction tables
for (const [name, rel] of Object.entries(schema.relations || {})) {
  if (rel.type === 'many-to-many' && rel.through) {
    const sourceKey = `${schema.name.toLowerCase()}Id`;
    const targetKey = `${rel.target.toLowerCase()}Id`;
    fkStatements.push(
      `ALTER TABLE ${q(rel.through)} ADD CONSTRAINT fk_${rel.through}_source` +
      ` FOREIGN KEY (${q(sourceKey)}) REFERENCES ${q(schema.collection)}(id) ON DELETE CASCADE`
    );
    fkStatements.push(
      `ALTER TABLE ${q(rel.through)} ADD CONSTRAINT fk_${rel.through}_target` +
      ` FOREIGN KEY (${q(targetKey)}) REFERENCES ${q(rel.target)}(id) ON DELETE CASCADE`
    );
  }
}
```

#### 6. M2M update avec diff (Set semantics a la Hibernate 5+)

**Fichier** : `abstract-sql.dialect.ts`, methode `update()` lignes 1012-1039

**Probleme actuel** : DELETE-ALL + re-INSERT (= `PersistentBag` Hibernate = anti-pattern)

**Solution** (= `PersistentSet` Hibernate = performant) :
```typescript
for (const [relName, rel] of Object.entries(schema.relations || {})) {
  if (rel.type === 'many-to-many' && rel.through && relName in data) {
    const sourceKey = `${schema.name.toLowerCase()}Id`;
    const targetKey = `${rel.target.toLowerCase()}Id`;

    // 1. Lire les IDs existants
    const existing = await this.executeQuery(
      `SELECT ${q(targetKey)} FROM ${q(rel.through)} WHERE ${q(sourceKey)} = ?`, [id]
    );
    const oldIds = new Set(existing.map(r => String(r[targetKey])));
    const newIds = new Set((data[relName] as string[]).map(String));

    // 2. Diff cible (comme PersistentSet.dirty())
    const toAdd = [...newIds].filter(x => !oldIds.has(x));
    const toRemove = [...oldIds].filter(x => !newIds.has(x));

    // 3. INSERT/DELETE cibles — O(delta) au lieu de O(n)
    for (const targetId of toAdd) {
      await this.executeRun(
        `INSERT INTO ${q(rel.through)} (${q(sourceKey)}, ${q(targetKey)}) VALUES (?, ?)`,
        [id, targetId]
      );
    }
    for (const targetId of toRemove) {
      await this.executeRun(
        `DELETE FROM ${q(rel.through)} WHERE ${q(sourceKey)} = ? AND ${q(targetKey)} = ?`,
        [id, targetId]
      );
    }
  }
}
```

### 4.3 Phase 3 — Optimisations (P2)

#### 7. Reduire N+1 queries (batch loading)

**Probleme** : chaque relation fait N findById individuels (lignes 1274-1294)

**Solution par type** :

```typescript
// M2O / O2O — LEFT JOIN dans le SELECT principal
// Au lieu de : findById(schema, refId)
// Faire :
`SELECT p.*, c.name AS "category.name", c.id AS "category.id"
 FROM products p
 LEFT JOIN categories c ON p.categoryId = c.id
 WHERE p.id = ?`

// M2M — JOIN sur la junction + IN clause
`SELECT t.* FROM ${targetTable} t
 JOIN ${junction} j ON t.id = j.${targetKey}
 WHERE j.${sourceKey} IN (${ids.map(() => '?').join(',')})`

// O2M — WHERE IN (batch des parents)
`SELECT * FROM ${childTable} WHERE ${fkColumn} IN (${parentIds.join(',')})`
```

**Gain** : passe de O(N*M) queries a O(1) par type de relation.

#### 8. Fetch strategy (lazy/eager)

**Defaults Hibernate** a reproduire :

| Type | Default | Raison |
|---|---|---|
| `many-to-one` | `eager` | Un seul objet, cout faible |
| `one-to-one` | `eager` | Un seul objet, cout faible |
| `one-to-many` | `lazy` | Collection potentiellement grande |
| `many-to-many` | `lazy` | Collection potentiellement grande |

**API** :
```typescript
// findById — ne charge que les relations eager par defaut
const user = await repo.findById('123');
// user.department = { id, name, ... }  (eager)
// user.roles = undefined                (lazy, pas charge)

// findWithRelations — charge explicite
const user = await repo.findById('123', { populate: ['roles'] });
// user.roles = [{ id, name, ... }, ...]

// Schema-level override
relations: {
  roles: { target: 'Role', type: 'many-to-many', through: 'user_roles', fetch: 'eager' }
}
```

---

## 5. Ordre de priorite (mis a jour 2026-04-06)

| # | Phase | Tache | Effort | Impact | Statut |
|---|---|---|---|---|---|
| 1 | P0 | Fix M2M create (junction insert) | 1j | **Debloque SecuAccessPro** | ✅ FAIT |
| 2 | P0 | Fix M2M delete (junction cleanup) | 0.5j | Integrite des donnees | ✅ FAIT |
| 3 | P0 | Fix O2M SQL (JSON → FK enfant) | 2j | Architecture correcte | ✅ FAIT |
| 4 | P1 | Ajouter `cascade`/`mappedBy` a RelationDef | 0.5j | Infrastructure | ✅ FAIT |
| 5 | P1 | FK constraints DDL | 1j | Integrite referentielle | ✅ FAIT |
| 6 | P1 | M2M update diff-based (Set semantics) | 1j | Performance | ✅ FAIT |
| 7 | P2 | Reduce N+1 (batch IN) | 2j | Performance | ✅ FAIT |
| 8 | P2 | Fetch strategy (lazy/eager) | 1j | API complete | ✅ FAIT |
| **Total plan** | | | **9j** | | **2/8 fait** |
| | | **Hors plan** | | | |
| 9 | — | Refactoring SQLite → extends AbstractSqlDialect | 0.5j | 1376→147 lignes | ✅ FAIT |
| 10 | — | Normalizer Oracle (UPPERCASE→lowercase) | 0.25j | Coherence cross-dialect | ✅ FAIT |
| 11 | — | Normalizer MongoDB (_id→id dans dialect) | 0.25j | Coherence cross-dialect | ✅ FAIT |
| 12 | — | Fix MSSQL (ORDER BY + dropAllTables) | 0.25j | MSSQL 33/33 tests | ✅ FAIT |
| 13 | — | Fix MariaDB (IPv6 parseUri) | 0.1j | MariaDB 33/33 tests | ✅ FAIT |
| 14 | — | Test suite 33 tests × 7 SGBD | 1j | 231 tests, 0 echec | ✅ FAIT |
| 15 | P0+P1 | Fix O2M architecture (6 points) + P1-4 RelationDef | 2.5j | O2M correct + cascade/mappedBy | ✅ FAIT |
| 16 | — | Fix O2M populate MongoDB (FK query) | 0.25j | Mongo O2M = meme API que SQL | ✅ FAIT |
| 17 | P1 | FK constraints DDL (generateForeignKeys) | 0.5j | Integrite referentielle | ✅ FAIT |
| 18 | P1 | M2M update diff-based (Set semantics) | 0.5j | O(delta) au lieu de O(n) | ✅ FAIT |
| 19 | P2 | Batch IN pour M2M populate | 0.25j | N+1 → 1 query | ✅ FAIT |
| 20 | P2 | Fetch strategy (getEagerRelations) | 0.25j | Auto-populate M2O/O2O eager | ✅ FAIT |
| **Total reel** | | | **~15.5j** | | **ALL DONE ✅** |

### Corrections supplementaires effectuees (2026-04-06)

| Fix | Fichier | Description |
|---|---|---|
| SQLite → AbstractSqlDialect | `sqlite.dialect.ts` | Refactoring: 1376 → 147 lignes, herite de l'abstract via normalizer sync→async |
| Oracle normalizer | `oracle.dialect.ts:doExecuteQuery` | Normalise UPPERCASE → lowercase dans doExecuteQuery (comme Mongo _id→id) |
| MongoDB normalizer | `mongo.dialect.ts:normalize()` | Normalise _id→id dans toutes les methodes CRUD du dialect (pas seulement BaseRepository) |
| MSSQL ORDER BY fix | `mssql.dialect.ts:buildLimitOffset` | Injecte `ORDER BY (SELECT NULL)` quand OFFSET/FETCH est utilise sans sort |
| MSSQL dropAllTables | `mssql.dialect.ts:dropAllTables` | Override: drop FK constraints d'abord, puis tables (MSSQL ne supporte pas CASCADE) |
| MariaDB IPv6 fix | `mariadb.dialect.ts:parseUri` | Strip crochets IPv6 `[::1]` → `::1` dans le hostname |
| IDialect executeQuery | `types.ts:IDialect` | Ajout `executeQuery?()` et `executeRun?()` optionnels dans l'interface |

### Tests multi-SGBD — 33 tests × 7 dialects = 231 tests

| SGBD | Driver | Resultat | Script |
|---|---|---|---|
| SQLite | better-sqlite3 | ✅ 33/33 | `test-full-sqlite.sh` |
| PostgreSQL | pg | ✅ 33/33 | `test-full-postgres.sh` |
| Oracle XE 21c | oracledb | ✅ 33/33 | `test-full-oracle.sh` |
| SQL Server 2022 | mssql | ✅ 33/33 | `test-full-mssql.sh` |
| CockroachDB | pg (herite Postgres) | ✅ 33/33 | `test-full-cockroach.sh` |
| MariaDB 10.6 | mariadb | ✅ 33/33 | `test-full-mariadb.sh` |
| MongoDB 7 | mongoose | ✅ 33/33 | `test-full-mongo.sh` |

Tests couverts : create, findById, find (filter/sort/limit/skip/select), findOne, update, updateMany, count, distinct, delete, deleteMany, soft-delete, findByIdWithRelations, findWithRelations, M2M junction, upsert, increment, search

### Dependances entre taches

```
P0-2 (M2M delete) ← aucune dependance, peut etre fait immediatement
P0-3 (O2M FK)     ← necessite P1-4 (mappedBy) pour O2M bidirectionnel
P1-4 (cascade)    ← aucune dependance
P1-5 (FK DDL)     ← necessite P1-4 (onDelete dans RelationDef)
P1-6 (M2M diff)   ← aucune dependance
P2-7 (N+1)        ← necessite P0-3 (O2M FK correct) et P1-6 (M2M diff)
P2-8 (fetch)       ← necessite P1-4 (fetch dans RelationDef)
```

**Ordre optimal** : P0-2 → P1-4 → P0-3 → P1-5 → P1-6 → P2-7 → P2-8

---

## 6. References

### Code source @mostajs/orm (lignes de reference)
- `abstract-sql.dialect.ts:967-989` — M2M create (junction insert) ✅
- `abstract-sql.dialect.ts:1074-1095` — delete() + deleteMany() avec cleanup M2M ✅
- `abstract-sql.dialect.ts:1012-1039` — M2M update (DELETE-ALL + re-INSERT)
- `abstract-sql.dialect.ts:709` — O2M DDL: `continue` (no column on parent) ✅
- `abstract-sql.dialect.ts:606` — O2M prepareInsertData: `continue` ✅
- `abstract-sql.dialect.ts:662` — O2M update: `continue` ✅
- `sqlite.dialect.ts` — refactorise: 147 lignes, extends AbstractSqlDialect ✅
- `oracle.dialect.ts:doExecuteQuery` — normalizer UPPERCASE → lowercase ✅
- `mongo.dialect.ts:normalize()` — normalizer _id → id dans le dialect ✅
- `mssql.dialect.ts:buildLimitOffset` — ORDER BY (SELECT NULL) pour OFFSET/FETCH ✅
- `mssql.dialect.ts:dropAllTables` — drop FK constraints avant tables ✅
- `mariadb.dialect.ts:parseUri` — strip IPv6 brackets ✅
- `abstract-sql.dialect.ts:344` — O2M deserialize: `[]` (no JSON parse) ✅
- `abstract-sql.dialect.ts:1322-1327` — O2M populate: `find(targetSchema, {fkColumn: id})` ✅
- `mongo.dialect.ts:findByIdWithRelations` — O2M: FK query sur child collection ✅
- `types.ts:RelationDef` — cascade, orphanRemoval, fetch, mappedBy, joinColumn, onDelete ✅

### Documentation Hibernate
- Hibernate 6 User Guide : https://docs.hibernate.org/orm/6.4/userguide/html_single/Hibernate_User_Guide.html
- Hibernate 6 Migration Guide : https://docs.hibernate.org/orm/6.0/migration-guide/

### Articles de reference
- Vlad Mihalcea — The best way to map a @OneToMany : https://vladmihalcea.com/the-best-way-to-map-a-onetomany-association-with-jpa-and-hibernate/
- Vlad Mihalcea — Cascade Types guide : https://vladmihalcea.com/a-beginners-guide-to-jpa-and-hibernate-cascade-types/
- Vlad Mihalcea — orphanRemoval : https://vladmihalcea.com/orphanremoval-jpa-hibernate/
- Baeldung — Hibernate Many to Many : https://www.baeldung.com/hibernate-many-to-many
- Baeldung — Cascade Types JPA/Hibernate : https://www.baeldung.com/jpa-cascade-types
- Baeldung — Eager/Lazy Loading : https://www.baeldung.com/hibernate-lazy-eager-loading
- Baeldung — Remove Entity with M2M : https://www.baeldung.com/jpa-remove-entity-many-to-many
- HowToDoInJava — Cascade Types : https://howtodoinjava.com/hibernate/hibernate-jpa-cascade-types/
- Thorben Janssen — Hibernate 6 Migration : https://thorben-janssen.com/things-to-know-when-migrating-to-hibernate-6-x/
- Hibernate Discourse — Why M2M removes all + reinserts : https://discourse.hibernate.org/t/2252
- JPA Buddy — Hibernate 6 What's New : https://jpa-buddy.com/blog/hibernate6-whats-new-and-why-its-important/


### perso
● Voici les 6 tâches restantes :

  ---
  P0 — Critique (reste 1)

  ┌─────┬────────────────────────────────┬────────┬───────────────────────┐
  │  #  │             Tâche              │ Effort │        Impact         │
  ├─────┼────────────────────────────────┼────────┼───────────────────────┤
  │ 3   │ Fix O2M SQL (JSON → FK enfant) │ 2j     │ Architecture correcte │
  └─────┴────────────────────────────────┴────────┴───────────────────────┘

  6 endroits à modifier dans abstract-sql.dialect.ts :
  - DDL (ligne 709) : ne pas créer de colonne JSON pour O2M
  - prepareInsertData (ligne 606) : ignorer O2M
  - update (ligne 665) : ignorer O2M
  - deserializeRow (ligne 344) : supprimer parse JSON
  - populateRelations (ligne 1283) : SELECT * FROM child WHERE parentId = ? au
  lieu de N+1
  - Nécessite mappedBy (P1-4) pour savoir quelle FK inverse utiliser

  ---
  P1 — Améliorations (reste 3)

  ┌─────┬─────────────────────────────────────┬────────┬────────────────────┐
  │  #  │                Tâche                │ Effort │       Impact       │
  ├─────┼─────────────────────────────────────┼────────┼────────────────────┤
  │     │ Ajouter                             │        │ Infrastructure     │
  │ 4   │ cascade/mappedBy/fetch/onDelete à   │ 0.5j   │ pour P0-3, P1-5,   │
  │     │ RelationDef                         │        │ P2-8               │
  ├─────┼─────────────────────────────────────┼────────┼────────────────────┤
  │ 5   │ FK constraints dans le DDL          │ 1j     │ Intégrité          │
  │     │                                     │        │ référentielle      │
  ├─────┼─────────────────────────────────────┼────────┼────────────────────┤
  │     │ M2M update diff-based (Set          │        │ Performance (évite │
  │ 6   │ semantics à la Hibernate 5+)        │ 1j     │  DELETE-ALL +      │
  │     │                                     │        │ re-INSERT)         │
  └─────┴─────────────────────────────────────┴────────┴────────────────────┘

  ---
  P2 — Optimisations (reste 2)

  ┌─────┬────────────────────────────┬────────┬─────────────────────────────┐
  │  #  │           Tâche            │ Effort │           Impact            │
  ├─────┼────────────────────────────┼────────┼─────────────────────────────┤
  │ 7   │ Réduire N+1 queries (batch │ 2j     │ Performance O(1) au lieu de │
  │     │  JOIN)                     │        │  O(N×M)                     │
  ├─────┼────────────────────────────┼────────┼─────────────────────────────┤
  │ 8   │ Fetch strategy             │ 1j     │ API complète, defaults      │
  │     │ (lazy/eager)               │        │ Hibernate                   │
  └─────┴────────────────────────────┴────────┴─────────────────────────────┘

  ---
  Ordre optimal

  P1-4 (cascade/mappedBy) → P0-3 (O2M FK) → P1-5 (FK DDL) → P1-6 (M2M diff) →
  P2-7 (N+1) → P2-8 (fetch)

  P1-4 est la prochaine étape — c'est le prérequis de P0-3 (il faut mappedBy
  pour savoir quelle FK utiliser côté enfant).

  Voulez-vous continuer avec P1-4 ?


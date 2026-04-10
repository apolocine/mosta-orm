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
| 1 | M2M SQL: `delete()` ne nettoie pas la table de jointure | Lignes orphelines dans junction | **CRITIQUE** |
| 2 | M2M SQL: `update()` fait DELETE-ALL + re-INSERT | Performance catastrophique sur grandes collections | HAUTE |
| 3 | O2M SQL: stocke comme JSON au lieu d'utiliser FK sur la table enfant | Non-relationnel, pas de contraintes, pas de JOIN | **CRITIQUE** |
| 4 | SQL: pas de FOREIGN KEY constraints dans le DDL | Aucune integrite referentielle | HAUTE |
| 5 | SQL: populate utilise N+1 queries | Performances degradees | MOYENNE |
| 6 | M2M SQL: `create()` avec `roles: [id]` ne persiste PAS dans la junction | **Le bug actuel SecuAccessPro** | **CRITIQUE** |

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

## 3. Plan d'implementation pour @mostajs/orm

### 3.1 Phase 1 — Corrections critiques (P0)

#### 1. Fix M2M create/update dans abstract-sql.dialect.ts

**Probleme** : le `create()` ne detecte pas les champs M2M dans les data et ne les insere pas dans la junction table.

**Solution** : dans `create()`, apres l'INSERT principal :
```
Pour chaque relation M2M dans le schema :
  Si data contient le champ relation (ex: data.roles = ['id1', 'id2']) :
    Pour chaque ID dans le tableau :
      INSERT INTO junction (sourceId, targetId) VALUES (newId, targetId)
    Supprimer le champ du data avant l'INSERT principal
```

#### 2. Fix M2M delete — nettoyer la junction table

**Solution** : dans `delete()`, avant le DELETE principal :
```
Pour chaque relation M2M dans le schema :
  DELETE FROM junction WHERE sourceId = id
```

#### 3. Fix O2M stockage en SQL

**Probleme** : O2M stocke comme JSON au lieu d'utiliser FK sur la table enfant.

**Solution** : ne pas creer de colonne pour O2M sur la table parent. Le chargement se fait via :
```sql
SELECT * FROM children WHERE parentId = ?
```

### 3.2 Phase 2 — Ameliorations (P1)

#### 4. Ajouter `cascade` a RelationDef

```typescript
interface RelationDef {
  // existants...
  cascade?: ('persist' | 'merge' | 'remove' | 'all')[];
  orphanRemoval?: boolean;
  fetch?: 'lazy' | 'eager';
  mappedBy?: string;
  joinColumn?: string;
  inverseJoinColumn?: string;
  onDelete?: 'cascade' | 'set-null' | 'restrict' | 'no-action';
}
```

#### 5. FOREIGN KEY constraints dans le DDL

```sql
-- M2O / O2O
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_client
  FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE SET NULL;

-- Junction table
ALTER TABLE user_roles ADD CONSTRAINT fk_ur_user
  FOREIGN KEY (sourceId) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_roles ADD CONSTRAINT fk_ur_role
  FOREIGN KEY (targetId) REFERENCES roles(id) ON DELETE CASCADE;
```

#### 6. M2M update avec diff (Set semantics)

Au lieu de DELETE-ALL + re-INSERT :
```
old = SELECT targetId FROM junction WHERE sourceId = id
new = data.roles
toAdd = new - old
toRemove = old - new
Pour chaque ID dans toAdd : INSERT INTO junction
Pour chaque ID dans toRemove : DELETE FROM junction
```

### 3.3 Phase 3 — Optimisations (P2)

#### 7. Reduire N+1 queries

- M2O : utiliser LEFT JOIN au lieu de findById
- M2M : `SELECT * FROM target JOIN junction ON ... WHERE junction.sourceId IN (...)`
- O2M : `SELECT * FROM children WHERE parentId IN (...)`

#### 8. Fetch strategy (lazy/eager)

- Default : LAZY pour O2M et M2M, EAGER pour M2O et O2O
- `findById` ne populate pas sauf si `fetch: 'eager'`
- `findWithRelations` = chargement explicite

---

## 4. Ordre de priorite

| # | Tache | Effort | Impact |
|---|---|---|---|
| 1 | Fix M2M create (junction insert) | 1j | **Debloque SecuAccessPro** |
| 2 | Fix M2M delete (junction cleanup) | 0.5j | Integrite des donnees |
| 3 | Ajouter `cascade` a RelationDef | 0.5j | Infrastructure |
| 4 | Fix O2M SQL (FK sur enfant) | 2j | Architecture correcte |
| 5 | FK constraints DDL | 1j | Integrite referentielle |
| 6 | M2M update diff-based | 1j | Performance |
| 7 | Reduce N+1 (JOIN) | 2j | Performance |
| 8 | Fetch strategy | 1j | API complete |
| **Total** | | **9j** | |

---

## 5. References

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

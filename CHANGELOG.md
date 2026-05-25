# Changelog

All notable changes to `@mostajs/orm` will be documented in this file.

## [2.2.3] — 2026-05-25

### Anomalie #8 — `populateRelations` ignorait `joinColumn`

Découverte au premier smoke du sample 11 (`lazy-vs-eager-fetch`) contre
2.2.2 : `findByIdWithRelations(['project'])` retournait `undefined` au
lieu de l'objet populé. Cause racine : `populateRelations`
(`abstract-sql.dialect.ts:1779`) lisait `result[relName]` (par ex.
`result['project']`) alors que la **colonne FK est `joinColumn`** (par
ex. `result['projectId']`). Casse latente depuis le fix #2 (2.2.0) qui
encourage l'usage de `joinColumn` pour avoir une vraie FK SQL déclarée.

Eager fetch (`fetch: 'eager'`) était aussi cassé pour la même raison
(`findById` appelle `populateRelations`).

#### Fixed

- `populateRelations` lit désormais `relDef.joinColumn || relName` pour
  récupérer la FK ; le résultat populé est déposé sur `relName` (peut
  différer de la colonne FK). La FK string reste préservée sur
  `result[joinColumn]` en parallèle de la propriété populée.

#### Tests

- `test-scripts/populate-joincolumn.test.mjs` :
  - `findByIdWithRelations(['project'])` retourne `project` populé +
    `projectId` string préservé
  - `fetch: 'eager'` populate automatiquement sans appeler
    `findByIdWithRelations`
- 122 tests existants verts → 124/124 au total

#### Impact API

Non-breaking. Code consumer qui s'appuyait sur le comportement cassé
(populate inopérant) gagne désormais la valeur correcte. Pas de
changement de signature.

**Auteur** : Dr Hamid MADANI <drmdh@msn.com>

---

## [2.2.2] — 2026-05-25

### Anomalie #7 — bugs silencieux résiduels traités

Audit systématique du code source via le scanner livré
`test-scripts/scan-silent-bugs.mjs` : **33 findings initiaux** (2 HIGH +
31 MEDIUM). Tous traités. Spec : `docs/ANOMALIES-LOT3-2026-05-25.md` §7.

#### Added

- **`test-scripts/scan-silent-bugs.mjs`** — scanner statique des bugs
  silencieux. 6 patterns détectés (EMPTY_CATCH, RETURN_NULL_IN_CATCH,
  BARE_NUMBER_IGNORE, TODO_FIXME_HACK, SILENT_RETURN_FALSE,
  CONSOLE_DROP). Annotation `// scan-ignore: <raison>` (sur la ligne du
  catch, au-dessus, ou dans le body) pour exclure un cas justifié.
  Exit code = nombre de findings HIGH. Modes texte coloré et JSON.

#### Fixed (visibilité runtime)

Remplacement des `catch {}` silencieux par `catch (e) { this.log(...) }`
dans les chemins d'opération best-effort — comportement préservé,
visibilité accrue.

- `abstract-sql.dialect.ts` :
  - `tableExists` — log si listing échoue
  - `truncateAll` × 2 — log par table skipped
  - `dropSchema` × 2 — log par table skipped
  - `dropAllTables` — log si listing/drop partiel
- `mongo.dialect.ts` :
  - `truncateAll` — log par collection skipped
  - `dropTable` — log si NamespaceNotFound (Mongo code 26)
  - `dropAllTables` — log par collection skipped
  - `dropSchema` — log par collection skipped
  - `testConnection` — log si ping fail
- `mysql.dialect.ts`, `oracle.dialect.ts`, `db2.dialect.ts`, `hana.dialect.ts` :
  - `executeIndexStatement` / CREATE INDEX — log "may already exist"
- `sqlite.dialect.ts`, `spanner.dialect.ts` :
  - `doTestConnection` / `testConnection` — log si SELECT 1 fail

#### Documented (`scan-ignore`)

Sentinelles légitimes documentées dans le code et le doc spec :

- `bridge/JdbcNormalizer.ts` `findJar` — null = pas de bridge dispo
- `validator/fixer.ts` `parseFindingContext` — null = JSON invalide (sentinelle JSDoc)
- `validator/fixer.ts` `removeFieldFromSchema` — fallback textuel
- `validator/fixer.ts` `fixR002_FK_NAMING` — JSON.parse fallback
- `bridge/BridgeManager.ts` × 7 — best-effort networking JDBC (health probes,
  port scans, PID files, orphan cleanup)
- `bridge/jar-upload.ts` — old JAR cleanup best-effort
- `core/factory.ts` — `pg_terminate_backend` pre-DROP DATABASE
- `dialects/abstract-sql.dialect.ts` — INSERT junction duplicate (set semantics)

#### Tests

- Scanner livré : `node test-scripts/scan-silent-bugs.mjs` → **0/0/0**
  (HIGH/MEDIUM/LOW)
- 122 tests existants verts (114 validator/introspection + 6 fix Lot 3 + 2 llms-coverage)

#### Impact API

Aucun. Logs supplémentaires only.

**Auteur** : Dr Hamid MADANI <drmdh@msn.com>

---

## [2.2.1] — 2026-05-25

### Anomalie #6 — `onDelete: 'cascade'` silencieusement ignoré sur SQLite

Découverte au premier smoke du sample 10 contre 2.2.0 : la cascade SQL
attendue ne se produisait pas. Cause racine : `generateForeignKeys`
utilisait `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` — syntaxe **non
supportée par SQLite**, et le `try/catch {}` swallow silencieusement
toutes les erreurs FK. Résultat : aucune FK n'était jamais créée sur
SQLite, `PRAGMA foreign_keys = ON` activé pour rien.

#### Fixed

- **SQLite : FK in-line dans `CREATE TABLE`** — nouveau hook
  `supportsAlterTableAddForeignKey()` (default `true` dans
  `AbstractSqlDialect`, override `false` dans `SQLiteDialect`).
  Quand `false` : `generateCreateTable` émet directement
  `FOREIGN KEY (col) REFERENCES table(id) ON DELETE …` dans la
  définition de table ; `generateForeignKeys` est skipped (avec log
  explicite "skipped — dialect emits FK in-line").

- **`generateForeignKeys` : catch non-silencieux** — remplacement
  des deux `catch {}` par `catch (e) { this.log('FK', `${name} skipped (${e.message})`) }`.
  Les erreurs ALTER TABLE FK sont désormais visibles dans les logs.

#### Tests

- `test-scripts/sqlite-fk-cascade.test.mjs` — verrouille le comportement
  cascade sur SQLite avec :
  - `PRAGMA foreign_key_list("profiles")` retourne 1 FK `ON DELETE CASCADE`
  - delete User → Profile lié supprimé en cascade SQL native
- 121 tests existants verts (validator + introspection + 5 fix Lot 3 + 2 llms-coverage)
- **122/122 verts**

#### Impact API

Non-breaking. Les schémas avec `relations[].onDelete` correctement
documentés gagnent automatiquement leurs FK cascade SQL (correction
silencieuse d'un bug). Aucune signature publique modifiée. La signature
interne `generateCreateTable(schema)` devient
`generateCreateTable(schema, allSchemas?)` (override-only, pas un
breaking change consumer).

**Auteur** : Dr Hamid MADANI <drmdh@msn.com>

---

## [2.2.0] — 2026-05-25

### Anomalies traitées — chantier Lot 3 samples

Cinq anomalies identifiées pendant la construction du Lot 3 des
`@mostajs/orm-samples` (samples 10-15 relations/lifecycle). Toutes traitées
à la cause racine, sans dette ni workaround consumer. Spec complète :
`docs/ANOMALIES-LOT3-2026-05-25.md`.

#### Added

- **`QueryOptions.includeDeleted?: boolean`** — bypass explicite du filtre
  automatique soft-delete sur les méthodes read (`find`, `findOne`,
  `findById`, `count`, `distinct`, `aggregate`, `search`, `findWithRelations`,
  `findByIdWithRelations`). Sans effet sur les schémas sans
  `softDelete: true`. Couvre SQL (13 dialects via `AbstractSqlDialect`) **et**
  MongoDB. Test : `test-scripts/soft-delete-include-deleted.test.mjs`.

- **Doc `ANOMALIES-LOT3-2026-05-25.md`** — spec complète des 5 anomalies
  avec symptôme, cause racine (fichier:ligne), solution avant/après, test,
  impact, et **audit par dialect** (5 anomalies × 13 dialects).

- **Lock-tests** pour comportements by-design / déjà corrects :
  - `test-scripts/findbyid-asymmetry.test.mjs` — `findById(string)` → `null`
    si introuvable vs `findById(objet invalide)` → `OrmIntrospectionError`
    (séparation programming error / expected absence).
  - `test-scripts/schema-strategy-create-drop.test.mjs` — `'create-drop'`
    drop bien les tables au `disconnect()` (Hibernate `hbm2ddl.auto`).

#### Fixed

- **`duplicate column name` quand FK déclarée 2×** (Anomalie #2) —
  `generateCreateTable` pré-calcule l'ensemble des colonnes FK générées
  par les relations (`joinColumn`), et **ignore silencieusement les fields
  homonymes**. La relation gagne (apporte le type id correct + FK natives).
  Fix unique dans `AbstractSqlDialect` → propage automatiquement aux 13
  dialects SQL. Test : `test-scripts/joincolumn-redundant-field.test.mjs`.

- **`$transaction({ isolation })` invalide sur SQLite** (Anomalie #5) —
  SQLite ne supporte pas la syntaxe ANSI `SET TRANSACTION ISOLATION LEVEL`.
  Override `beginSql` dans `SQLiteDialect` avec mapping ANSI →
  modes SQLite : `READ UNCOMMITTED`/`READ COMMITTED` → `DEFERRED`,
  `REPEATABLE READ` → `IMMEDIATE`, `SERIALIZABLE` → `EXCLUSIVE`. Niveau
  inconnu → fallback `DEFERRED` + log. Test :
  `test-scripts/sqlite-isolation-mapping.test.mjs`.

- **Bug latent isolation sur MySQL/MariaDB** (Anomalie #5 propagée) —
  syntaxe MySQL : `SET SESSION TRANSACTION ISOLATION LEVEL X` doit précéder
  `START TRANSACTION`. Override dans `MySQLDialect` (MariaDB hérite).
  Validation E2E via smoke amia multi-dialect.

- **Niveaux isolation non supportés ignorés silencieusement** sur Oracle,
  HANA, DB2 (Anomalie #5 extensions) :
  - **Oracle** : Oracle ne supporte que 2 niveaux. Mapping 4-niveaux ANSI
    → 2-niveaux Oracle (`READ UNCOMMITTED`/`READ COMMITTED` → `READ
    COMMITTED`, `REPEATABLE READ`/`SERIALIZABLE` → `SERIALIZABLE`).
  - **HANA** : `READ UNCOMMITTED` non supporté → mapped à `READ COMMITTED`
    avec log explicite.
  - **DB2** : DB2 utilise UR/CS/RS/RR, pas ANSI. Mapping ajouté
    (`READ UNCOMMITTED` → `UR`, `READ COMMITTED` → `CS`, etc.).

- **MongoDB** : `applySoftDeleteFilter` étendu de la même façon que SQL —
  bypass via `options.includeDeleted: true`. Propagé sur les sites read.

### Changed — API non-breaking

Trois signatures `IDialect` et trois signatures `IRepository` acceptent un
nouveau paramètre `options?: QueryOptions` optionnel à la fin (compatible
avec tous les appels existants) :

- `IDialect.count(schema, filter, options?)`
- `IDialect.distinct(schema, field, filter, options?)`
- `IDialect.aggregate(schema, stages, options?)`
- `IRepository.count(filter?, options?)`
- `IRepository.distinct(field, filter?, options?)`
- `BaseRepository.aggregate(stages, options?)`

### Documented — comportements by-design

- **Asymétrie `findById`** (Anomalie #3) — `findById(string)` retourne
  `null` si introuvable ; `findById(objet)` lève `OrmIntrospectionError`
  si l'objet ne match ni `id` ni un index unique. Distinction
  *programming error* (throw — caller corrige) vs *expected absence*
  (null — business). Comportement intentionnel, désormais verrouillé par
  test (`findbyid-asymmetry.test.mjs`).

- **`softDelete` détaillé** dans le `llms.txt` : injection auto `deletedAt`,
  filtre auto sur reads, `delete()` devient soft-delete, opt-in
  `includeDeleted` (nouveau 2.2.0).

- **`TxHandle`** typé : `{ id: string; startedAt: number; depth: number }`
  (`depth === 1` = transaction réelle, `depth >= 2` = SAVEPOINT nested).

- **`DiffOperation`** : 14 variantes typées listées dans le `llms.txt`.

- **`applyFixes` / `rollbackFixes`** : `FixOptions` et `FixResult`
  documentés (sourceRoot, dryRun défaut true, rules?, backup défaut true).

- **Erreurs typées** : bloc dédié dans le `llms.txt` — ctor + scénario
  de levée pour chacune des 6 classes d'erreurs publiques.

### Non-Breaking

Tous les changements sont rétrocompatibles. Code consumer 2.1.0 fonctionne
sans modification sur 2.2.0.

### Tests

- 5 nouveaux tests dédiés aux anomalies traitées (Fix #1/#2/#5 + lock #3/#4).
- 114 tests existants (validator-rules + introspection-findById) restent verts.
- 2 tests llms-txt-coverage restent à 100% de couverture API publique.

**Auteur** : Dr Hamid MADANI <drmdh@msn.com>

---

## [2.1.0] — 2026-05-25

### Added — 5 nouvelles règles validator *(comblement de dette doc/code)*

Le README et `docs/TECHNIQUE-INTROSPECTION-FINDONEBYID.md` annonçaient depuis
la 2.0.0 plusieurs règles (R019/R020/R021 + R003B/R013B) comme spécifiées.
Cette version les livre toutes — la dette doc/code est résorbée.

#### Cross-file (consumer-code, nécessitent `sourceRoot`)

- **R019-FINDBYID-OBJECT-INPUT** *(warning, auto-fixable)* — détecte les
  appels `repo.findById(entity.relation)` où `relation` est déclarée
  comme relation. Sous `fetch:'eager'`, l'argument est un objet — l'appel
  est faux en pre-2.0 et ambigu en 2.0+. Détection AST via ts-morph.
  **Auto-fix** : insert `import { extractRelId } from '@mostajs/orm'` si
  absent (étend l'import existant si présent) + wrap l'expression.
  Idempotent (skip si déjà appliqué).

- **R020-NATURAL-KEY-LOOKUP-OPPORTUNITY** *(info, non-fixable par design)* —
  détecte les `repo.findOne({ field: x })` ou composite dont l'ensemble
  des keys correspond exactement à un unique index. Suggère que la même
  écriture est valide en `findById(...)` polymorphique. Non auto-fixable :
  `findOne` reste lisible et valide.

- **R021-DIRECT-RELATION-COMPARISON** *(warning, auto-fixable)* — détecte
  les comparaisons `entity.relation === value` (ou `!==`) où `relation`
  est une relation ORM. Sous `fetch:'eager'`, c'est un objet comparé à
  une string id — toujours `false` (`===`) ou `true` (`!==`). Détection
  AST (BinaryExpression) avec opérandes des deux côtés. **Auto-fix**
  identique à R019.

#### Schema-only (pas besoin de `sourceRoot`)

- **R003B-UNIQUE-WITH-SOFTDELETE-CONFLICT** *(warning, auto-fixable)* —
  détecte les index uniques non-sparse sur des schémas avec soft-delete
  (natif `softDelete: true` ou pattern manuel `deleted` + `deletedAt`).
  Conséquence : la réinsertion d'un row avec mêmes valeurs après
  soft-delete est refusée par la contrainte UNIQUE. **Auto-fix** : ajoute
  `sparse: true` à l'index ciblé (partial unique en SQL/Postgres :
  `WHERE deletedAt IS NULL`).

- **R013B-EAGER-WITHOUT-CASCADE** *(warning, auto-fixable)* — détecte
  les relations avec `fetch: 'eager'` ET sans `onDelete` explicite.
  Orphelins populés silencieusement après delete parent. **Auto-fix** :
  insère un `onDelete` cohérent (`'cascade'` si `required` ou
  `one-to-many`, sinon `'set-null'`).

#### Extension du fixer pour cross-file consumer-code

Le `applyFixes()` charge désormais aussi les fichiers consumer cités
dans `location.file` des findings *(en plus des schemas)*. Une nouvelle
helper `ensureExtractRelIdImport()` gère intelligemment l'insertion ou
l'extension d'import `@mostajs/orm` :

1. Import nommé déjà présent → no-op
2. Autre import depuis `@mostajs/orm` → ajoute `extractRelId` à la liste
3. Aucun import → nouvelle ligne d'import après les imports existants

Idempotence garantie : un re-run du validator après auto-fix ne génère
plus le finding correspondant.

### Validator totalise désormais 24 règles

R001-R018, plus R003B/R004B/R013B, plus R019/R020/R021. Toutes
enregistrées dans `DEFAULT_RULES` et exportées individuellement depuis
`@mostajs/orm/validator` pour composition opt-in.

### Couverture tests

50 tests unitaires dans `test-scripts/validator-rules.test.mjs` (25
anciens + 25 nouveaux) :
- R019 : 5 tests (TP + 4 TN)
- R020 : 5 tests (2 TP + 3 TN)
- R021 : 6 tests (3 TP + 3 TN)
- R003B : 4 tests (TP natif/manuel + 2 TN)
- R013B : 4 tests (TP M2O + 3 TN)
- Auto-fix R019 : 2 tests (création import + extension import existant)
- Auto-fix R021 : 1 test (idempotence vérifiée)

Plus 2 tests dans `test-scripts/llms-txt-coverage.test.mjs` (garde-fou
exhaustivité doc-vs-code à 100%).

### Added — `TxHandle` ré-exporté depuis l'index racine

L'interface `TxHandle` *(retour de `beginTx/commitTx/rollbackTx`)* était
définie dans `core/types.ts` mais oubliée du barrel `index.ts`, rendant
l'API tx manuelle non-typable côté consumer. Corrigé.

### Added — `llms.txt`

Fiche AI-friendly à la racine du package, embarquée dans le tarball npm.
Décrit l'API publique et les patterns d'usage *(findById polymorphique,
extractRelId, ORMConceptValidator, FK/relations)* pour les assistants LLM
consommateurs.

### Fixed — README et doc TECHNIQUE-INTROSPECTION

- README §107 : *« explicitly documented + ORMConceptValidator R019/R021 »*
  était factuel pour la doc mais faux pour le validator. Désormais accurate :
  les règles sont **implémentées et testées**.
- `docs/TECHNIQUE-INTROSPECTION-FINDONEBYID.md` Phase 3 §266-270 : checkboxes
  *« Implémentation R019 / R020 »* cochés.

### Unchanged

Pas de changement runtime ORM (dialects, BaseRepository, findById, schémas).
La 2.1.0 ne touche que le validator + barrel exports + doc. Pas de
migration nécessaire pour les consumers, sauf re-installer le package pour
bénéficier des nouvelles règles validator.

**Author** : Dr Hamid MADANI <drmdh@msn.com>

## [2.0.0] — 2026-05-13 *(prepared, not yet published)*

**⚠ Breaking change** — comportement par défaut des relations changé.
Voir « Migration » en bas de cette entrée.

### Changed — Default fetch `lazy` for ALL relations (étape A)

Inverse le comportement historique du SQL dialect :

| Type relation | < 2.0 (par défaut) | ≥ 2.0 (par défaut) |
|---|---|---|
| `many-to-one` | **eager** | **lazy** |
| `one-to-one` | **eager** | **lazy** |
| `one-to-many` | lazy | lazy |
| `many-to-many` | lazy | lazy |

Avant 2.0 : `findById(reg.id)` retournait un objet où `reg.project`
était l'objet Project **populé** *(remplaçait silencieusement la
string id)*. Après 2.0 : `reg.project` retourne la **string id**,
comme attendu par tous les ORMs modernes *(Prisma, Drizzle, TypeORM
0.3+, SQLAlchemy, MikroORM)* et par le mongo dialect interne (qui
était déjà lazy → fix de cohérence intra-mosta-orm).

**Opt-in eager** explicite via `fetch: 'eager'` dans la définition
de relation :

```ts
relations: {
  project: { type: 'many-to-one', target: 'Project', fetch: 'eager', onDelete: 'cascade' },
}
```

Le comportement Hibernate `FetchType.EAGER` par défaut sur M2O est
considéré comme anti-pattern *(N+1 queries silencieuses, fuites
mémoire sur grands datasets, ambiguïté type FK/objet)* — voir
[Vlad Mihalcea on eager fetching](https://vladmihalcea.com/eager-fetching-is-a-code-smell/).

### Added — `BaseRepository.findById` polymorphique (étape D)

`findById()` accepte désormais 4 formes d'input :

```ts
// Comportement historique (string PK)
projRepo.findById('abc-123')

// Number coercé en string
projRepo.findById(42)

// Objet avec `id` — utile quand on a un objet populé en main
projRepo.findById({ id: 'abc-123', slug: 'ignored' })   // id wins

// Natural key — matching unique index du schema
projRepo.findById({ slug: 'my-project' })

// Composite natural key
membershipRepo.findById({ tenantId: 't1', slug: 'admin' })
```

**Throw `OrmIntrospectionError`** si l'objet ne matche ni `id` ni un
unique index *(message explicite listant les fields disponibles et
les index uniques candidats)*.

Inspirations : Hibernate `EntityManager.find(Class, Object)`, Prisma
`findUnique({ where })`, SQLAlchemy `Session.get(Cls, ident)`.

### Added — Public exports

```ts
export {
  OrmIntrospectionError,    // class
  resolveLookup,             // schema, input → ResolvedLookup
  findMatchingUniqueIndex,   // schema, obj → UniqueIndexMatch | null
  extractRelId,              // value → string id (helper consumer)
  type ResolvedLookup,
  type UniqueIndexMatch,
}
```

**`extractRelId(value)`** est le helper recommandé pour les
**comparaisons directes** *(JS n'a pas d'operator overloading,
donc `===` entre object et string échoue toujours sans coercion)*.

### Piège documenté — `===` direct sur les relations en mode eager

JavaScript ne supporte pas l'operator overloading *(proposition TC39
en discussion depuis 2014, jamais avancée)*. Conséquence :

```ts
// Quand fetch:'eager' est activé sur la relation :
reg.project === project.id   // → false TOUJOURS (object vs string)
```

`BaseRepository.findById()` polymorphique *(étape D)* résout 90% des
call-sites consumer. Les **10% restants** *(comparaisons `===`,
accès propriétés directs)* nécessitent que le consumer s'adapte :

| Pattern | Robuste lazy + eager ? |
|---|---|
| `await repo.findById(reg.relation)` | ✅ D résout |
| `reg.relation === other.id` | ❌ piège — utiliser `extractRelId(reg.relation) === other.id` |
| `reg.relation.id === other.id` | ⚠ marche en eager uniquement, plante en lazy *(string)* |
| `extractRelId(reg.relation) === other.id` | ✅ safe partout |

### ORMConceptValidator rules adjustments

- **R019-FINDBYID-OBJECT-INPUT** *(nouvelle warning)* — détecte
  `findById(entity.relation)` où `entity.relation` peut être
  objet *(eager)*. Suggestion : OK avec @mostajs/orm@2.0+.
- **R020-NATURAL-KEY-LOOKUP-OPPORTUNITY** *(nouvelle info)* —
  signale les `findOne({ uniqueField })` qui pourraient utiliser
  `findById({ uniqueField })`. Pas d'auto-fix *(les deux ont leur
  place)*.
- **R021-DIRECT-RELATION-COMPARISON** *(nouvelle warning)* — détecte
  `entity.relation === something`. Suggestion : utiliser
  `extractRelId(entity.relation) === something`. Auto-fix avec
  injection d'import.
- **R003B-UNIQUE-WITH-SOFTDELETE-CONFLICT** *(renforcement R003)*.
- **R013B-EAGER-WITHOUT-CASCADE** *(nouvelle warning)*.

### Migration depuis 1.x → 2.0

#### Cas A — Consumer ne dépendait PAS du populate eager *(majorité)*

Pas de changement visible côté code consumer — `reg.project` était
déjà utilisé comme string id partout. Bonus : moins de queries
silencieuses *(N+1 évité)*.

```ts
// Marche identiquement en 1.x et 2.0+ :
await projRepo.findById(reg.project)
```

#### Cas B — Consumer dépendait du populate eager

```ts
// AVANT 2.0 (eager par défaut) :
const reg = await regRepo.findById(regId)
console.log(reg.project.name)   // marche : .project est l'objet

// APRÈS 2.0 (lazy par défaut) :
// Option 1 — opt-in eager explicit
relations: { project: { ..., fetch: 'eager' } }
// → reg.project reste objet, ATTENTION aux comparaisons (voir piège)

// Option 2 — utiliser findByIdWithRelations
const reg = await regRepo.findByIdWithRelations(regId, ['project'])
console.log(reg.project.name)   // populate explicite

// Option 3 — fetch séparé (plus explicite, recommandé)
const reg = await regRepo.findById(regId)
const project = await projRepo.findById(reg.project)
console.log(project.name)
```

#### Cas C — Code legacy avec comparaisons `===` sur relations

Inspecter avec :

```bash
grep -rnE "\w+\.(project|contact|user|...)\s*===" src/
```

Pour chaque match : envelopper avec `extractRelId(...)` ou comparer
les `.id` explicit *(uniquement si tu sais que tu es en eager
permanent)*.

### Tests

56 tests passent *(test-scripts/introspection-findById.test.mjs)* :
- 17 tests `resolveLookup` *(empty, string, number, object id,
  natural key, composite, ambiguïtés, throw cases)*
- 7 tests `findMatchingUniqueIndex`
- 14 tests d'intégration `BaseRepository.findById` *(DB SQLite)*
- 2 tests interaction soft-delete
- 3 tests régression non-breaking
- 5 tests edge cases *(round-trip, concurrent, unicode, longueur 500)*
- 8 tests `extractRelId` helper

### Documentation

- `docs/TECHNIQUE-INTROSPECTION-FINDONEBYID.md` — spec complète,
  inspirations, articulation A+D, piège `===` documenté, rollback path.
- `docs/STATE-OF-ART-ORM-VALIDATOR.md` — mise à jour avec R019-R021,
  positionnement vs Prisma/Drizzle.

### Backups

`mosta-orm/.backups/pre-2.0-D/` contient les versions avant
modifications pour rollback ciblé :

- `abstract-sql.dialect.ts.before-D` *(avant A + D, eager default)*
- `abstract-sql.dialect.ts.after-A` *(A seul, lazy default)*
- `base-repository.ts.before-D` *(avant findById polymorphique)*
- `types.ts.before-D`
- `index.ts.before-D`

---

## [1.17.0] — 2026-05-11

### Added — Auto-fix V3-A V3 *(R001B + R003 + cascade mitigation)*

3 améliorations livrées suite à l'application réelle du validator sur iquesta *(247 → 224 findings cross-projects, iquesta R001/R001B/R002/R003 = 0)* :

- **R001B-FIELD-RELATION-DUPLICATE** : nouvelle sous-règle qui détecte les
  doublons « field FK string + relation déclarée pour le même nom » *(résidu
  d'un fix R001 partiellement appliqué)*. Auto-fixable : retire le field
  redondant en gardant la relation propre.

- **R003-SOFT-DELETE-INCONSISTENT** : auto-fix du cas « migrate to native »
  *(severity `info`, `fixable: true`)*. Ajoute `softDelete: true` au schéma et
  retire les fields manuels `deleted` + `deletedAt`. La détection des
  patterns business *('cancelled', 'disabled')* est désactivée par défaut —
  ces patterns décrivent un statut métier, pas un soft-delete. Activable via
  `options.softDeletePatterns` pour cas spécifiques.

- **Cascade ts-morph mitigation** : entre deux fixes consécutifs sur le même
  fichier *(ex: `registration.schema.ts` contenant `RegistrationSchema` +
  `AttendanceSchema`)*, le fixer recharge `SourceFile` via
  `removeSourceFile + createSourceFile` pour repartir avec un AST frais et
  éviter les "node forgotten".

- **Fallback textuel** dans `fixR001B` : si ts-morph `.remove()` crash sur
  un commentaire en fin de ligne, bascule sur regex robuste pour retirer
  proprement `<field>: { ... }, // <comment>`.

### Changed — `DEFAULT_SOFT_DELETE_PATTERNS` canoniques uniquement

Les patterns par défaut sont restreints à `deleted`/`archived`/`removed`
*(les seuls vrais soft-deletes)*. `cancelled` et `disabled` retirés —
ce sont des statuts métier, pas une politique de rétention.

### Fixed — Bug défensif sur schemas optionnels

- `core/registry.ts` `validateSchemas()` : guard sur `schema.relations`
  undefined *(évitait `Cannot convert undefined or null to object` au boot
  quand un schéma minimal n'a aucune relation)*.
- `dialects/abstract-sql.dialect.ts` `generateIndexes()` : guard sur
  `schema.indexes` undefined *(évitait crash sur payloads JSON minimaux
  reçus via `POST /api/upload-schemas-json`)*.

### Migration

Aucune. Les améliorations sont rétro-compatibles. Pour reprofiter de
`R001B` sur un projet existant *(détection des leftovers de fix R001
antérieurs)*, relancer simplement le validator.

---

## [1.16.0] — 2026-05-11

### Added — Auto-fix V3-A V2 *(R001 + R002 + R016)*

Auto-fix élargi à 3 nouvelles règles via ts-morph :

- **R001-EMPTY-RELATIONS** : retire le field FK string de `fields: { ... }`
  ET ajoute la relation correspondante dans `relations: { ... }` avec
  `type: 'many-to-one', target: '<Entity>', onDelete: 'cascade'`.
  Préserve `required: true` du field d'origine.

- **R002-FK-NAMING-INCONSISTENT** : rename le field dans le schéma
  *(parentId → parent, questionId → question, etc. selon convention
  majoritaire détectée)*. Note dans le `reason` : refactor cross-file
  des usages reste à la charge du dev *(via IDE rename)*.

- **R016-AUDIT-EMAIL-AS-STRING** : convertit le field string
  *(createdBy/updatedBy/etc.)* en relation `many-to-one` vers User avec
  `onDelete: 'set-null'` *(préserve l'audit historique si le user est
  supprimé)*. Note : les usages cross-file qui assignent `field: email`
  doivent être adaptés au new schema *(field accepte désormais un User id)*.

### Added — `rollbackFixes()` API + `--rollback-fix` CLI

```ts
import { rollbackFixes } from '@mostajs/orm/validator'

rollbackFixes('./schemas')  // restore tous les .bak puis les supprime
```

```bash
npx mostajs-orm-validator ./schemas --rollback-fix
```

Permet d'annuler un `--fix` malheureux *(scenario : `--fix` casse les
tests → `--rollback-fix` → revue manuelle puis `--fix-rules R013` ciblé)*.

### Tests

- 23/23 tests unitaires passent *(incluant 4 fixer R001/R009/R013/R016 +
  rollback)*

### Plugin VSCode V0.1.0 *(séparé)*

Scaffold du plugin Marketplace dans `mostajs/mosta-orm-vscode/` :
- Squiggles inline pour les findings *(severity → DiagnosticSeverity)*
- Commandes : Validate / FixAll *(stub V2)* / Rollback
- Configuration via settings VSCode
- Activation à l'ouverture d'un fichier TS

À publier sur Marketplace après calibration cross-projets V4.

---

## [1.15.0] — 2026-05-11

### Added — ORMConceptValidator V3 *(auto-fix + R018 complète)*

**V3-A — Auto-fix `--fix`** : applique automatiquement les corrections
pour les règles fixables, via parsing AST (`ts-morph`, nouvelle dep).

Règles auto-fix supportées :
- **R013-MISSING-CASCADE** — ajoute `onDelete: 'cascade'` aux relations
  `many-to-one` qui n'en ont pas
- **R009-MISSING-LOOKUP-INDEX** — ajoute l'index manquant *(unique si le
  champ a `unique: true`, simple sinon)*

Modes :
- `--fix-dry-run` — affiche les diffs unifiés sans modifier les fichiers
- `--fix` — applique réellement *(backup `.bak` par défaut, désactivable
  avec `--no-backup`)*
- `--fix-rules R013,R009` — filtrer les règles à corriger

API programmatique :
```ts
import { applyFixes } from '@mostajs/orm/validator'

const fixes = await applyFixes(report, {
  sourceRoot: './schemas',
  dryRun: false,
  rules: ['R013', 'R009'],
})
```

Règles non-fixables auto en V1 *(R001, R002, R016)* : suggestion textuelle
seulement *(refactor cross-file requis — V3-A V2)*.

**V3-B — R018-EXTERNAL-SCHEMA-OVERSCOPED implémenté** :
détecte les `export { XxxSchema } from 'external-package'` et compte
les usages des fields du schema externe dans les sources. Suggestion :
extraire un sous-schéma local OU documenter les champs ignorés OU
ouvrir un issue sur le module externe pour scinder.

### Added — dep `ts-morph`

Utilisée par `fixer.ts` pour modifier les schémas TS de façon AST-safe
*(évite les patches regex fragiles)*.

### Tests

- 20/20 tests unitaires passent *(`test-scripts/validator-rules.test.mjs`)*
  *(18 règles + 2 fixer R013/R009 + smoke clean)*
- 8/8 smoke E2E sur consumer codebase
- `npx mostajs-orm-validator --help` affiche les nouvelles options

---

## [1.14.0] — 2026-05-11

### Added — `ORMConceptValidator` *(new submodule `@mostajs/orm/validator`)*

Algorithmic linter for `EntitySchema` sets. Detects 18 conceptual
anomalies (empty relations, FK naming inconsistency, soft-delete
patterns, JSON-as-relation, dead code, missing audit, unbounded
blobs, etc.). Zero IA, zero heuristics, **fully generic** — same
binary detects the same anti-patterns in any consumer codebase.

```ts
import { validateSchemas, formatText } from '@mostajs/orm/validator'

const report = await validateSchemas(Object.values(schemas), {
  sourceRoot: './lib',
})
console.log(formatText(report))
```

```bash
npx mostajs-orm-validator ./schemas --src ./lib --ci --max-warnings 0
```

**15 active rules + 1 stub** : R001..R018 (cf. README section
"ORMConceptValidator").

**Output formats** : text *(TTY-aware ANSI colors)*, JSON *(CI/diff)*,
Markdown *(human-readable)*.

**Configurable** : ignore list, severity override, `softDeletePatterns`,
`auditByFields`, thresholds — no hardcoded business strings.

**TypeScript schemas** loaded directly via [`jiti`](https://github.com/unjs/jiti)
*(new dep)* — no compile step required.

**Validation** :
- 18/18 unit tests pass
- 8/8 smoke E2E checks pass on a real consumer codebase (15+ schemas)

**Non-breaking** : opt-in submodule.

### Added — `bin` entry `mostajs-orm-validator`

Available via `npx mostajs-orm-validator`.

---

## [1.13.1] — 2026-04-24

Two defensive fixes surfaced while wiring the brand-new Java client
(`com.mostajs:mostajs-net-client`) to the live demo server at
`https://mcp.amia.fr/`. Minimal payloads (`{name, collection, fields}`
without `indexes` nor `relations`) were crashing the server with
`Cannot read properties of undefined (reading 'length')`.

### Fixed — `AbstractSqlDialect.generateIndexes()` guards against missing `indexes`

`EntitySchema.indexes` is declared optional in the type, but
`generateIndexes()` iterated `schema.indexes.length` directly. When a
caller registered a schema without an `indexes` array (legitimate
minimal case), the loop threw a `TypeError`. Fixed by defaulting to
`schema.indexes ?? []` before iterating.

Reported by the Java integration test
`LiveServerIntegrationTest.uploadUserSchemaIfMissing`.

### Fixed — `validateSchemas()` guards against missing `relations`

Symmetric issue in `core/registry.ts:validateSchemas()` :
`Object.entries(schema.relations)` throws `TypeError: Cannot convert
undefined or null to object` when `relations` is absent. Fixed by
defaulting to `{}` before enumerating.

### Operational impact

The Java / C# / mobile clients can now post a minimal `EntitySchema`
via `POST /api/upload-schemas-json` (handled by `@mostajs/net`) without
being forced to emit empty `indexes: []` / `relations: {}` fields just
to survive DDL generation. Same root cause as the bug report that
came from `mosta-net-client-java` v0.1.

## [1.13.0] — 2026-04-21

Three independent improvement groups shipped together : **SQL FK correctness**,
**cross-dialect replication hardening (Mongo)**, and **profile-based config
cascade** via the new `@mostajs/config` package.

### Fixed — SQL dialect : FK columns preserve falsy-but-valid values (0, false)

Replaced the `data[name] || null` short-circuit by
`data[name] === '' ? null : (data[name] ?? null)` in `AbstractSqlDialect.insert`
and `AbstractSqlDialect.update`. The previous logic silently replaced valid
falsy values (numeric `0`, boolean `false`) with `null`, breaking FK writes
whose `id = 0` was legitimate.

### Added — SQL dialect : UNIQUE constraint on one-to-one FK columns

Relations declared as `type: 'one-to-one'` now get a column-level `UNIQUE`
constraint at `CREATE TABLE` and at `ALTER TABLE ADD` time. Matches the JPA
semantics where an O2O FK must be injective.

### Fixed — Mongo dialect : accepts UUID strings in FK (cross-dialect replication)

When a record originates from a SQL dialect (SQLite/Postgres/…) that uses
**UUID** primary keys, the replicated Mongo document stores the FK as a
string rather than a native `ObjectId`. Two changes :

1. FK fields in the Mongoose schema now use `Schema.Types.Mixed` instead of
   `ObjectId`, accepting both `ObjectId` and UUID-string values.
2. When Mongoose `populate()` returns `null` (because the ref lookup expects
   `_id` matching the FK's type), the dialect falls back to
   `findOne({ id: fkValue })` on the target collection.

Unblocks `@mostajs/replicator` for bidirectional SQL ↔ Mongo sync.

### Added — `MOSTA_ENV` profile cascade via `@mostajs/config`

Environment variables now support profile-based overrides. Set `MOSTA_ENV=TEST`
and any `TEST_DB_DIALECT` / `TEST_SGBD_URI` / etc. takes priority over plain
`DB_DIALECT` / `SGBD_URI`. If a profile override is absent, lookup silently
falls back to the plain variable — no crash on missing optional keys.

```bash
# .env
MOSTA_ENV=TEST
DB_DIALECT=postgres            # default
TEST_DB_DIALECT=sqlite         # TEST override
TEST_SGBD_URI=./test.sqlite
# No TEST_DB_SCHEMA_STRATEGY → falls back to DB_SCHEMA_STRATEGY or 'none'
```

Affects `getConfigFromEnv()` and `getCurrentDialectType()`.

This matches the well-known **Spring Boot profiles** pattern
(`spring.profiles.active=test` loading `application-test.properties`).

### Added — new dependency `@mostajs/config ^1.0.0`

The env loader has been extracted to a standalone package so other MostaJS
packages (`@mostajs/auth`, `@mostajs/payment`, `@mostajs/music`, …) can use
the same profile cascade.

```ts
import { getEnv, getEnvBool, getEnvNumber, getCurrentProfile } from '@mostajs/config';
```

The helpers are also re-exported from `@mostajs/orm` for convenience and
backward compatibility with the 1.13-alpha preview.

## [1.11.0] — 2026-04-16

### Added — Manual transaction API (`beginTx` / `commitTx` / `rollbackTx`)

Complements the existing `$transaction(cb)` wrapper with a manual trio
for flows that don't fit in a single callback (multi-function pipelines,
batch async, user-controlled commit).

```ts
const tx = await dialect.beginTx()
try {
  await dialect.create(UserSchema, { email: 'a@b.c' })
  await someExternalCheck()          // async, could take seconds
  if (ok) await dialect.commitTx(tx)
  else    await dialect.rollbackTx(tx)
} catch (e) { await dialect.rollbackTx(tx); throw e }
```

### Added — Nested transactions (SAVEPOINTs)

Both `$transaction(cb)` and `beginTx()` now transparently support
nesting. The outermost call emits a real `BEGIN`; subsequent nested
calls emit a `SAVEPOINT`. `commitTx` releases the savepoint for inner
levels and issues `COMMIT` only at the outermost level. Same logic for
rollback (`ROLLBACK TO SAVEPOINT` vs `ROLLBACK`).

```ts
const outer = await d.beginTx()                    // BEGIN
await d.create(UserSchema, { email: 'o@x.io' })

const inner = await d.beginTx()                    // SAVEPOINT mosta_sp_2_xxxx
await d.create(UserSchema, { email: 'i@x.io' })
await d.rollbackTx(inner)                          // ROLLBACK TO SAVEPOINT → inner gone

await d.commitTx(outer)                            // COMMIT → outer persists
```

LIFO enforcement : out-of-order commit throws with a clear message;
out-of-order rollback is silent (caller usually already surfacing its
own error).

### Dialect-specific savepoint overrides

- **MSSQL / Sybase** : `SAVE TRANSACTION` / `ROLLBACK TRANSACTION`
  (no RELEASE equivalent — auto-released at outer COMMIT).
- **Spanner** : savepoints not supported. `beginTx` throws a clear error
  when attempting to nest — flatten the flow or use `$transaction(cb)`
  once at the outer level.
- **Oracle / DB2 / HANA / PG / MySQL / MariaDB / SQLite / HSQLDB /
  CockroachDB** : standard `SAVEPOINT` / `RELEASE SAVEPOINT` /
  `ROLLBACK TO SAVEPOINT` (inherited from AbstractSqlDialect).

### Tests

`test-manual-transactions.ts` in `@mostajs/orm-bridge`
(SQLite) — **21/21 passing**. Covers : commit path, rollback path,
multi-function flow, outer try/catch integration, 5 sequential cycles,
`$transaction(cb)` delegation, out-of-order commit rejection, 2-level
nesting, 3-level nesting. Full bridge regression suite : 8/8 test files
green.

### Implementation note — `$transaction` now delegates

Since 1.11.0 the `$transaction(cb)` wrapper internally calls `beginTx`
→ `commitTx` / `rollbackTx` instead of issuing `BEGIN` / `COMMIT`
directly. Dialects only need to override the savepoint hooks (or the
`beginSql/commitSql/rollbackSql` hooks) once to get both flavours
behaving consistently.

## [1.10.8] — 2026-04-15

### Fixed — `$transaction` BEGIN keyword on Oracle / DB2 / HANA

The default `AbstractSqlDialect.beginSql()` returned `"BEGIN"` for every
SQL dialect. Oracle, DB2 and HANA all use **implicit** transactions —
there is no SQL `BEGIN` keyword, only PL/SQL block opener. Sending
`BEGIN ;` alone made Oracle raise `ORA-06550 PLS-00103` (DB2 / HANA
similar SQL parse errors). Symptom in production : every `$transaction`
call (which the bridge uses for nested writes / login → `update last_login_at`)
crashed at the very first statement.

Each of these three dialects now overrides `beginSql()` to **return null**
(skip the BEGIN), keeping the COMMIT/ROLLBACK on success/throw. When the
caller asks for an isolation level, the dialect-correct `SET TRANSACTION
ISOLATION LEVEL …` (`SET CURRENT ISOLATION = …` for DB2) is emitted instead.

## [1.10.7] — 2026-04-15

### Fixed — `'__MOSTA_NOW__'` sentinel handled at INSERT time too

`OracleDialect.serializeDate` and `MysqlDialect.serializeDate` only checked
`'now'`, not `'__MOSTA_NOW__'`. When a seed value carried the sentinel string
verbatim (e.g. produced by the orm-cli template generator), the override
fell into the `new Date(string)` branch → `Invalid Date` → returned the
literal `'__MOSTA_NOW__'` to the driver → ORA-01858 (Oracle) or
"Incorrect datetime value" (MySQL). Both overrides now recognise the
sentinel like `AbstractSqlDialect.serializeDate` already did since 1.10.1.

## [1.10.6] — 2026-04-15

### Added — `addMissingColumns` + dialect-correct `dropTable` for DB2 / HANA / Spanner

Same fixes as Oracle 1.10.4-1.10.5, applied to the three other dialects
that override `initSchema` :

- **`DB2Dialect`** :
  - `initSchema('update')` now calls `addMissingColumns` on existing tables.
  - `dropTable` issues plain `DROP TABLE x` (DB2 has no `IF EXISTS` /
    `CASCADE` keyword) and silently ignores SQLSTATE 42704 (object not found).
- **`HANADialect`** :
  - `initSchema('update')` now calls `addMissingColumns` on existing tables.
  - `dropTable` issues `DROP TABLE x CASCADE` and silently ignores HANA
    error 259 (invalid table name).
- **`SpannerDialect`** :
  - `initSchema('update')` now calls `addMissingColumns` on existing tables
    (executes ALTER TABLE statements outside the batched DDL — they are
    cheap and need fresh introspection per call).
  - `dropTable` issues plain `DROP TABLE x` (Spanner forbids `IF EXISTS`
    and `CASCADE`) and silently ignores "not found" errors.

## [1.10.5] — 2026-04-15

### Added

- **`addMissingColumns` now also adds the `id` column** when a legacy table
  uses a composite PK and lacks the surrogate `id` declared in the schema
  (e.g. `user_roles(userId, roleId)` migrating to `user_roles(id, userId, roleId, createdAt)`).
  Added nullable on populated tables — backfill is the user's responsibility.

### Fixed

- **Oracle `dropTable`** now uses Oracle-correct syntax. The default
  `DROP TABLE IF EXISTS x CASCADE` is invalid SQL on Oracle (`IF EXISTS`
  unsupported, cascade keyword is `CASCADE CONSTRAINTS`). Wrapped in a
  PL/SQL block that swallows ORA-00942 (table not found) and adds `PURGE`
  so the table can be recreated immediately without recycle-bin name clash.

## [1.10.4] — 2026-04-15

### Fixed

- **`OracleDialect.initSchema` now calls `addMissingColumns`** on existing
  tables (`update` strategy). The dialect overrides `initSchema` for FK /
  junction handling and was therefore bypassing the new ALTER-on-update
  behavior introduced in 1.10.3 for SQL dialects sharing the abstract
  implementation. Symptom : `ORA-00904: invalid identifier` on INSERT for
  any column added between releases.

  ```diff
    if (!exists) {
      await this.executeRun(this.generateCreateTable(schema), [])
  +  } else if (strategy === 'update') {
  +    await this.addMissingColumns(schema)
    }
  ```

  Same fix should be applied to `db2.dialect.ts`, `hana.dialect.ts`, and
  `spanner.dialect.ts` (they share the same override pattern). Pending
  Oracle validation, those will land in 1.10.5.

## [1.10.3] — 2026-04-15

### Added — `update` strategy now ALTERs existing tables

- **`schemaStrategy: 'update'` adds missing columns** (fields and M2O / O2O FK
  columns) to pre-existing tables via `ALTER TABLE ADD …`. Pre-1.10.3 the
  `update` strategy was effectively `CREATE TABLE IF NOT EXISTS` — it never
  touched live tables, so adding a field to an entity between releases caused
  `ORA-00904: invalid identifier` (Oracle), `1054 Unknown column` (MySQL),
  `Invalid column name` (MSSQL) at the next INSERT.
- New `protected getExistingColumns(tableName)` introspection method on
  `AbstractSqlDialect`. Default uses ANSI `information_schema.columns`
  (Postgres, MySQL, MariaDB, MSSQL, HSQLDB, Spanner, CockroachDB).
  Overridden in :
  - **`SQLiteDialect`** : `PRAGMA table_info(name)`
  - **`OracleDialect`** : `SELECT column_name FROM user_tab_columns WHERE table_name = :1`
- New `protected addMissingColumns(schema)` helper — case-insensitive diff
  vs the live table, emits one `ALTER TABLE ADD` per missing column. NOT
  NULL is intentionally skipped on ALTER (most engines reject it on a
  populated table without a DEFAULT) — the application enforces it.

Behavior remains 100% backward-compatible : if introspection fails, the
helper silently no-ops (legacy "do nothing on update" path).

## [1.10.2] — 2026-04-15

### Fixed

- **`prepareInsertData` skips `id`/`_id` in the fields loop.** When an
  EntitySchema declared `id` (or `_id`) inside `fields` (the orm-adapter
  emits this systematically with `default: '__MOSTA_OBJECT_ID__'`), the
  generated INSERT contained the column twice :
  ```sql
  INSERT INTO "users" ("id", "id", "email", …) VALUES (?, ?, ?, …)
  ```
  SQLite and PostgreSQL silently tolerated the duplicate; **Oracle, DB2,
  SQL Server, HANA, Sybase reject it with `ORA-00957: duplicate column
  name`** (or equivalent). This shipped undetected because all integration
  tests ran on SQLite. Regression tests on the bridge confirm 7/7 green
  after the fix.

## [1.10.1] — 2026-04-15

### Fixed

- **`__MOSTA_NOW__` sentinel recognised as "now" on every dialect.** The
  `@mostajs/orm-adapter` emits `default: '__MOSTA_NOW__'` for timestamp
  columns that should default to the current time (CreatedAt, UpdatedAt,
  joinDate, etc.). Pre-1.10.1 dialects only recognised the string `'now'` —
  so they emitted `DEFAULT '__MOSTA_NOW__'` literally in DDL, which Oracle
  rejects with `ORA-01858: non-numeric character` when trying to cast the
  literal string to `TIMESTAMP`. Both sentinels are now treated as "current
  time" in `AbstractSqlDialect.createTableSql`, `prepareInsertData`,
  `serializeDate`, and `MongoDialect.registerModel`.

  Symptom on Oracle : schema init crashed with `ORA-01858` on every table
  using a `default: '__MOSTA_NOW__'` field.
  Symptom on SQLite/Postgres/MySQL : tables created with the literal string
  `'__MOSTA_NOW__'` as default, silently making every row "dated" 1970-01-01.

## [1.10.0] — 2026-04-14

### Added

- **`IDialect.$transaction()`** — real ACID transactions across every SQL
  dialect inheriting `AbstractSqlDialect` (SQLite, PostgreSQL, MySQL,
  MariaDB, MSSQL, Oracle, DB2, CockroachDB, HANA, Sybase, HSQLDB, Spanner).
  The default implementation wraps the callback in `BEGIN` / `COMMIT`
  (`ROLLBACK` on throw) with an optional `isolation` argument.

  ```ts
  await dialect.$transaction(async (tx) => {
    await tx.create(UserSchema, { email: 'a@b.c' })
    await tx.update(UserSchema, id, { status: 'active' })
    // throw → both writes rolled back
  })
  ```

  Concrete dialects can override for pool-aware client checkout (strict
  correctness under high concurrency). The default works transparently on
  single-connection dialects (SQLite, HSQLDB) and with `poolSize: 1` on
  pooled dialects.

### Known limitations

- Pool-based SQL dialects (Postgres, MySQL, …) : without per-dialect
  client checkout, a `$transaction` callback running parallel queries may
  land on different pool connections. Set `poolSize: 1` for strict
  correctness, or wait for per-dialect overrides (planned 1.10.x).
- MongoDB `$transaction` is not yet wired (requires session threading).
  Planned for 1.10.1.

## [1.9.4] — 2026-04-14

### Breaking (minor — niche API)

- **JDBC bridge moved to `@mostajs/orm/bridge` subpath.** Symbols
  `JdbcNormalizer`, `parseUri`, `BridgeManager`, `JDBC_REGISTRY`,
  `hasJdbcDriver`, `getJdbcDriverInfo`, `saveJarFile`, `deleteJarFile`,
  `listJarFiles`, `detectDialectFromJar`, `getJdbcDialectStatus`, and
  their types are **no longer exported from the package root**.

  **Migration** :
  ```diff
  - import { JdbcNormalizer, parseUri } from '@mostajs/orm'
  + import { JdbcNormalizer, parseUri } from '@mostajs/orm/bridge'
  ```

  **Why** : the JDBC path statically imports `child_process` (to spawn
  the Java bridge). Re-exporting it from the root caused
  `Can't resolve 'child_process'` errors in Next.js client chunks even
  for apps that never touch JDBC. This mirrors the isolation pattern
  used by `@prisma/client/runtime` and `@auth/core/jwt`.

### Fixed

- Bare specifiers (`'fs'`, `'path'`, `'url'`) instead of `'node:'` prefix
  in `core/factory.ts`. Some webpack builds in downstream Next.js apps
  fail with `UnhandledSchemeError: Reading from "node:fs"` when a dep is
  inadvertently pulled into a `pages/` chunk. Bare names work everywhere.

## [1.9.3] — 2026-04-14

### Fixed

- Dialect imports hidden from bundler static analysis via `webpackIgnore`
  + absolute `file://` URL. Supports Next.js without `serverExternalPackages`.

## [1.9.2] — 2026-04-12

First tagged release with the Hibernate-inspired multi-dialect ORM,
13 dialects (SQLite, PostgreSQL, MongoDB, MySQL, MariaDB, Oracle, SQL
Server, CockroachDB, DB2, SAP HANA, HSQLDB, Spanner, Sybase), repository
pattern, named connections, schema diffing.

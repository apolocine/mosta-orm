# MostaORM — Référence de l'API

> Référence complète de toutes les fonctions, classes, types et interfaces exportés par `@mosta/orm`.

---

## Table des matières

- [createConnection()](#createconnection)
- [getDialect()](#getdialect)
- [getConfigFromEnv()](#getconfigfromenv)
- [disconnectDialect()](#disconnectdialect)
- [testConnection()](#testconnection)
- [registerSchema()](#registerschema--registerschemas)
- [registerSchemas()](#registerschema--registerschemas)
- [getSchema()](#getschema)
- [getAllSchemas()](#getallschemas)
- [BaseRepository\<T\>](#baserepositoryt)
  - [findAll()](#findall)
  - [findOne()](#findone)
  - [findById()](#findbyid)
  - [findByIdWithRelations()](#findbyidwithrelations)
  - [findWithRelations()](#findwithrelations)
  - [create()](#create)
  - [update()](#update)
  - [updateMany()](#updatemany)
  - [delete()](#delete)
  - [deleteMany()](#deletemany)
  - [count()](#count)
  - [search()](#search)
  - [distinct()](#distinct)
  - [aggregate()](#aggregate)
  - [upsert()](#upsert)
  - [increment()](#increment)
  - [addToSet()](#addtoset)
  - [pull()](#pull)
- [Types](#types)
  - [EntitySchema](#entityschema)
  - [FieldDef](#fielddef)
  - [RelationDef](#relationdef)
  - [IndexDef](#indexdef)
  - [ConnectionConfig](#connectionconfig)
  - [FilterQuery](#filterquery)
  - [QueryOptions](#queryoptions)
  - [AggregateStage](#aggregatestage)
  - [PaginatedResult](#paginatedresult)
- [Erreurs](#erreurs)

---

## createConnection()

Initialise et connecte le dialecte. Enregistre optionnellement des schémas.
Retourne un **singleton** — les appels suivants retournent la même instance.

```typescript
function createConnection(
  config: ConnectionConfig,
  schemas?: EntitySchema[]
): Promise<IDialect>
```

**Paramètres**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `config` | `ConnectionConfig` | ✅ | Configuration de la connexion |
| `schemas` | `EntitySchema[]` | ❌ | Schémas à enregistrer avant connexion |

**Exemple**

```typescript
import { createConnection } from '@mosta/orm'
import { UserSchema, PostSchema } from './schemas/index.js'

const dialect = await createConnection(
  {
    dialect: 'postgres',
    uri: process.env.DATABASE_URL!,
    schemaStrategy: 'update',
    showSql: true,
    poolSize: 10,
    cacheEnabled: true,
    cacheTtlSeconds: 60,
  },
  [UserSchema, PostSchema]
)
```

---

## getDialect()

Retourne le dialect courant (singleton). Si aucune connexion n'existe, en crée une à partir de la configuration fournie ou des variables d'environnement.

```typescript
function getDialect(config?: ConnectionConfig): Promise<IDialect>
```

**Exemple**

```typescript
// Depuis les variables d'environnement (DB_DIALECT + SGBD_URI)
const dialect = await getDialect()

// Ou avec une config explicite
const dialect = await getDialect({ dialect: 'sqlite', uri: ':memory:' })
```

---

## getConfigFromEnv()

Lit la configuration depuis les variables d'environnement. Lance une erreur si `DB_DIALECT` ou `SGBD_URI` sont absentes.

```typescript
function getConfigFromEnv(): ConnectionConfig
```

**Variables lues**

| Variable | Requis | Description |
|----------|--------|-------------|
| `DB_DIALECT` | ✅ | Identifiant du dialecte |
| `SGBD_URI` | ✅ | URI de connexion |
| `DB_SCHEMA_STRATEGY` | ❌ | Stratégie de schéma (défaut: `'none'`) |
| `DB_SHOW_SQL` | ❌ | Afficher les requêtes (`'true'/'false'`) |
| `DB_FORMAT_SQL` | ❌ | Indenter les requêtes affichées |
| `DB_POOL_SIZE` | ❌ | Taille du pool de connexions |
| `DB_CACHE_ENABLED` | ❌ | Activer le cache |
| `DB_CACHE_TTL` | ❌ | Durée de vie du cache (secondes) |
| `DB_BATCH_SIZE` | ❌ | Taille des lots pour les opérations bulk |

---

## disconnectDialect()

Ferme la connexion et réinitialise le singleton.

```typescript
function disconnectDialect(): Promise<void>
```

**Exemple**

```typescript
// Nettoyage en fin d'application
process.on('SIGTERM', async () => {
  await disconnectDialect()
  process.exit(0)
})

// Indispensable entre les tests
afterAll(async () => {
  await disconnectDialect()
})
```

---

## testConnection()

Teste une connexion sans modifier le dialecte actif. Utile dans les assistants de configuration.

```typescript
function testConnection(config: ConnectionConfig): Promise<boolean>
```

**Exemple**

```typescript
const ok = await testConnection({
  dialect: 'postgres',
  uri: 'postgresql://user:pass@localhost:5432/mydb',
})
console.log(ok ? '✅ Connexion réussie' : '❌ Connexion échouée')
```

---

## registerSchema() / registerSchemas()

Enregistre un ou plusieurs schémas dans le registre global.

```typescript
function registerSchema(schema: EntitySchema): void
function registerSchemas(schemas: EntitySchema[]): void
```

> Doit être appelé **avant** `getDialect()` ou `createConnection()` si vous n'utilisez pas le paramètre `schemas` de `createConnection()`.

---

## getSchema()

Récupère un schéma enregistré par son nom d'entité.

```typescript
function getSchema(name: string): EntitySchema
```

Lance `DialectNotFoundError` si le schéma n'est pas enregistré.

---

## getAllSchemas()

Retourne tous les schémas enregistrés.

```typescript
function getAllSchemas(): EntitySchema[]
```

---

## BaseRepository\<T\>

Classe générique à étendre pour créer vos repositories.

```typescript
class BaseRepository<T extends { id: string }> implements IRepository<T> {
  constructor(schema: EntitySchema, dialect: IDialect)
}
```

**Paramètres du constructeur**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `schema` | `EntitySchema` | Schéma de l'entité |
| `dialect` | `IDialect` | Instance du dialecte (depuis `createConnection`) |

**Pattern recommandé**

```typescript
class UserRepository extends BaseRepository<User> {
  constructor(dialect: IDialect) {
    super(UserSchema, dialect)
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email })
  }
}
```

---

### findAll()

```typescript
findAll(filter?: FilterQuery, options?: QueryOptions): Promise<T[]>
```

Retourne tous les documents correspondant au filtre.

```typescript
// Tous les utilisateurs actifs, triés par nom
const users = await userRepo.findAll(
  { active: true },
  { sort: { name: 1 }, limit: 50 }
)
```

---

### findOne()

```typescript
findOne(filter: FilterQuery, options?: QueryOptions): Promise<T | null>
```

Retourne le premier document correspondant, ou `null`.

```typescript
const user = await userRepo.findOne({ email: 'alice@example.com' })
```

---

### findById()

```typescript
findById(id: string, options?: QueryOptions): Promise<T | null>
```

Recherche par identifiant unique (UUID ou ObjectId MongoDB).

```typescript
const user = await userRepo.findById('550e8400-e29b-41d4-a716-446655440000')
if (!user) throw new Error('User not found')
```

---

### findByIdWithRelations()

```typescript
findByIdWithRelations(
  id: string,
  relations?: string[],
  options?: QueryOptions
): Promise<T | null>
```

Charge un document avec ses relations (JOIN SQL / populate MongoDB).

```typescript
const post = await postRepo.findByIdWithRelations('abc123', ['author', 'tags'])
// post.author = { id: '...', name: 'Alice', email: '...' }
// post.tags = [{ id: '...', name: 'typescript' }, ...]
```

---

### findWithRelations()

```typescript
findWithRelations(
  filter: FilterQuery,
  relations: string[],
  options?: QueryOptions
): Promise<T[]>
```

Charge plusieurs documents avec leurs relations.

```typescript
const posts = await postRepo.findWithRelations(
  { published: true },
  ['author', 'category'],
  { sort: { createdAt: -1 }, limit: 10 }
)
```

---

### create()

```typescript
create(data: Partial<T>): Promise<T>
```

Crée un nouveau document. Un `id` (UUID) est généré automatiquement si non fourni.

```typescript
const user = await userRepo.create({
  name: 'Alice Dupont',
  email: 'alice@example.com',
  role: 'user',
})
console.log(user.id)         // UUID généré
console.log(user.createdAt)  // Date courante (si timestamps: true)
```

---

### update()

```typescript
update(id: string, data: Partial<T>): Promise<T | null>
```

Mise à jour partielle — seuls les champs fournis sont modifiés.
Retourne le document mis à jour, ou `null` si introuvable.

```typescript
const updated = await userRepo.update('abc123', {
  name: 'Alice Martin',
  updatedAt: new Date(),   // mis à jour automatiquement si timestamps: true
})
```

---

### updateMany()

```typescript
updateMany(filter: FilterQuery, data: Partial<T>): Promise<number>
```

Met à jour tous les documents correspondant au filtre.
Retourne le nombre de documents modifiés.

```typescript
// Désactiver tous les comptes expirés
const count = await userRepo.updateMany(
  { expiresAt: { $lt: new Date() } },
  { active: false }
)
console.log(`${count} comptes désactivés`)
```

---

### delete()

```typescript
delete(id: string): Promise<boolean>
```

Supprime un document par son ID.
Retourne `true` si supprimé, `false` si introuvable.

```typescript
const ok = await userRepo.delete('abc123')
```

---

### deleteMany()

```typescript
deleteMany(filter: FilterQuery): Promise<number>
```

Supprime tous les documents correspondant au filtre.
Retourne le nombre de documents supprimés.

```typescript
const count = await userRepo.deleteMany({ active: false, createdAt: { $lt: cutoffDate } })
```

---

### count()

```typescript
count(filter?: FilterQuery): Promise<number>
```

Compte les documents correspondant au filtre (tous si omis).

```typescript
const total = await userRepo.count()
const admins = await userRepo.count({ role: 'admin' })
```

---

### search()

```typescript
search(query: string, options?: QueryOptions): Promise<T[]>
```

Recherche textuelle dans tous les champs de type `string` du schéma.

- MongoDB : utilise les index `text`
- SQL : génère `WHERE field1 LIKE '%query%' OR field2 LIKE '%query%' ...`

```typescript
const results = await productRepo.search('laptop pro', { limit: 10 })
```

---

### distinct()

```typescript
distinct(field: string, filter?: FilterQuery): Promise<unknown[]>
```

Retourne les valeurs uniques d'un champ.

```typescript
const categories = await productRepo.distinct('category')
// ['electronics', 'clothing', 'food']

const activeRoles = await userRepo.distinct('role', { active: true })
```

---

### aggregate()

```typescript
aggregate<R = Record<string, unknown>>(stages: AggregateStage[]): Promise<R[]>
```

Exécute un pipeline d'agrégation.

```typescript
interface CategoryStats {
  _by: string
  count: number
  avgPrice: number
}

const stats = await productRepo.aggregate<CategoryStats>([
  { $match: { active: true } },
  {
    $group: {
      _by: 'category',
      count: { $count: true },
      avgPrice: { $avg: 'price' },
    },
  },
  { $sort: { count: -1 } },
  { $limit: 10 },
])
```

---

### upsert()

```typescript
upsert(filter: FilterQuery, data: Partial<T>): Promise<T>
```

Équivalent de `INSERT OR UPDATE` — crée si inexistant, met à jour sinon.
Correspond à `saveOrUpdate()` en Hibernate.

```typescript
const config = await configRepo.upsert(
  { key: 'theme' },
  { key: 'theme', value: 'dark', updatedAt: new Date() }
)
```

---

### increment()

```typescript
increment(id: string, field: string, amount: number): Promise<T | null>
```

Incrémente (ou décrémente si négatif) un champ numérique de façon atomique.

```typescript
// Incrémenter le compteur de vues
await articleRepo.increment('abc123', 'views', 1)

// Décrémenter le stock
await productRepo.increment('xyz789', 'stock', -3)
```

---

### addToSet()

```typescript
addToSet(id: string, field: string, value: unknown): Promise<T | null>
```

Ajoute une valeur dans un champ tableau, **sans créer de doublon**.
Équivalent de `$addToSet` MongoDB, ou d'une vérification `CONTAINS` en SQL.

```typescript
// Ajouter un tag (sans doublon)
await productRepo.addToSet('abc123', 'tags', 'bestseller')

// Ajouter un rôle à un utilisateur
await userRepo.addToSet('user123', 'roles', 'editor')
```

---

### pull()

```typescript
pull(id: string, field: string, value: unknown): Promise<T | null>
```

Retire une valeur d'un champ tableau.

```typescript
// Retirer un tag
await productRepo.pull('abc123', 'tags', 'discontinued')

// Révoquer un rôle
await userRepo.pull('user123', 'roles', 'editor')
```

---

## Types

### EntitySchema

```typescript
interface EntitySchema {
  /** Nom PascalCase de l'entité (ex: 'User', 'Product') */
  name: string

  /** Nom de la table SQL ou collection MongoDB (ex: 'users', 'products') */
  collection: string

  /** Définition des champs */
  fields: Record<string, FieldDef>

  /** Relations vers d'autres entités */
  relations: Record<string, RelationDef>

  /** Index de la table/collection */
  indexes: IndexDef[]

  /** Ajoute automatiquement createdAt et updatedAt */
  timestamps: boolean
}
```

---

### FieldDef

```typescript
interface FieldDef {
  /** Type du champ */
  type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'array'

  /** Le champ est obligatoire (NOT NULL en SQL) */
  required?: boolean

  /** Le champ doit être unique (UNIQUE en SQL, unique index en MongoDB) */
  unique?: boolean

  /** L'index unique accepte les valeurs NULL multiples (MongoDB sparse) */
  sparse?: boolean

  /** Valeur par défaut */
  default?: unknown

  /** Valeurs acceptées (validation) */
  enum?: string[]

  /** Convertir en minuscules avant stockage */
  lowercase?: boolean

  /** Supprimer les espaces en début/fin avant stockage */
  trim?: boolean

  /** Type des éléments (pour type: 'array') */
  arrayOf?: FieldType | EmbeddedSchemaDef
}
```

---

### RelationDef

```typescript
interface RelationDef {
  /** Nom de l'entité cible (doit être enregistrée dans le registry) */
  target: string

  /** Type de relation */
  type: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many'

  /** Cette relation est obligatoire */
  required?: boolean

  /** Champs à sélectionner lors du chargement (projection) */
  select?: string[]

  /** La relation peut être null */
  nullable?: boolean

  /** Nom de la table de jonction (many-to-many SQL uniquement) */
  through?: string
}
```

---

### IndexDef

```typescript
interface IndexDef {
  /** Champs et direction de tri */
  fields: Record<string, 'asc' | 'desc' | 'text'>

  /** Index unique */
  unique?: boolean

  /** Exclure les valeurs NULL de l'index */
  sparse?: boolean
}
```

---

### ConnectionConfig

```typescript
interface ConnectionConfig {
  /** Identifiant du dialecte */
  dialect: DialectType

  /** URI de connexion */
  uri: string

  /** Afficher les requêtes générées (défaut: false) */
  showSql?: boolean

  /** Indenter les requêtes affichées (défaut: false) */
  formatSql?: boolean

  /**
   * Stratégie de gestion du schéma (défaut: 'none')
   * - 'none'        : ne rien faire
   * - 'validate'    : vérifier, refuser si incohérent
   * - 'update'      : créer/modifier les tables/collections
   * - 'create'      : supprimer et recréer au démarrage
   * - 'create-drop' : supprimer au démarrage ET à l'arrêt
   */
  schemaStrategy?: 'none' | 'validate' | 'update' | 'create' | 'create-drop'

  /** Taille max du pool de connexions */
  poolSize?: number

  /** Activer le cache des résultats de requête */
  cacheEnabled?: boolean

  /** Durée de vie du cache en secondes (défaut: 60) */
  cacheTtlSeconds?: number

  /** Taille des lots pour les opérations bulk (défaut: 25) */
  batchSize?: number

  /** Options supplémentaires spécifiques au dialecte */
  options?: Record<string, unknown>
}
```

**Dialectes disponibles** : `'mongodb' | 'sqlite' | 'postgres' | 'mysql' | 'mariadb' | 'oracle' | 'mssql' | 'cockroachdb' | 'db2' | 'hana' | 'hsqldb' | 'spanner' | 'sybase'`

---

### FilterQuery

```typescript
interface FilterQuery {
  [field: string]: FilterValue   // égalité implicite ou opérateur

  /** OU logique */
  $or?: FilterQuery[]

  /** ET logique */
  $and?: FilterQuery[]
}

interface FilterOperator {
  $eq?: unknown     // égal à
  $ne?: unknown     // différent de
  $gt?: unknown     // supérieur à (strictement)
  $gte?: unknown    // supérieur ou égal
  $lt?: unknown     // inférieur à (strictement)
  $lte?: unknown    // inférieur ou égal
  $in?: unknown[]   // dans la liste
  $nin?: unknown[]  // hors de la liste
  $regex?: string   // expression régulière
  $regexFlags?: string  // flags regex (ex: 'i' = insensible à la casse)
  $exists?: boolean // le champ existe
}
```

**Exemples**

```typescript
// Égalité implicite
{ status: 'active' }

// Opérateurs de comparaison
{ age: { $gte: 18, $lt: 65 } }

// Liste
{ role: { $in: ['admin', 'moderator'] } }

// Regex
{ name: { $regex: '^alice', $regexFlags: 'i' } }

// OU
{ $or: [{ role: 'admin' }, { permissions: { $in: ['manage_users'] } }] }

// ET
{ $and: [{ active: true }, { verified: true }] }

// Existence
{ deletedAt: { $exists: false } }
```

---

### QueryOptions

```typescript
interface QueryOptions {
  /** Tri des résultats : 1 = ASC, -1 = DESC */
  sort?: Record<string, 1 | -1>

  /** Nombre de documents à sauter (pagination) */
  skip?: number

  /** Nombre maximum de documents à retourner */
  limit?: number

  /** Champs à inclure dans les résultats (projection inclusive) */
  select?: string[]

  /** Champs à exclure des résultats (projection exclusive) */
  exclude?: string[]
}
```

**Exemple — pagination**

```typescript
const PAGE = 2
const LIMIT = 20

const users = await userRepo.findAll(
  { active: true },
  {
    sort: { createdAt: -1 },
    skip: (PAGE - 1) * LIMIT,
    limit: LIMIT,
    select: ['id', 'name', 'email', 'role'],
  }
)
```

---

### AggregateStage

```typescript
// Filtrage ($match → WHERE / $match)
type AggregateMatchStage = { $match: FilterQuery }

// Groupement ($group → GROUP BY)
type AggregateGroupStage = {
  $group: {
    _by: string | null   // null = grouper tous les documents ensemble
    [field: string]: AggregateAccumulator | string | null
  }
}

// Accumulateurs disponibles dans $group
interface AggregateAccumulator {
  $count?: true         // COUNT(*)
  $sum?: number | string // SUM(field) ou COUNT(*) si 1
  $avg?: string         // AVG(field)
  $min?: string         // MIN(field)
  $max?: string         // MAX(field)
}

// Tri ($sort → ORDER BY)
type AggregateSortStage = { $sort: Record<string, 1 | -1> }

// Limitation ($limit → LIMIT)
type AggregateLimitStage = { $limit: number }

// Union
type AggregateStage =
  | AggregateMatchStage
  | AggregateGroupStage
  | AggregateSortStage
  | AggregateLimitStage
```

**Exemple complet**

```typescript
// Chiffre d'affaires par mois, pour les 6 derniers mois
const revenue = await orderRepo.aggregate([
  {
    $match: {
      createdAt: { $gte: sixMonthsAgo },
      status: 'completed',
    },
  },
  {
    $group: {
      _by: 'month',
      totalRevenue: { $sum: 'total' },
      orderCount: { $count: true },
      avgOrderValue: { $avg: 'total' },
    },
  },
  { $sort: { _by: 1 } },
])
```

---

### PaginatedResult

Type utilitaire pour les réponses paginées. Non retourné directement par `findAll` — à construire dans vos repositories.

```typescript
interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
```

**Exemple d'implémentation dans un repository**

```typescript
async findPaginated(
  filter: FilterQuery = {},
  page: number = 1,
  limit: number = 20,
  options?: Omit<QueryOptions, 'skip' | 'limit'>
): Promise<PaginatedResult<T>> {
  const [data, total] = await Promise.all([
    this.findAll(filter, { ...options, skip: (page - 1) * limit, limit }),
    this.count(filter),
  ])
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}
```

---

## Erreurs

```typescript
import {
  MostaORMError,
  EntityNotFoundError,
  ConnectionError,
  ValidationError,
  DialectNotFoundError,
} from '@mosta/orm'
```

| Classe | Hérite de | Quand |
|--------|-----------|-------|
| `MostaORMError` | `Error` | Erreur générique MostaORM |
| `EntityNotFoundError` | `MostaORMError` | Entité introuvable par ID |
| `ConnectionError` | `MostaORMError` | Échec de connexion au serveur DB |
| `ValidationError` | `MostaORMError` | Violation de contrainte de schéma |
| `DialectNotFoundError` | `MostaORMError` | Dialecte inconnu ou driver manquant |

**Gestion des erreurs**

```typescript
import { EntityNotFoundError, ConnectionError } from '@mosta/orm'

try {
  const user = await userRepo.findById(id)
  if (!user) throw new EntityNotFoundError('User', id)
  return user
} catch (err) {
  if (err instanceof EntityNotFoundError) {
    return res.status(404).json({ error: err.message })
  }
  if (err instanceof ConnectionError) {
    return res.status(503).json({ error: 'Database unavailable' })
  }
  throw err
}
```

---

## Interface IPlugin

Permet d'étendre le comportement du repository via des hooks.

```typescript
interface IPlugin {
  name: string

  /** Modifier le schéma au démarrage (ajout de champs, index...) */
  onSchemaInit?(schema: EntitySchema): EntitySchema

  /** Avant insertion */
  preSave?(doc: Record<string, unknown>, ctx: HookContext): Promise<Record<string, unknown>> | Record<string, unknown>

  /** Après insertion */
  postSave?(doc: Record<string, unknown>, ctx: HookContext): Promise<void> | void

  /** Avant mise à jour */
  preUpdate?(id: string, data: Record<string, unknown>, ctx: HookContext): Promise<Record<string, unknown>> | Record<string, unknown>

  /** Après mise à jour */
  postUpdate?(doc: Record<string, unknown>, ctx: HookContext): Promise<void> | void

  /** Avant suppression */
  preDelete?(id: string, ctx: HookContext): Promise<void> | void

  /** Modifier le filtre des requêtes (ex: soft-delete) */
  onQuery?(filter: FilterQuery, ctx: HookContext): FilterQuery

  /** Transformer les résultats (ex: normalisation) */
  onResult?(doc: Record<string, unknown>, ctx: HookContext): Record<string, unknown>
}

interface HookContext {
  entity: EntitySchema
  dialect: DialectType
  operation: 'create' | 'update' | 'delete' | 'find'
  userId?: string
}
```

# MostaORM — Tutorial complet

> Ce tutoriel vous guide de zéro à une application complète utilisant MostaORM avec SQLite, puis montre comment basculer vers PostgreSQL sans changer une seule ligne de code métier.

---

## Table des matières

1. [Installation](#1-installation)
2. [Configuration](#2-configuration)
3. [Définir une entité (EntitySchema)](#3-définir-une-entité-entityschema)
4. [Créer un Repository](#4-créer-un-repository)
5. [Opérations CRUD](#5-opérations-crud)
6. [Filtres avancés](#6-filtres-avancés)
7. [Relations entre entités](#7-relations-entre-entités)
8. [Agrégations](#8-agrégations)
9. [Recherche plein texte](#9-recherche-plein-texte)
10. [Changer de dialecte](#10-changer-de-dialecte)
11. [Application Express complète](#11-application-express-complète)

---

## 1. Installation

```bash
npm install @mosta/orm
```

Installez uniquement le driver de votre base de données :

```bash
# SQLite (léger, parfait pour commencer)
npm install better-sqlite3

# PostgreSQL
npm install pg

# MongoDB
npm install mongoose

# MySQL / MariaDB
npm install mysql2
npm install mariadb

# Autres — voir docs/dialects.md
```

---

## 2. Configuration

MostaORM se configure via **variables d'environnement** ou directement dans le code.

### Via variables d'environnement

Créez un fichier `.env` :

```env
DB_DIALECT=sqlite
SGBD_URI=./data/myapp.db
DB_SCHEMA_STRATEGY=update
DB_SHOW_SQL=true
```

Le code se réduit à :

```typescript
import { getDialect } from '@mosta/orm'

const dialect = await getDialect()  // lit DB_DIALECT + SGBD_URI automatiquement
```

### Via code

```typescript
import { createConnection } from '@mosta/orm'

const dialect = await createConnection({
  dialect: 'sqlite',
  uri: './data/myapp.db',
  schemaStrategy: 'update',   // crée/met à jour les tables automatiquement
  showSql: true,               // affiche les requêtes générées
})
```

### Valeurs de `schemaStrategy`

| Valeur | Comportement | Usage |
|--------|-------------|-------|
| `update` | Crée les tables manquantes, ajoute les colonnes | Développement |
| `create` | Supprime et recrée tout au démarrage | Tests |
| `create-drop` | Supprime au démarrage ET à l'arrêt | Tests unitaires |
| `validate` | Vérifie le schéma, refuse de démarrer si incohérent | Production |
| `none` | Ne touche rien | Production (migrations manuelles) |

---

## 3. Définir une entité (EntitySchema)

Un `EntitySchema` est l'équivalent d'une `@Entity` JPA ou d'un modèle Mongoose — il décrit la structure d'une table/collection.

### Exemple : entité `Product`

```typescript
// schemas/product.schema.ts
import type { EntitySchema } from '@mosta/orm'

export const ProductSchema: EntitySchema = {
  name: 'Product',
  collection: 'products',    // nom de la table SQL ou collection MongoDB
  timestamps: true,           // ajoute createdAt + updatedAt automatiquement

  fields: {
    name: {
      type: 'string',
      required: true,
      trim: true,
    },
    description: {
      type: 'string',
    },
    price: {
      type: 'number',
      required: true,
    },
    stock: {
      type: 'number',
      default: 0,
    },
    category: {
      type: 'string',
      enum: ['electronics', 'clothing', 'food', 'books'],
      required: true,
    },
    active: {
      type: 'boolean',
      default: true,
    },
    tags: {
      type: 'array',
      arrayOf: 'string',
    },
    metadata: {
      type: 'json',          // stocké comme JSON / JSONB selon le dialecte
    },
  },

  relations: {
    category: {
      type: 'many-to-one',
      target: 'Category',
      required: false,
    },
    reviews: {
      type: 'one-to-many',
      target: 'Review',
    },
  },

  indexes: [
    { fields: { name: 'asc' }, unique: true },
    { fields: { category: 'asc', price: 'asc' } },
    { fields: { name: 'text' } },   // index full-text
  ],
}
```

### Types de champs disponibles

| Type | SQL | MongoDB | Description |
|------|-----|---------|-------------|
| `string` | `VARCHAR(255)` / `TEXT` | `String` | Texte |
| `number` | `REAL` / `NUMERIC` | `Number` | Entier ou décimal |
| `boolean` | `INTEGER (0/1)` | `Boolean` | Vrai/faux |
| `date` | `DATETIME` / `TIMESTAMP` | `Date` | Date et heure |
| `json` | `TEXT` / `JSONB` | `Mixed` | Objet structuré |
| `array` | `TEXT (JSON sérialisé)` | `Array` | Liste de valeurs |

### Champ embarqué (sous-document)

```typescript
fields: {
  address: {
    type: 'json',     // ou utiliser arrayOf pour des tableaux de sous-docs
    // Pour un tableau de sous-documents structurés :
  },
  schedules: {
    type: 'array',
    arrayOf: {
      kind: 'embedded',
      fields: {
        day:   { type: 'string', required: true },
        start: { type: 'string', required: true },
        end:   { type: 'string', required: true },
      },
    },
  },
},
```

---

## 4. Créer un Repository

Un repository encapsule toutes les opérations sur une entité. Étendez `BaseRepository` pour ajouter des méthodes métier.

```typescript
// repositories/product.repository.ts
import { BaseRepository, type IDialect } from '@mosta/orm'
import { ProductSchema } from '../schemas/product.schema.js'

export interface Product {
  id: string
  name: string
  description?: string
  price: number
  stock: number
  category: string
  active: boolean
  tags?: string[]
  createdAt?: Date
  updatedAt?: Date
}

export class ProductRepository extends BaseRepository<Product> {
  constructor(dialect: IDialect) {
    super(ProductSchema, dialect)
  }

  // Méthodes métier personnalisées
  async findActive(): Promise<Product[]> {
    return this.findAll({ active: true }, { sort: { name: 1 } })
  }

  async findByCategory(category: string): Promise<Product[]> {
    return this.findAll({ category, active: true })
  }

  async findInPriceRange(min: number, max: number): Promise<Product[]> {
    return this.findAll({
      price: { $gte: min, $lte: max },
      active: true,
    })
  }

  async deactivate(id: string): Promise<Product | null> {
    return this.update(id, { active: false })
  }

  async adjustStock(id: string, delta: number): Promise<Product | null> {
    return this.increment(id, 'stock', delta)
  }
}
```

### Enregistrer les schémas et créer le repository

```typescript
// db.ts
import { createConnection, registerSchemas } from '@mosta/orm'
import { ProductSchema } from './schemas/product.schema.js'
import { ProductRepository } from './repositories/product.repository.js'

let productRepo: ProductRepository

export async function initDB() {
  // Enregistrer tous les schémas
  registerSchemas([ProductSchema /*, CategorySchema, ReviewSchema */])

  // Connecter (singleton — sûr d'appeler plusieurs fois)
  const dialect = await createConnection({
    dialect: 'sqlite',
    uri: './data/shop.db',
    schemaStrategy: 'update',
  })

  productRepo = new ProductRepository(dialect)
}

export function getProductRepo(): ProductRepository {
  if (!productRepo) throw new Error('DB not initialized — call initDB() first')
  return productRepo
}
```

---

## 5. Opérations CRUD

### Créer

```typescript
const product = await productRepo.create({
  name: 'Laptop Pro 15"',
  price: 1299.99,
  stock: 50,
  category: 'electronics',
  tags: ['laptop', 'portable', 'pro'],
})

console.log(product.id)        // UUID généré automatiquement
console.log(product.createdAt) // Date de création (si timestamps: true)
```

### Lire

```typescript
// Par ID
const product = await productRepo.findById('abc123')

// Avec filtre
const products = await productRepo.findAll({ category: 'electronics' })

// Premier résultat
const cheapest = await productRepo.findOne(
  { category: 'electronics' },
  { sort: { price: 1 } }
)

// Avec pagination
const page1 = await productRepo.findAll(
  { active: true },
  { sort: { createdAt: -1 }, skip: 0, limit: 20 }
)
```

### Mettre à jour

```typescript
// Mise à jour partielle — seuls les champs fournis sont modifiés
const updated = await productRepo.update('abc123', {
  price: 999.99,
  stock: 45,
})

// Mise à jour de masse
const count = await productRepo.updateMany(
  { category: 'electronics', stock: { $lt: 5 } },
  { active: false }
)
console.log(`${count} produits désactivés`)
```

### Supprimer

```typescript
// Par ID
const deleted = await productRepo.delete('abc123')  // true | false

// Suppression de masse
const count = await productRepo.deleteMany({ active: false })
```

### Compter

```typescript
const total = await productRepo.count()
const active = await productRepo.count({ active: true })
const expensive = await productRepo.count({ price: { $gt: 1000 } })
```

### Upsert (créer ou mettre à jour)

```typescript
// Équivalent Hibernate saveOrUpdate()
const product = await productRepo.upsert(
  { name: 'Laptop Pro 15"' },  // critère de recherche
  { name: 'Laptop Pro 15"', price: 1299.99, stock: 50, category: 'electronics' }
)
```

---

## 6. Filtres avancés

MostaORM offre une API de filtrage inspirée de MongoDB, traduite automatiquement en SQL.

```typescript
// Égalité (implicite)
await productRepo.findAll({ category: 'electronics' })

// Comparaisons
await productRepo.findAll({ price: { $gt: 100, $lte: 500 } })
await productRepo.findAll({ stock: { $gte: 1 } })

// Inclusion / exclusion
await productRepo.findAll({ category: { $in: ['electronics', 'books'] } })
await productRepo.findAll({ category: { $nin: ['food'] } })

// Inégalité
await productRepo.findAll({ category: { $ne: 'food' } })

// Existence d'un champ
await productRepo.findAll({ description: { $exists: true } })

// Regex (recherche partielle)
await productRepo.findAll({ name: { $regex: 'laptop', $regexFlags: 'i' } })

// Opérateurs logiques
await productRepo.findAll({
  $or: [
    { price: { $lt: 50 } },
    { category: 'food' },
  ],
})

await productRepo.findAll({
  $and: [
    { active: true },
    { stock: { $gt: 0 } },
    { price: { $lte: 100 } },
  ],
})
```

### Options de requête (QueryOptions)

```typescript
await productRepo.findAll(
  { active: true },
  {
    sort: { price: 1, name: 1 },   // 1 = ASC, -1 = DESC
    skip: 40,                       // décalage (pagination)
    limit: 20,                      // maximum de résultats
    select: ['id', 'name', 'price'], // projection — champs à inclure
    exclude: ['metadata'],           // champs à exclure
  }
)
```

---

## 7. Relations entre entités

### Définir les schémas liés

```typescript
// schemas/category.schema.ts
export const CategorySchema: EntitySchema = {
  name: 'Category',
  collection: 'categories',
  timestamps: false,
  fields: {
    name: { type: 'string', required: true, unique: true },
    slug: { type: 'string', required: true, unique: true },
  },
  relations: {},
  indexes: [],
}

// Dans ProductSchema
relations: {
  category: {
    type: 'many-to-one',
    target: 'Category',
    select: ['id', 'name', 'slug'],  // champs à inclure lors du JOIN/populate
  },
}
```

### Charger avec les relations

```typescript
// Un produit avec sa catégorie chargée
const product = await productRepo.findByIdWithRelations(
  'abc123',
  ['category']
)
// product.category = { id: '...', name: 'Electronics', slug: 'electronics' }

// Plusieurs produits avec relations
const products = await productRepo.findWithRelations(
  { active: true },
  ['category', 'reviews'],
  { sort: { name: 1 } }
)
```

### Types de relations

```typescript
relations: {
  // Un produit appartient à une catégorie
  category: {
    type: 'many-to-one',
    target: 'Category',
    required: true,
  },

  // Un produit a plusieurs avis
  reviews: {
    type: 'one-to-many',
    target: 'Review',
  },

  // Relation many-to-many via table de jonction
  tags: {
    type: 'many-to-many',
    target: 'Tag',
    through: 'product_tags',  // nom de la table de jonction (SQL)
  },

  // Un produit a un seul profil technique
  specs: {
    type: 'one-to-one',
    target: 'ProductSpec',
    nullable: true,
  },
}
```

---

## 8. Agrégations

L'API d'agrégation est inspirée du pipeline MongoDB — traduit en SQL GROUP BY / HAVING.

### Compter par catégorie

```typescript
const stats = await productRepo.aggregate([
  { $match: { active: true } },
  {
    $group: {
      _by: 'category',
      count: { $count: true },
      avgPrice: { $avg: 'price' },
      minPrice: { $min: 'price' },
      maxPrice: { $max: 'price' },
      totalStock: { $sum: 'stock' },
    },
  },
  { $sort: { count: -1 } },
])

// Résultat :
// [
//   { _by: 'electronics', count: 42, avgPrice: 450, minPrice: 9.99, maxPrice: 2999, totalStock: 380 },
//   { _by: 'books',       count: 120, avgPrice: 22, minPrice: 2.99, maxPrice: 89, totalStock: 1500 },
// ]
```

### Valeurs distinctes

```typescript
const categories = await productRepo.distinct('category')
// ['electronics', 'clothing', 'food', 'books']

const brands = await productRepo.distinct('brand', { active: true })
```

### Accumulateurs disponibles

| Accumulateur | SQL | Description |
|-------------|-----|-------------|
| `$count: true` | `COUNT(*)` | Nombre de documents |
| `$sum: 'field'` | `SUM(field)` | Somme d'un champ numérique |
| `$sum: 1` | `COUNT(*)` | Comptage (alias) |
| `$avg: 'field'` | `AVG(field)` | Moyenne |
| `$min: 'field'` | `MIN(field)` | Valeur minimale |
| `$max: 'field'` | `MAX(field)` | Valeur maximale |

---

## 9. Recherche plein texte

```typescript
// Recherche dans tous les champs string du schéma
const results = await productRepo.search('laptop pro')

// Avec options
const results = await productRepo.search(
  'laptop',
  { sort: { price: 1 }, limit: 10 }
)
```

> **Note** : La recherche utilise des index `text` sur MongoDB, et `LIKE %query%` sur les dialectes SQL. Pour des recherches avancées, utilisez l'opérateur `$regex` dans les filtres.

### Opération sur les tableaux

```typescript
// Ajouter un tag (sans doublon)
await productRepo.addToSet('abc123', 'tags', 'bestseller')

// Retirer un tag
await productRepo.pull('abc123', 'tags', 'discontinued')

// Incrémenter le stock
await productRepo.increment('abc123', 'stock', -3)  // -3 = décrémenter
```

---

## 10. Changer de dialecte

C'est la force principale de MostaORM : **zéro changement de code métier** pour changer de base de données.

### Avant (SQLite local)

```env
DB_DIALECT=sqlite
SGBD_URI=./data/shop.db
DB_SCHEMA_STRATEGY=update
```

### Après (PostgreSQL en production)

```env
DB_DIALECT=postgres
SGBD_URI=postgresql://user:pass@db.example.com:5432/shopdb
DB_SCHEMA_STRATEGY=validate
DB_POOL_SIZE=10
```

Le repository `ProductRepository` et tout le code métier restent **identiques**.

### Migration SQLite → MongoDB

```env
DB_DIALECT=mongodb
SGBD_URI=mongodb+srv://user:pass@cluster.mongodb.net/shopdb
DB_SCHEMA_STRATEGY=update
```

Installez le driver : `npm install mongoose`

---

## 11. Application Express complète

Voici une API REST complète avec MostaORM.

### Structure du projet

```
my-shop-api/
├── src/
│   ├── schemas/
│   │   └── product.schema.ts
│   ├── repositories/
│   │   └── product.repository.ts
│   ├── routes/
│   │   └── products.ts
│   ├── db.ts
│   └── index.ts
├── .env
└── package.json
```

### `src/db.ts`

```typescript
import { createConnection, registerSchemas } from '@mosta/orm'
import { ProductSchema } from './schemas/product.schema.js'
import { ProductRepository } from './repositories/product.repository.js'

let productRepository: ProductRepository

export async function initDB(): Promise<void> {
  registerSchemas([ProductSchema])

  const dialect = await createConnection({
    dialect: (process.env.DB_DIALECT as any) || 'sqlite',
    uri: process.env.SGBD_URI || './data/shop.db',
    schemaStrategy: 'update',
    showSql: process.env.NODE_ENV !== 'production',
  })

  productRepository = new ProductRepository(dialect)
  console.log('✅ Database connected')
}

export const repos = {
  get products() { return productRepository },
}
```

### `src/routes/products.ts`

```typescript
import { Router } from 'express'
import { repos } from '../db.js'

const router = Router()

// GET /products?category=electronics&page=1&limit=20
router.get('/', async (req, res) => {
  try {
    const { category, search, page = '1', limit = '20', minPrice, maxPrice } = req.query

    const filter: any = { active: true }
    if (category) filter.category = category
    if (minPrice || maxPrice) {
      filter.price = {}
      if (minPrice) filter.price.$gte = Number(minPrice)
      if (maxPrice) filter.price.$lte = Number(maxPrice)
    }

    const pageNum = parseInt(page as string)
    const limitNum = parseInt(limit as string)

    let products
    if (search) {
      products = await repos.products.search(search as string, { limit: limitNum })
    } else {
      products = await repos.products.findAll(filter, {
        sort: { name: 1 },
        skip: (pageNum - 1) * limitNum,
        limit: limitNum,
      })
    }

    const total = await repos.products.count(filter)

    res.json({
      data: products,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /products/:id
router.get('/:id', async (req, res) => {
  const product = await repos.products.findById(req.params.id)
  if (!product) return res.status(404).json({ error: 'Product not found' })
  res.json({ data: product })
})

// POST /products
router.post('/', async (req, res) => {
  try {
    const product = await repos.products.create(req.body)
    res.status(201).json({ data: product })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// PUT /products/:id
router.put('/:id', async (req, res) => {
  const product = await repos.products.update(req.params.id, req.body)
  if (!product) return res.status(404).json({ error: 'Product not found' })
  res.json({ data: product })
})

// DELETE /products/:id
router.delete('/:id', async (req, res) => {
  const deleted = await repos.products.delete(req.params.id)
  if (!deleted) return res.status(404).json({ error: 'Product not found' })
  res.status(204).send()
})

// GET /products/stats/by-category
router.get('/stats/by-category', async (req, res) => {
  const stats = await repos.products.aggregate([
    { $match: { active: true } },
    {
      $group: {
        _by: 'category',
        count: { $count: true },
        avgPrice: { $avg: 'price' },
        totalStock: { $sum: 'stock' },
      },
    },
    { $sort: { count: -1 } },
  ])
  res.json({ data: stats })
})

export default router
```

### `src/index.ts`

```typescript
import 'dotenv/config'
import express from 'express'
import { initDB } from './db.js'
import productsRouter from './routes/products.js'

const app = express()
app.use(express.json())

app.use('/api/products', productsRouter)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

async function start() {
  await initDB()
  const PORT = process.env.PORT || 3000
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  })
}

start().catch(console.error)
```

### `.env`

```env
DB_DIALECT=sqlite
SGBD_URI=./data/shop.db
DB_SCHEMA_STRATEGY=update
DB_SHOW_SQL=true
PORT=3000
```

### Lancer l'application

```bash
npm install better-sqlite3 express dotenv
npx tsc
node dist/index.js
```

Test rapide :

```bash
# Créer un produit
curl -X POST http://localhost:3000/api/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Laptop Pro","price":999,"stock":10,"category":"electronics"}'

# Lister les produits
curl http://localhost:3000/api/products?category=electronics

# Statistiques par catégorie
curl http://localhost:3000/api/products/stats/by-category
```

---

## Étapes suivantes

- [docs/dialects.md](./dialects.md) — Configuration détaillée de chaque dialecte
- [docs/api-reference.md](./api-reference.md) — Référence complète de l'API
- [examples/](../examples/) — Exemples complets (contact-manager, balloon-booking)

#!/usr/bin/env npx tsx
// Author: Dr Hamid MADANI drmdh@msn.com
// Test de validation des dialects @mostajs/orm
// Usage: npx tsx orm-scripts-tests/test-sgbd.ts <dialect>
// Teste: connexion, schéma, CRUD, relations, findAll, count, upsert, delete
// Dépendance unique: @mostajs/orm + driver du dialect

import { SGBD_CONFIGS } from './config'
import { TestRunner, logHeader, logStep, logInfo } from './helpers'

const dialectArg = process.argv[2]
if (!dialectArg || !SGBD_CONFIGS[dialectArg]) {
  console.error(`Usage: npx tsx orm-scripts-tests/test-sgbd.ts <dialect>`)
  console.error(`Dialects: ${Object.keys(SGBD_CONFIGS).join(', ')}`)
  process.exit(1)
}

const config = SGBD_CONFIGS[dialectArg]
const runner = new TestRunner(config.label)

// ─── Env AVANT tout import ORM ──────────────────────────────────
process.env.DB_DIALECT = config.dialect
process.env.SGBD_URI = config.uri
process.env.DB_SCHEMA_STRATEGY = 'create'

logHeader(`Validation Dialect — ${config.label}`)
logInfo(`Dialect: ${config.dialect}`)
logInfo(`URI: ${config.uri}`)
logInfo(`Strategy: create`)

// ─── Schémas de test (autonomes, zéro dépendance externe) ──────
const CategorySchema = {
  name: 'Category',
  collection: 'test_categories',
  timestamps: true,
  fields: {
    name: { type: 'string' as const, required: true, unique: true },
    description: { type: 'string' as const, default: '' },
    order: { type: 'number' as const, default: 0 },
    active: { type: 'boolean' as const, default: true },
  },
  relations: {},
  indexes: [{ fields: { order: 'asc' as const } }],
}

const ProductSchema = {
  name: 'Product',
  collection: 'test_products',
  timestamps: true,
  fields: {
    name: { type: 'string' as const, required: true },
    slug: { type: 'string' as const, required: true, unique: true },
    price: { type: 'number' as const, required: true },
    stock: { type: 'number' as const, default: 0 },
    status: { type: 'string' as const, enum: ['active', 'archived', 'draft'], default: 'draft' },
    tags: { type: 'array' as const, arrayOf: 'string' as const },
    metadata: { type: 'json' as const },
  },
  relations: {
    category: { target: 'Category', type: 'many-to-one' as const },
  },
  indexes: [
    { fields: { status: 'asc' as const, price: 'desc' as const } },
  ],
}

const OrderSchema = {
  name: 'Order',
  collection: 'test_orders',
  timestamps: true,
  fields: {
    orderNumber: { type: 'string' as const, required: true, unique: true },
    total: { type: 'number' as const, required: true },
    status: { type: 'string' as const, enum: ['pending', 'paid', 'shipped', 'cancelled'], default: 'pending' },
    notes: { type: 'string' as const },
    orderDate: { type: 'date' as const, default: 'now' },
  },
  relations: {
    product: { target: 'Product', type: 'many-to-one' as const, required: true },
  },
  indexes: [
    { fields: { status: 'asc' as const } },
  ],
}

const TEST_SCHEMAS = [CategorySchema, ProductSchema, OrderSchema]

async function main() {
  const { registerSchemas, getDialect, disconnectDialect, BaseRepository } = await import('@mostajs/orm')

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 : Connexion
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 1 — Connexion au SGBD')

  const phase1Ok = await runner.run('connexion', 'getDialect() — connexion + singleton', async () => {
    registerSchemas(TEST_SCHEMAS)
    const dialect = await getDialect()
    if (!dialect) throw new Error('getDialect() a retourné null')
    logInfo(`  Dialect: ${dialect.constructor.name}`)
  })

  if (!phase1Ok) {
    logInfo(`Connexion impossible — arrêt des tests pour ${config.label}`)
    runner.printSummary()
    process.exit(1)
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2 : Repos + schéma créé
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 2 — Repositories & schéma')

  let catRepo: InstanceType<typeof BaseRepository>
  let prodRepo: InstanceType<typeof BaseRepository>
  let orderRepo: InstanceType<typeof BaseRepository>

  await runner.run('schema', 'BaseRepository(Category)', async () => {
    const dialect = await getDialect()
    catRepo = new BaseRepository(CategorySchema, dialect)
    const count = await catRepo.count()
    logInfo(`  Categories existantes: ${count}`)
  })

  await runner.run('schema', 'BaseRepository(Product)', async () => {
    const dialect = await getDialect()
    prodRepo = new BaseRepository(ProductSchema, dialect)
    const count = await prodRepo.count()
    logInfo(`  Products existants: ${count}`)
  })

  await runner.run('schema', 'BaseRepository(Order)', async () => {
    const dialect = await getDialect()
    orderRepo = new BaseRepository(OrderSchema, dialect)
    const count = await orderRepo.count()
    logInfo(`  Orders existantes: ${count}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3 : CRUD — Create
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 3 — Create')

  let cat1Id: string, cat2Id: string
  let prod1Id: string, prod2Id: string, prod3Id: string

  await runner.run('create', 'Category — create 2', async () => {
    const c1 = await catRepo.create({ name: 'Electronique', description: 'Appareils electroniques', order: 1 })
    const c2 = await catRepo.create({ name: 'Vetements', description: 'Mode et textile', order: 2 })
    if (!c1?.id || !c2?.id) throw new Error('create() sans id')
    cat1Id = c1.id
    cat2Id = c2.id
    logInfo(`  Cat1: ${cat1Id}, Cat2: ${cat2Id}`)
  })

  await runner.run('create', 'Product — create 3 avec relation category', async () => {
    const p1 = await prodRepo.create({ name: 'Laptop Pro', slug: 'laptop-pro', price: 120000, stock: 15, status: 'active', category: cat1Id, tags: ['laptop', 'pro'], metadata: { brand: 'MostaTech', year: 2025 } })
    const p2 = await prodRepo.create({ name: 'T-Shirt Classic', slug: 'tshirt-classic', price: 2500, stock: 100, status: 'active', category: cat2Id, tags: ['tshirt', 'coton'] })
    const p3 = await prodRepo.create({ name: 'Ecouteurs BT', slug: 'ecouteurs-bt', price: 5000, stock: 0, status: 'draft', category: cat1Id })
    if (!p1?.id || !p2?.id || !p3?.id) throw new Error('create() sans id')
    prod1Id = p1.id; prod2Id = p2.id; prod3Id = p3.id
    logInfo(`  Prod1: ${prod1Id}, Prod2: ${prod2Id}, Prod3: ${prod3Id}`)
  })

  await runner.run('create', 'Order — create 2 avec relation product', async () => {
    const o1 = await orderRepo.create({ orderNumber: 'CMD-001', total: 120000, status: 'paid', product: prod1Id, notes: 'Livraison express' })
    const o2 = await orderRepo.create({ orderNumber: 'CMD-002', total: 5000, status: 'pending', product: prod2Id })
    if (!o1?.id || !o2?.id) throw new Error('create() sans id')
    logInfo(`  Order1: ${o1.id}, Order2: ${o2.id}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4 : CRUD — Read
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 4 — Read')

  await runner.run('read', 'findById()', async () => {
    const cat = await catRepo.findById(cat1Id)
    if (!cat) throw new Error('findById null')
    if ((cat as any).name !== 'Electronique') throw new Error(`name: ${(cat as any).name}`)
    logInfo(`  Category: ${(cat as any).name}`)
  })

  await runner.run('read', 'findOne({ slug })', async () => {
    const prod = await prodRepo.findOne({ slug: 'laptop-pro' })
    if (!prod) throw new Error('findOne null')
    if ((prod as any).price !== 120000) throw new Error(`price: ${(prod as any).price}`)
    logInfo(`  Product: ${(prod as any).name}, price: ${(prod as any).price}`)
  })

  await runner.run('read', 'findAll()', async () => {
    const all = await prodRepo.findAll()
    if (all.length !== 3) throw new Error(`findAll: ${all.length} au lieu de 3`)
    logInfo(`  Products: ${all.length}`)
  })

  await runner.run('read', 'count()', async () => {
    const c = await catRepo.count()
    if (c !== 2) throw new Error(`count: ${c} au lieu de 2`)
    const p = await prodRepo.count()
    if (p !== 3) throw new Error(`count products: ${p} au lieu de 3`)
    logInfo(`  Categories: ${c}, Products: ${p}`)
  })

  await runner.run('read', 'findAll({ status: "active" }) — filtré', async () => {
    const active = await prodRepo.findAll({ status: 'active' })
    if (active.length !== 2) throw new Error(`active: ${active.length} au lieu de 2`)
    logInfo(`  Products actifs: ${active.length}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5 : CRUD — Update
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 5 — Update')

  await runner.run('update', 'update() — modifier prix', async () => {
    await prodRepo.update(prod3Id, { price: 4500, stock: 25, status: 'active' })
    const updated = await prodRepo.findById(prod3Id)
    if ((updated as any).price !== 4500) throw new Error(`price: ${(updated as any).price}`)
    if ((updated as any).stock !== 25) throw new Error(`stock: ${(updated as any).stock}`)
    if ((updated as any).status !== 'active') throw new Error(`status: ${(updated as any).status}`)
    logInfo(`  Ecouteurs: price=${(updated as any).price}, stock=${(updated as any).stock}`)
  })

  await runner.run('update', 'upsert() — créer si inexistant', async () => {
    const cat3 = await catRepo.upsert({ name: 'Sport' }, { name: 'Sport', description: 'Articles de sport', order: 3 })
    if (!cat3?.id) throw new Error('upsert create: pas d\'id')
    logInfo(`  Upsert créé: ${cat3.id}`)

    // Upsert sur existant — doit mettre à jour
    const cat3bis = await catRepo.upsert({ name: 'Sport' }, { name: 'Sport', description: 'Sport et fitness', order: 3 })
    if (String(cat3bis.id) !== String(cat3.id)) throw new Error(`upsert update: id différent ${cat3bis.id} vs ${cat3.id}`)
    const reloaded = await catRepo.findById(cat3.id)
    if ((reloaded as any).description !== 'Sport et fitness') throw new Error(`description: ${(reloaded as any).description}`)
    logInfo(`  Upsert update OK: ${(reloaded as any).description}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // PHASE 6 : CRUD — Delete
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 6 — Delete')

  await runner.run('delete', 'delete() — supprimer un product', async () => {
    const beforeCount = await prodRepo.count()
    await prodRepo.delete(prod3Id)
    const afterCount = await prodRepo.count()
    if (afterCount !== beforeCount - 1) throw new Error(`count: ${afterCount} au lieu de ${beforeCount - 1}`)
    const deleted = await prodRepo.findById(prod3Id)
    if (deleted) throw new Error('findById après delete: pas null')
    logInfo(`  Supprimé prod3, count: ${beforeCount} → ${afterCount}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // PHASE 7 : Opérations avancées
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 7 — Opérations avancées')

  await runner.run('avancé', 'create en masse (10 products)', async () => {
    for (let i = 1; i <= 10; i++) {
      await prodRepo.create({
        name: `Produit Batch ${i}`,
        slug: `batch-${i}`,
        price: 1000 * i,
        stock: i * 5,
        status: i % 2 === 0 ? 'active' : 'draft',
        category: i % 2 === 0 ? cat1Id : cat2Id,
      })
    }
    const total = await prodRepo.count()
    if (total < 12) throw new Error(`count: ${total} (attendu >= 12)`)
    logInfo(`  Total products: ${total}`)
  })

  await runner.run('avancé', 'findAll filtré + count cohérent', async () => {
    const drafts = await prodRepo.findAll({ status: 'draft' })
    const actives = await prodRepo.findAll({ status: 'active' })
    const total = await prodRepo.count()
    logInfo(`  Drafts: ${drafts.length}, Actives: ${actives.length}, Total: ${total}`)
    if (drafts.length + actives.length !== total) {
      throw new Error(`Incohérence: ${drafts.length} + ${actives.length} != ${total}`)
    }
  })

  await runner.run('avancé', 'update en boucle + vérification', async () => {
    const drafts = await prodRepo.findAll({ status: 'draft' })
    for (const d of drafts) {
      await prodRepo.update(d.id, { status: 'archived' })
    }
    const archived = await prodRepo.findAll({ status: 'archived' })
    if (archived.length !== drafts.length) {
      throw new Error(`archived: ${archived.length} vs ${drafts.length}`)
    }
    logInfo(`  Archivés: ${archived.length}`)
  })

  await runner.run('avancé', 'Order avec relation product valide', async () => {
    const o = await orderRepo.create({ orderNumber: 'CMD-003', total: 7500, status: 'shipped', product: prod2Id })
    if (!o?.id) throw new Error('create order échoué')
    const found = await orderRepo.findOne({ orderNumber: 'CMD-003' })
    if (!found) throw new Error('findOne order null')
    if ((found as any).total !== 7500) throw new Error(`total: ${(found as any).total}`)
    logInfo(`  Order CMD-003: total=${(found as any).total}, status=${(found as any).status}`)
  })

  // ═══════════════════════════════════════════════════════════════
  // PHASE 8 : Nettoyage complet + vérification
  // ═══════════════════════════════════════════════════════════════
  logStep('Phase 8 — Nettoyage')

  await runner.run('cleanup', 'Suppression de toutes les données de test', async () => {
    // Delete orders first (dépendance product)
    const orders = await orderRepo.findAll()
    for (const o of orders) await orderRepo.delete(o.id)
    logInfo(`  Orders supprimées: ${orders.length}`)

    // Delete products (dépendance category)
    const products = await prodRepo.findAll()
    for (const p of products) await prodRepo.delete(p.id)
    logInfo(`  Products supprimés: ${products.length}`)

    // Delete categories
    const cats = await catRepo.findAll()
    for (const c of cats) await catRepo.delete(c.id)
    logInfo(`  Categories supprimées: ${cats.length}`)

    // Vérifier que tout est vide
    const rc = await catRepo.count()
    const rp = await prodRepo.count()
    const ro = await orderRepo.count()
    if (rc !== 0 || rp !== 0 || ro !== 0) {
      throw new Error(`Reste: categories=${rc}, products=${rp}, orders=${ro}`)
    }
  })

  await disconnectDialect()
  logInfo('Dialect déconnecté')

  const allPassed = runner.printSummary()
  process.exit(allPassed ? 0 : 1)
}

main().catch(err => {
  console.error('\nErreur fatale:', err)
  process.exit(2)
})

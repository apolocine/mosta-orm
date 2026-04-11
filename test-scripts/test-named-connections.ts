// @mostajs/orm — Tests Named Connection Registry
// Author: Dr Hamid MADANI drmdh@msn.com
// Usage: npx tsx test-scripts/test-named-connections.ts

import {
  createIsolatedDialect,
  registerSchemas,
  clearRegistry,
  registerNamedConnection,
  getNamedConnection,
  removeNamedConnection,
  listNamedConnections,
  clearNamedConnections,
} from '../src/index.js'
import type { EntitySchema } from '../src/core/types.js'

let passed = 0
let failed = 0

function assert(ok: boolean, msg: string) {
  if (ok) { passed++; console.log(`  ✅ ${msg}`) }
  else { failed++; console.log(`  ❌ ${msg}`) }
}

const TestSchema: EntitySchema = {
  name: 'TestEntity',
  collection: 'test_entities',
  timestamps: true,
  fields: { name: { type: 'string', required: true } },
  relations: {},
  indexes: [],
}

async function run() {
  console.log('══════════════════════════════════════════════')
  console.log('  @mostajs/orm — Named Connection Registry')
  console.log('══════════════════════════════════════════════\n')

  // T1 — Empty registry
  console.log('T1 — Registry initial state')
  assert(getNamedConnection('portal') === null, 'getNamedConnection("portal") → null')
  assert(listNamedConnections().length === 0, 'listNamedConnections() → []')

  // T2 — Register a connection
  console.log('\nT2 — Register connection')
  clearRegistry()
  registerSchemas([TestSchema])
  const dialect1 = await createIsolatedDialect(
    { dialect: 'sqlite', uri: ':memory:', schemaStrategy: 'create' },
    [TestSchema],
  )
  assert(!!dialect1, 'dialect1 created')

  registerNamedConnection('portal', dialect1)
  assert(getNamedConnection('portal') === dialect1, 'getNamedConnection("portal") → same instance')
  assert(listNamedConnections().length === 1, 'listNamedConnections() → ["portal"]')
  assert(listNamedConnections()[0] === 'portal', 'name is "portal"')

  // T3 — Register multiple
  console.log('\nT3 — Multiple connections')
  const dialect2 = await createIsolatedDialect(
    { dialect: 'sqlite', uri: ':memory:', schemaStrategy: 'create' },
    [TestSchema],
  )
  registerNamedConnection('analytics', dialect2)
  assert(listNamedConnections().length === 2, '2 connections registered')
  assert(getNamedConnection('analytics') === dialect2, 'analytics → dialect2')
  assert(getNamedConnection('portal') === dialect1, 'portal still → dialect1')

  // T4 — Overwrite
  console.log('\nT4 — Overwrite connection')
  const dialect3 = await createIsolatedDialect(
    { dialect: 'sqlite', uri: ':memory:', schemaStrategy: 'create' },
    [TestSchema],
  )
  registerNamedConnection('portal', dialect3)
  assert(getNamedConnection('portal') === dialect3, 'portal overwritten → dialect3')
  assert(getNamedConnection('portal') !== dialect1, 'portal !== old dialect1')
  assert(listNamedConnections().length === 2, 'still 2 connections')

  // T5 — Remove
  console.log('\nT5 — Remove connection')
  removeNamedConnection('analytics')
  assert(getNamedConnection('analytics') === null, 'analytics removed → null')
  assert(listNamedConnections().length === 1, '1 connection left')

  // T6 — Non-existent
  console.log('\nT6 — Non-existent connection')
  assert(getNamedConnection('does-not-exist') === null, 'non-existent → null')
  removeNamedConnection('does-not-exist') // no throw
  assert(true, 'removeNamedConnection("does-not-exist") → no error')

  // T7 — Use registered connection for CRUD
  console.log('\nT7 — CRUD via named connection')
  const { BaseRepository } = await import('../src/core/base-repository.js')
  const portal = getNamedConnection('portal')!
  const repo = new BaseRepository(TestSchema, portal)
  const created = await repo.create({ name: 'Test Item' } as any) as any
  assert(!!created.id, `Created via named connection: id=${created.id}`)
  const found = await repo.findById(created.id) as any
  assert(found?.name === 'Test Item', 'Found via named connection')

  // T8 — Clear all
  console.log('\nT8 — Clear all connections')
  clearNamedConnections()
  assert(listNamedConnections().length === 0, 'all connections cleared')
  assert(getNamedConnection('portal') === null, 'portal → null after clear')

  // Cleanup
  await dialect1.disconnect()
  await dialect2.disconnect()
  await dialect3.disconnect()
  clearRegistry()

  console.log(`\n══════════════════════════════════════════════`)
  console.log(`  Resultats: ${passed} passed, ${failed} failed`)
  console.log(`══════════════════════════════════════════════`)
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(e => { console.error(e); process.exit(1) })

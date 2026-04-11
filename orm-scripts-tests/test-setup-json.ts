// Author: Dr Hamid MADANI drmdh@msn.com
// Unit test for loadSetupJson() — no DB needed, pure logic test
import { loadSetupJson } from '../../mostajs/mosta-setup/lib/load-setup-json'
import type { SetupJson } from '../../mostajs/mosta-setup/lib/load-setup-json'
import fs from 'fs'
import path from 'path'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const NC = '\x1b[0m'

let passed = 0
let failed = 0

function ok(name: string) {
  console.log(`  ${GREEN}✓${NC} ${name}`)
  passed++
}

function fail(name: string, err: unknown) {
  console.log(`  ${RED}✗${NC} ${name}: ${err}`)
  failed++
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ── Mock repo factory (no DB) ────────────────────────────

const store: Record<string, Record<string, unknown>[]> = {}

function mockRepoFactory(collection: string) {
  if (!store[collection]) store[collection] = []
  const items = store[collection]

  return Promise.resolve({
    upsert: async (where: Record<string, unknown>, data: Record<string, unknown>) => {
      const key = Object.keys(where)[0]
      const idx = items.findIndex(i => i[key] === where[key])
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...data }
        return { id: items[idx].id as string }
      }
      const id = `${collection}-${items.length + 1}`
      items.push({ ...data, id })
      return { id }
    },
    create: async (data: Record<string, unknown>) => {
      const id = `${collection}-${items.length + 1}`
      items.push({ ...data, id })
      return { id }
    },
    findOne: async (where: Record<string, unknown>) => {
      const key = Object.keys(where)[0]
      return items.find(i => i[key] === where[key]) as { id: string } | null ?? null
    },
    count: async () => items.length,
  })
}

// ── Tests ────────────────────────────────────────────────

async function testLoadFromFile() {
  const config = await loadSetupJson('./setup.json', mockRepoFactory)

  assert(config.appName === 'SecuAccessPro', `appName should be SecuAccessPro, got ${config.appName}`)
  assert(config.defaultPort === 4567, `port should be 4567, got ${config.defaultPort}`)
  assert(config.extraEnvVars?.MOSTAJS_MODULES !== undefined, 'extraEnvVars should have MOSTAJS_MODULES')
  ok('loadSetupJson from file — app config')
}

async function testLoadFromObject() {
  const json: SetupJson = {
    app: { name: 'TestApp', port: 3000 },
  }
  const config = await loadSetupJson(json, mockRepoFactory)
  assert(config.appName === 'TestApp', 'appName should be TestApp')
  assert(config.defaultPort === 3000, 'port should be 3000')
  assert(config.seedRBAC === undefined, 'seedRBAC should be undefined (no rbac)')
  assert(config.optionalSeeds === undefined, 'optionalSeeds should be undefined (no seeds)')
  ok('loadSetupJson from object — minimal config')
}

async function testSeedRBAC() {
  // Reset store
  for (const k of Object.keys(store)) delete store[k]

  // Read expected counts from setup.json
  const raw = JSON.parse(fs.readFileSync('./setup.json', 'utf-8'))
  const expectedCats = raw.rbac?.categories?.length ?? 0
  const expectedPerms = raw.rbac?.permissions?.length ?? 0
  const expectedRoles = (raw.rbac?.roles ?? []).filter((r: { name: string }) => r.name).length

  const config = await loadSetupJson('./setup.json', mockRepoFactory)
  assert(typeof config.seedRBAC === 'function', 'seedRBAC should be a function')

  await config.seedRBAC!()

  assert(store.permissionCategory?.length === expectedCats, `should have ${expectedCats} categories, got ${store.permissionCategory?.length}`)
  assert(store.permission?.length === expectedPerms, `should have ${expectedPerms} permissions, got ${store.permission?.length}`)
  assert(store.role?.length === expectedRoles, `should have ${expectedRoles} roles, got ${store.role?.length}`)

  // Admin role should have all permission IDs (wildcard *)
  const adminRole = store.role!.find(r => r.name === 'admin')
  assert(adminRole !== undefined, 'admin role should exist')
  assert(Array.isArray(adminRole!.permissions), 'admin permissions should be array')
  assert((adminRole!.permissions as string[]).length === expectedPerms, `admin should have ${expectedPerms} perms, got ${(adminRole!.permissions as string[]).length}`)

  ok(`seedRBAC — ${expectedCats} categories, ${expectedPerms} permissions, ${expectedRoles} roles`)
}

async function testOptionalSeeds() {
  const config = await loadSetupJson('./setup.json', mockRepoFactory)
  assert(Array.isArray(config.optionalSeeds), 'optionalSeeds should be array')
  assert(config.optionalSeeds!.length === 2, `should have 2 seeds, got ${config.optionalSeeds!.length}`)

  const actSeed = config.optionalSeeds!.find(s => s.key === 'activities')
  assert(actSeed !== undefined, 'activities seed should exist')
  assert(actSeed!.default === true, 'activities should be default=true')
  assert(actSeed!.label === 'Activites', `label should be 'Activites', got '${actSeed!.label}'`)

  const userSeed = config.optionalSeeds!.find(s => s.key === 'demoUsers')
  assert(userSeed !== undefined, 'demoUsers seed should exist')
  assert(userSeed!.default === undefined || userSeed!.default === false, 'demoUsers should not be default')

  ok('optionalSeeds — structure and defaults')
}

async function testRunActivitySeed() {
  // Reset store
  for (const k of Object.keys(store)) delete store[k]

  // Read expected count from setup.json
  const raw = JSON.parse(fs.readFileSync('./setup.json', 'utf-8'))
  const expectedCount = raw.seeds?.find((s: { key: string }) => s.key === 'activities')?.data?.length ?? 0

  const config = await loadSetupJson('./setup.json', mockRepoFactory)
  const actSeed = config.optionalSeeds!.find(s => s.key === 'activities')!

  await actSeed.run({})

  assert(store.activity?.length === expectedCount, `should seed ${expectedCount} activities, got ${store.activity?.length}`)

  const piscine = store.activity!.find(a => a.slug === 'piscine')
  assert(piscine !== undefined, 'piscine should exist')
  assert(piscine!.currency === 'DA', 'defaults should merge — currency=DA')
  assert(piscine!.status === 'active', 'defaults should merge — status=active')
  assert(Array.isArray(piscine!.schedule), 'defaults should merge — schedule array')

  ok(`run activities seed — ${expectedCount} records with defaults merged`)
}

async function testRunDemoUsersSeed() {
  // Reset store and create a role first
  for (const k of Object.keys(store)) delete store[k]

  // Pre-create role so roleField resolution works
  await mockRepoFactory('role').then(r => r.create!({ name: 'agent_accueil' }))
  await mockRepoFactory('role').then(r => r.create!({ name: 'agent_attraction' }))
  await mockRepoFactory('role').then(r => r.create!({ name: 'superviseur' }))

  const config = await loadSetupJson('./setup.json', mockRepoFactory)
  const userSeed = config.optionalSeeds!.find(s => s.key === 'demoUsers')!

  await userSeed.run({})

  const expectedUsers = JSON.parse(fs.readFileSync('./setup.json', 'utf-8')).seeds?.find((s: { key: string }) => s.key === 'demoUsers')?.data?.length ?? 0
  assert(store.user?.length === expectedUsers, `should seed ${expectedUsers} users, got ${store.user?.length}`)

  const karim = store.user!.find(u => u.email === 'accueil@secuaccess.dz')
  assert(karim !== undefined, 'karim should exist')
  // Password should be hashed (not plaintext)
  assert(karim!.password !== 'Agent@123456', 'password should be hashed')
  assert((karim!.password as string).startsWith('$2'), 'password should be bcrypt hash')
  // Role should be resolved to ID
  assert(Array.isArray(karim!.roles), 'roles should be array of IDs')
  assert((karim!.roles as string[])[0] === 'role-1', `role should be resolved to role-1, got ${(karim!.roles as string[])[0]}`)
  // roleField should be deleted
  assert(karim!.role === undefined, 'role field should be deleted after resolution')
  // Default status
  assert(karim!.status === 'active', 'defaults should merge — status=active')

  ok('run demoUsers seed — hashed password, resolved roles, defaults merged')
}

async function testIdempotentSeed() {
  // Reset store
  for (const k of Object.keys(store)) delete store[k]

  const config = await loadSetupJson('./setup.json', mockRepoFactory)
  const actSeed = config.optionalSeeds!.find(s => s.key === 'activities')!

  const expectedCount = JSON.parse(fs.readFileSync('./setup.json', 'utf-8')).seeds?.find((s: { key: string }) => s.key === 'activities')?.data?.length ?? 0

  await actSeed.run({})
  assert(store.activity?.length === expectedCount, `first run: ${expectedCount} activities`)

  // Run again — should upsert, not duplicate
  await actSeed.run({})
  assert(store.activity?.length === expectedCount, `second run should still be ${expectedCount}, got ${store.activity?.length}`)

  ok('idempotent seed — upsert does not duplicate')
}

async function testValidationErrors() {
  // Missing app.name
  try {
    await loadSetupJson({ app: { name: '' } } as SetupJson, mockRepoFactory)
    fail('validation — empty app.name', 'should have thrown')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    assert(msg.includes('app.name'), `error should mention app.name, got: ${msg}`)
    ok('validation — empty app.name throws')
  }

  // Bad permission category reference
  try {
    await loadSetupJson({
      app: { name: 'X' },
      rbac: {
        categories: [{ name: 'admin', label: 'Admin' }],
        permissions: [{ code: 'x:y', description: 'test', category: 'NONEXISTENT' }],
      },
    } as SetupJson, mockRepoFactory)
    fail('validation — bad category ref', 'should have thrown')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    assert(msg.includes('NONEXISTENT'), `error should mention NONEXISTENT, got: ${msg}`)
    ok('validation — bad category reference throws')
  }

  // Bad permission reference in role
  try {
    await loadSetupJson({
      app: { name: 'X' },
      rbac: {
        permissions: [{ code: 'a:b', description: 'test', category: 'admin' }],
        roles: [{ name: 'r', permissions: ['NONEXISTENT'] }],
      },
    } as SetupJson, mockRepoFactory)
    fail('validation — bad perm ref in role', 'should have thrown')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    assert(msg.includes('NONEXISTENT'), `error should mention NONEXISTENT, got: ${msg}`)
    ok('validation — bad permission reference in role throws')
  }
}

async function testFileNotFound() {
  try {
    await loadSetupJson('./nonexistent-file.json', mockRepoFactory)
    fail('file not found', 'should have thrown')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    assert(msg.includes('not found'), `error should mention not found, got: ${msg}`)
    ok('file not found — throws descriptive error')
  }
}

// ── Runner ───────────────────────────────────────────────

async function main() {
  console.log(`${CYAN}  Running loadSetupJson tests...${NC}`)
  console.log('')

  await testLoadFromFile()
  await testLoadFromObject()
  await testSeedRBAC()
  await testOptionalSeeds()
  await testRunActivitySeed()
  await testRunDemoUsersSeed()
  await testIdempotentSeed()
  await testValidationErrors()
  await testFileNotFound()

  console.log('')
  console.log(`  ${CYAN}Results: ${GREEN}${passed} passed${NC}, ${failed > 0 ? RED : NC}${failed} failed${NC}`)

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(`${RED}Fatal:${NC}`, err)
  process.exit(1)
})

#!/usr/bin/env npx tsx
// Author: Dr Hamid MADANI drmdh@msn.com
// Test @mostajs/setup — flow install complet sur PostgreSQL
// Utilise @mostajs/setup pour la logique (composeDbUri, needsSetup, writeEnvLocal)
// et @mostajs/orm de SecuAccessPro pour les opérations DB (pg disponible ici)
// Usage: npx tsx orm-scripts-tests/test-postgres/03-test-setup-install.ts

import { composeDbUri, needsSetup } from '@mostajs/setup'
import { registerSchemas, getDialect, disconnectDialect, BaseRepository } from '@mostajs/orm'
import bcrypt from 'bcryptjs'

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const ok   = (m: string) => console.log(`  ${COLORS.green}✔ ${m}${COLORS.reset}`)
const fail = (m: string) => console.log(`  ${COLORS.red}✘ ${m}${COLORS.reset}`)
const info = (m: string) => console.log(`  ${COLORS.dim}${m}${COLORS.reset}`)
const warn = (m: string) => console.log(`  ${COLORS.yellow}⚠ ${m}${COLORS.reset}`)
const header = (m: string) => console.log(`\n${COLORS.bold}${COLORS.cyan}═══ ${m} ═══${COLORS.reset}\n`)

// ── Config ───────────────────────────────────────────────────────
const DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  name: 'testsetupdb',
  user: 'devuser',
  password: 'devpass26',
}

const ADMIN = {
  email: 'admin@test.local',
  password: 'TestAdmin123!',
  firstName: 'Admin',
  lastName: 'Test',
}

// ── Schemas de test ──────────────────────────────────────────────
const UserSchema = {
  name: 'SetupUser',
  collection: 'setup_test_users',
  timestamps: true,
  fields: {
    email:      { type: 'string' as const, required: true, unique: true },
    password:   { type: 'string' as const, required: true },
    firstName:  { type: 'string' as const },
    lastName:   { type: 'string' as const },
    role:       { type: 'string' as const, default: 'user' },
    active:     { type: 'boolean' as const, default: true },
  },
  relations: {},
  indexes: [],
}

const CategorySchema = {
  name: 'SetupCategory',
  collection: 'setup_test_categories',
  timestamps: true,
  fields: {
    name:   { type: 'string' as const, required: true, unique: true },
    slug:   { type: 'string' as const, required: true },
    order:  { type: 'number' as const, default: 0 },
  },
  relations: {},
  indexes: [],
}

const PermissionSchema = {
  name: 'SetupPermission',
  collection: 'setup_test_permissions',
  timestamps: true,
  fields: {
    name:     { type: 'string' as const, required: true, unique: true },
    module:   { type: 'string' as const, required: true },
    action:   { type: 'string' as const, required: true },
  },
  relations: {},
  indexes: [],
}

const RoleSchema = {
  name: 'SetupRole',
  collection: 'setup_test_roles',
  timestamps: true,
  fields: {
    name:         { type: 'string' as const, required: true, unique: true },
    description:  { type: 'string' as const },
    permissions:  { type: 'array' as const, arrayOf: 'string' as const },
  },
  relations: {},
  indexes: [],
}

const TEST_SCHEMAS = [UserSchema, CategorySchema, PermissionSchema, RoleSchema]

async function main() {
  let passed = 0, failed = 0

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: Setup logic — composeDbUri + needsSetup
  // ══════════════════════════════════════════════════════════════
  header('Phase 1 — Setup logic (composeDbUri + needsSetup)')

  // composeDbUri
  const uri = composeDbUri('postgres', DB_CONFIG)
  const expectedUri = `postgresql://devuser:devpass26@localhost:5432/testsetupdb`
  if (uri === expectedUri) {
    ok(`composeDbUri: ${uri}`)
    passed++
  } else {
    fail(`composeDbUri: attendu ${expectedUri}, reçu ${uri}`)
    failed++
  }

  // needsSetup avec 0 users
  const needs = await needsSetup(async () => 0)
  if (needs) { ok('needsSetup(0) → true'); passed++ }
  else { fail('needsSetup(0) devrait retourner true'); failed++ }

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: Connexion ORM + schéma
  // ══════════════════════════════════════════════════════════════
  header('Phase 2 — Connexion ORM PostgreSQL')

  process.env.DB_DIALECT = 'postgres'
  process.env.SGBD_URI = uri
  process.env.DB_SCHEMA_STRATEGY = 'create'

  registerSchemas(TEST_SCHEMAS)

  let dialect: any
  try {
    dialect = await getDialect()
    if (!dialect) throw new Error('null')
    ok(`Connecté: ${dialect.constructor.name}`)
    passed++
  } catch (err: any) {
    fail(`Connexion échouée: ${err.message}`)
    failed++
    process.exit(1)
  }

  const userRepo = new BaseRepository(UserSchema, dialect)
  const catRepo  = new BaseRepository(CategorySchema, dialect)
  const permRepo = new BaseRepository(PermissionSchema, dialect)
  const roleRepo = new BaseRepository(RoleSchema, dialect)

  ok('Repositories créés (User, Category, Permission, Role)')
  passed++

  // ══════════════════════════════════════════════════════════════
  // PHASE 3: Simuler runInstall — seedRBAC
  // ══════════════════════════════════════════════════════════════
  header('Phase 3 — Seed RBAC (simule runInstall.seedRBAC)')

  try {
    // Categories
    await catRepo.upsert({ name: 'general' }, { name: 'general', slug: 'general', order: 1 })
    await catRepo.upsert({ name: 'admin' }, { name: 'admin', slug: 'admin', order: 2 })
    await catRepo.upsert({ name: 'medical' }, { name: 'medical', slug: 'medical', order: 3 })
    const catCount = await catRepo.count()
    ok(`Categories seed: ${catCount}`)
    if (catCount === 3) passed++; else { fail(`Attendu 3, reçu ${catCount}`); failed++ }

    // Permissions
    await permRepo.upsert({ name: 'view_dashboard' }, { name: 'view_dashboard', module: 'core', action: 'view' })
    await permRepo.upsert({ name: 'manage_users' }, { name: 'manage_users', module: 'admin', action: 'manage' })
    await permRepo.upsert({ name: 'manage_settings' }, { name: 'manage_settings', module: 'admin', action: 'manage' })
    await permRepo.upsert({ name: 'view_patients' }, { name: 'view_patients', module: 'medical', action: 'view' })
    await permRepo.upsert({ name: 'edit_patients' }, { name: 'edit_patients', module: 'medical', action: 'edit' })
    const permCount = await permRepo.count()
    ok(`Permissions seed: ${permCount}`)
    if (permCount === 5) passed++; else { fail(`Attendu 5, reçu ${permCount}`); failed++ }

    // Roles
    await roleRepo.upsert({ name: 'admin' }, {
      name: 'admin', description: 'Administrateur',
      permissions: ['view_dashboard', 'manage_users', 'manage_settings', 'view_patients', 'edit_patients'],
    })
    await roleRepo.upsert({ name: 'doctor' }, {
      name: 'doctor', description: 'Médecin',
      permissions: ['view_dashboard', 'view_patients', 'edit_patients'],
    })
    await roleRepo.upsert({ name: 'user' }, {
      name: 'user', description: 'Utilisateur',
      permissions: ['view_dashboard'],
    })
    const roleCount = await roleRepo.count()
    ok(`Roles seed: ${roleCount}`)
    if (roleCount === 3) passed++; else { fail(`Attendu 3, reçu ${roleCount}`); failed++ }
  } catch (err: any) {
    fail(`Seed RBAC échoué: ${err.message}`)
    failed++
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 4: Simuler runInstall — createAdmin
  // ══════════════════════════════════════════════════════════════
  header('Phase 4 — Create Admin (simule runInstall.createAdmin)')

  try {
    const hashedPassword = await bcrypt.hash(ADMIN.password, 12)

    await userRepo.create({
      email: ADMIN.email,
      password: hashedPassword,
      firstName: ADMIN.firstName,
      lastName: ADMIN.lastName,
      role: 'admin',
    })

    const admin = await userRepo.findOne({ email: ADMIN.email })
    if (admin) {
      ok(`Admin créé: ${(admin as any).email}, role=${(admin as any).role}`)
      passed++

      // Vérifier hash bcrypt
      if ((admin as any).password?.startsWith('$2')) {
        ok('Password hashé bcrypt OK')
        passed++

        // Vérifier que le password original match le hash
        const match = await bcrypt.compare(ADMIN.password, (admin as any).password)
        if (match) { ok('bcrypt.compare OK — password vérifié'); passed++ }
        else { fail('bcrypt.compare échoué'); failed++ }
      } else {
        fail('Password non hashé')
        failed++
      }
    } else {
      fail('Admin non trouvé après création')
      failed++
    }
  } catch (err: any) {
    fail(`createAdmin échoué: ${err.message}`)
    failed++
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 5: Vérifications croisées
  // ══════════════════════════════════════════════════════════════
  header('Phase 5 — Vérifications croisées')

  // needsSetup avec des users existants
  const userCount = await userRepo.count()
  const needsNow = await needsSetup(async () => userCount)
  if (!needsNow) {
    ok(`needsSetup(${userCount} users) → false (setup déjà fait)`)
    passed++
  } else {
    fail(`needsSetup(${userCount}) devrait retourner false`)
    failed++
  }

  // Vérifier role admin a toutes les permissions
  const adminRole = await roleRepo.findOne({ name: 'admin' })
  if (adminRole && (adminRole as any).permissions?.length === 5) {
    ok(`Role admin: ${(adminRole as any).permissions.length} permissions`)
    passed++
  } else {
    fail(`Role admin: ${(adminRole as any)?.permissions?.length} au lieu de 5`)
    failed++
  }

  // Vérifier upsert idempotent (re-seed ne duplique pas)
  await catRepo.upsert({ name: 'general' }, { name: 'general', slug: 'general', order: 1 })
  const catCountAfter = await catRepo.count()
  if (catCountAfter === 3) {
    ok('Upsert idempotent: pas de doublon après re-seed')
    passed++
  } else {
    fail(`Upsert a créé un doublon: ${catCountAfter} au lieu de 3`)
    failed++
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 6: Nettoyage
  // ══════════════════════════════════════════════════════════════
  header('Phase 6 — Nettoyage')

  const users = await userRepo.findAll()
  for (const u of users) await userRepo.delete(u.id)
  info(`Users supprimés: ${users.length}`)

  const roles = await roleRepo.findAll()
  for (const r of roles) await roleRepo.delete(r.id)
  info(`Roles supprimés: ${roles.length}`)

  const perms = await permRepo.findAll()
  for (const p of perms) await permRepo.delete(p.id)
  info(`Permissions supprimées: ${perms.length}`)

  const cats = await catRepo.findAll()
  for (const c of cats) await catRepo.delete(c.id)
  info(`Categories supprimées: ${cats.length}`)

  const cU = await userRepo.count()
  const cC = await catRepo.count()
  const cP = await permRepo.count()
  const cR = await roleRepo.count()

  if (cU === 0 && cC === 0 && cP === 0 && cR === 0) {
    ok('Nettoyage complet — toutes les tables vides')
    passed++
  } else {
    fail(`Reste: users=${cU}, cats=${cC}, perms=${cP}, roles=${cR}`)
    failed++
  }

  await disconnectDialect()
  info('Dialect déconnecté')

  // ── Résumé ─────────────────────────────────────────────────────
  header('Résumé — Setup Install Tests (PostgreSQL)')
  console.log(`  Total: ${passed + failed}  |  ${COLORS.green}Passés: ${passed}${COLORS.reset}  |  ${failed > 0 ? COLORS.red : COLORS.green}Échoués: ${failed}${COLORS.reset}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\nErreur fatale:', err)
  process.exit(2)
})

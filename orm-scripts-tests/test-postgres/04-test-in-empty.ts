#!/usr/bin/env npx tsx
// Author: Dr Hamid MADANI drmdh@msn.com
// Test ORM $in/$nin avec tableaux vides sur PostgreSQL
// Vérifie le fix: $in:[] → 1=0, $nin:[] → pas de filtre
// Usage: npx tsx orm-scripts-tests/test-postgres/04-test-in-empty.ts

import { registerSchemas, getDialect, disconnectDialect, BaseRepository } from '@mostajs/orm'

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const ok   = (m: string) => console.log(`  ${COLORS.green}✔ ${m}${COLORS.reset}`)
const fail = (m: string) => console.log(`  ${COLORS.red}✘ ${m}${COLORS.reset}`)
const info = (m: string) => console.log(`  ${COLORS.dim}${m}${COLORS.reset}`)
const header = (m: string) => console.log(`\n${COLORS.bold}${COLORS.cyan}═══ ${m} ═══${COLORS.reset}\n`)

// ── Setup ────────────────────────────────────────────────────────
process.env.DB_DIALECT = 'postgres'
process.env.SGBD_URI = 'postgresql://devuser:devpass26@localhost:5432/testormdb'
process.env.DB_SCHEMA_STRATEGY = 'create'

const TestSchema = {
  name: 'InTestItem',
  collection: 'test_in_empty',
  timestamps: true,
  fields: {
    name:   { type: 'string' as const, required: true },
    status: { type: 'string' as const, enum: ['active', 'draft', 'archived'], default: 'draft' },
    tag:    { type: 'string' as const },
  },
  relations: {},
  indexes: [],
}

async function main() {
  let passed = 0, failed = 0

  registerSchemas([TestSchema])
  const dialect = await getDialect()
  if (!dialect) { fail('Connexion échouée'); process.exit(1) }

  const repo = new BaseRepository(TestSchema, dialect)

  // Seed data
  header('Setup — Seed 5 items')
  await repo.create({ name: 'Item A', status: 'active', tag: 'alpha' })
  await repo.create({ name: 'Item B', status: 'active', tag: 'beta' })
  await repo.create({ name: 'Item C', status: 'draft', tag: 'alpha' })
  await repo.create({ name: 'Item D', status: 'archived', tag: 'gamma' })
  await repo.create({ name: 'Item E', status: 'draft', tag: 'beta' })
  info('5 items créés')

  // ── findAll $in: [] ────────────────────────────────────────────
  header('Test 1 — findAll $in: [] (doit retourner 0)')
  try {
    const r = await repo.findAll({ status: { $in: [] } })
    if (r.length === 0) { ok(`findAll $in:[] → ${r.length} résultats`); passed++ }
    else { fail(`Attendu 0, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── findAll $in: ['active'] ────────────────────────────────────
  header('Test 2 — findAll $in: ["active"] (doit retourner 2)')
  try {
    const r = await repo.findAll({ status: { $in: ['active'] } })
    if (r.length === 2) { ok(`findAll $in:['active'] → ${r.length} résultats`); passed++ }
    else { fail(`Attendu 2, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── findAll $in: ['active', 'draft'] ──────────────────────────
  header('Test 3 — findAll $in: ["active", "draft"] (doit retourner 4)')
  try {
    const r = await repo.findAll({ status: { $in: ['active', 'draft'] } })
    if (r.length === 4) { ok(`findAll $in:['active','draft'] → ${r.length} résultats`); passed++ }
    else { fail(`Attendu 4, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── findAll $nin: [] ───────────────────────────────────────────
  header('Test 4 — findAll $nin: [] (doit retourner tous = 5)')
  try {
    const r = await repo.findAll({ status: { $nin: [] } })
    if (r.length === 5) { ok(`findAll $nin:[] → ${r.length} résultats`); passed++ }
    else { fail(`Attendu 5, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── findAll $nin: ['archived'] ─────────────────────────────────
  header('Test 5 — findAll $nin: ["archived"] (doit retourner 4)')
  try {
    const r = await repo.findAll({ status: { $nin: ['archived'] } })
    if (r.length === 4) { ok(`findAll $nin:['archived'] → ${r.length} résultats`); passed++ }
    else { fail(`Attendu 4, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── count avec $in: [] ─────────────────────────────────────────
  header('Test 6 — count $in: [] (doit retourner 0)')
  try {
    const c = await repo.count({ tag: { $in: [] } })
    if (c === 0) { ok(`count $in:[] → ${c}`); passed++ }
    else { fail(`Attendu 0, reçu ${c}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── aggregate $match $in: [] ───────────────────────────────────
  header('Test 7 — aggregate $match $in: [] (doit retourner 0 groupes)')
  try {
    const r = await repo.aggregate([
      { $match: { status: { $in: [] } } },
      { $group: { _by: 'status', count: { $sum: 1 } } },
    ])
    if (r.length === 0) { ok(`aggregate $in:[] → ${r.length} groupes`); passed++ }
    else { fail(`Attendu 0 groupes, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── aggregate $match $in: ['active', 'draft'] ─────────────────
  header('Test 8 — aggregate $match $in: ["active","draft"] (2 groupes)')
  try {
    const r = await repo.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $in: ['active', 'draft'] } } },
      { $group: { _by: 'status', count: { $sum: 1 } } },
    ])
    if (r.length === 2) {
      ok(`aggregate $in:['active','draft'] → ${r.length} groupes`)
      for (const g of r) info(`  ${g._id}: ${g.count}`)
      passed++
    } else { fail(`Attendu 2 groupes, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── aggregate combiné $in:[] + $ne ─────────────────────────────
  header('Test 9 — aggregate $in:[] + $ne (simule le cas access route)')
  try {
    const r = await repo.aggregate<{ _id: string; count: number }>([
      { $match: { tag: { $in: [] }, status: { $ne: 'archived' } } as any },
      { $group: { _by: 'tag', count: { $sum: 1 } } },
    ])
    if (r.length === 0) { ok(`aggregate $in:[] + $ne → ${r.length} (vide, correct)`); passed++ }
    else { fail(`Attendu 0, reçu ${r.length}`); failed++ }
  } catch (e: any) { fail(`Crash: ${e.message}`); failed++ }

  // ── Nettoyage ──────────────────────────────────────────────────
  header('Nettoyage')
  const all = await repo.findAll()
  for (const item of all) await repo.delete(item.id)
  info(`${all.length} items supprimés`)

  const remaining = await repo.count()
  if (remaining === 0) { ok('Table vide'); passed++ }
  else { fail(`Reste ${remaining} items`); failed++ }

  await disconnectDialect()

  // ── Résumé ─────────────────────────────────────────────────────
  header('Résumé — $in/$nin Empty Array Tests (PostgreSQL)')
  console.log(`  Total: ${passed + failed}  |  ${COLORS.green}Passés: ${passed}${COLORS.reset}  |  ${failed > 0 ? COLORS.red : COLORS.green}Échoués: ${failed}${COLORS.reset}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\nErreur fatale:', err)
  process.exit(2)
})

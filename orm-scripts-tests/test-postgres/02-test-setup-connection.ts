#!/usr/bin/env npx tsx
// Author: Dr Hamid MADANI drmdh@msn.com
// Test @mostajs/setup + @mostajs/orm — connexion PostgreSQL
// Teste composeDbUri (setup) + testConnection (orm directement depuis SecuAccessPro)
// Usage: npx tsx orm-scripts-tests/test-postgres/02-test-setup-connection.ts

import { composeDbUri, needsSetup } from '@mostajs/setup'
import { testConnection } from '@mostajs/orm'

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
}

const ok   = (m: string) => console.log(`  ${COLORS.green}✔ ${m}${COLORS.reset}`)
const fail = (m: string) => console.log(`  ${COLORS.red}✘ ${m}${COLORS.reset}`)
const info = (m: string) => console.log(`  ${COLORS.dim}${m}${COLORS.reset}`)
const header = (m: string) => console.log(`\n${COLORS.bold}${COLORS.cyan}═══ ${m} ═══${COLORS.reset}\n`)

async function main() {
  let passed = 0, failed = 0

  // ── Test 1: composeDbUri (setup) ───────────────────────────────
  header('Test 1 — composeDbUri pour PostgreSQL')

  const uri = composeDbUri('postgres', {
    host: 'localhost',
    port: 5432,
    name: 'testormdb',
    user: 'devuser',
    password: 'devpass26',
  })

  const expectedUri = 'postgresql://devuser:devpass26@localhost:5432/testormdb'
  if (uri === expectedUri) {
    ok(`composeDbUri OK: ${uri}`)
    passed++
  } else {
    fail(`composeDbUri: attendu ${expectedUri}, reçu ${uri}`)
    failed++
  }

  // ── Test 2: testConnection ORM — bons paramètres ───────────────
  header('Test 2 — testConnection ORM (connexion valide)')

  const result = await testConnection({
    dialect: 'postgres',
    uri: 'postgresql://devuser:devpass26@localhost:5432/testormdb',
    schemaStrategy: 'none',
  })

  if (result.ok) {
    ok('Connexion PostgreSQL réussie via ORM')
    passed++
  } else {
    fail(`Connexion échouée: ${result.error}`)
    failed++
  }

  // ── Test 3: testConnection ORM — mauvais password ──────────────
  header('Test 3 — testConnection ORM (mauvais password)')

  const badResult = await testConnection({
    dialect: 'postgres',
    uri: 'postgresql://devuser:wrongpassword@localhost:5432/testormdb',
    schemaStrategy: 'none',
  })

  if (!badResult.ok) {
    ok(`Rejet correct: ${badResult.error}`)
    passed++
  } else {
    fail('Connexion acceptée avec mauvais password — problème !')
    failed++
  }

  // ── Test 4: testConnection ORM — mauvais port ─────────────────
  header('Test 4 — testConnection ORM (mauvais port)')

  const badPortResult = await testConnection({
    dialect: 'postgres',
    uri: 'postgresql://devuser:devpass26@localhost:5499/testormdb',
    schemaStrategy: 'none',
  })

  if (!badPortResult.ok) {
    ok(`Rejet correct: ${badPortResult.error}`)
    passed++
  } else {
    fail('Connexion acceptée avec mauvais port — problème !')
    failed++
  }

  // ── Test 5: composeDbUri + testConnection combinés ─────────────
  header('Test 5 — composeDbUri → testConnection (pipeline setup)')

  const composedUri = composeDbUri('postgres', {
    host: 'localhost',
    port: 5432,
    name: 'testormdb',
    user: 'devuser',
    password: 'devpass26',
  })

  const pipeResult = await testConnection({
    dialect: 'postgres',
    uri: composedUri,
    schemaStrategy: 'none',
  })

  if (pipeResult.ok) {
    ok(`Pipeline composeDbUri → testConnection OK`)
    passed++
  } else {
    fail(`Pipeline échoué: ${pipeResult.error}`)
    failed++
  }

  // ── Test 6: needsSetup — logique pure ──────────────────────────
  header('Test 6 — needsSetup (logique setup)')

  const needs0 = await needsSetup(async () => 0)
  if (needs0) { ok('needsSetup(0 users) → true'); passed++ }
  else { fail('needsSetup(0 users) devrait retourner true'); failed++ }

  const needs5 = await needsSetup(async () => 5)
  if (!needs5) { ok('needsSetup(5 users) → false'); passed++ }
  else { fail('needsSetup(5 users) devrait retourner false'); failed++ }

  const needsErr = await needsSetup(async () => { throw new Error('DB down') })
  if (needsErr) { ok('needsSetup(error) → true (graceful)'); passed++ }
  else { fail('needsSetup(error) devrait retourner true'); failed++ }

  // ── Résumé ─────────────────────────────────────────────────────
  header('Résumé — Setup + ORM Connection Tests')
  console.log(`  Total: ${passed + failed}  |  ${COLORS.green}Passés: ${passed}${COLORS.reset}  |  ${failed > 0 ? COLORS.red : COLORS.green}Échoués: ${failed}${COLORS.reset}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\nErreur fatale:', err)
  process.exit(2)
})

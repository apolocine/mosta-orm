#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Crée la base testormdb sur chaque SGBD distant (via tunnel SSH)
# Utilise les drivers Node.js (pas de client CLI requis)

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════════"
echo "  Création des bases de test (testormdb)"
echo "═══════════════════════════════════════════════"
echo ""

# ── PostgreSQL ──
echo "▶ PostgreSQL (port 5432)..."
npx tsx -e "
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 5432, user: 'devuser', password: 'devpass26', database: 'postgres' });
  await c.connect();
  const r = await c.query(\"SELECT 1 FROM pg_database WHERE datname = 'testormdb'\");
  if (r.rows.length === 0) {
    await c.query('CREATE DATABASE testormdb');
    console.log('  ✔ testormdb créée');
  } else {
    console.log('  testormdb existe déjà');
  }
  await c.end();
})().catch(e => console.log('  ✘', e.message));
" 2>&1

# ── MySQL ──
echo "▶ MySQL (port 3306)..."
npx tsx -e "
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'devuser', password: 'devpass26' });
  await c.execute('CREATE DATABASE IF NOT EXISTS testormdb');
  console.log('  ✔ testormdb créée/existe');
  await c.end();
})().catch(e => console.log('  ✘', e.message));
" 2>&1

# ── MariaDB ──
echo "▶ MariaDB (port 3307)..."
npx tsx -e "
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'devuser', password: 'devpass26' });
  await c.execute('CREATE DATABASE IF NOT EXISTS testormdb');
  console.log('  ✔ testormdb créée/existe');
  await c.end();
})().catch(e => console.log('  ✘', e.message));
" 2>&1

# ── MongoDB ──
echo "▶ MongoDB (port 27017)..."
mongosh "mongodb://localhost:27017/testormdb" --quiet --eval "
  try {
    db.createUser({ user: 'devuser', pwd: 'devpass26', roles: [{ role: 'readWrite', db: 'testormdb' }] });
    print('  ✔ devuser créé');
  } catch(e) {
    if (e.code === 51003) print('  devuser existe déjà');
    else print('  ✘ ' + e.message);
  }
" 2>&1

# ── Oracle ──
echo "▶ Oracle (port 1521)..."
echo "  devuser/XEPDB1 déjà configuré"

echo ""
echo "✔ Terminé."

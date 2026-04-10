#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test ORM complet sur PostgreSQL (connexion, CRUD, relations, cleanup)
# Utilise le test-sgbd.ts générique avec dialect=postgres

set -euo pipefail
cd "$(dirname "$0")/../.."

echo "═══ Test ORM PostgreSQL ═══"
echo "URI: postgresql://devuser:***@localhost:5432/testormdb"
echo ""

npx tsx orm-scripts-tests/test-sgbd.ts postgres

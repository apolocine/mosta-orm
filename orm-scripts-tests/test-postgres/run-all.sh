#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Lance tous les tests PostgreSQL (ORM + Setup)
# Usage: ./orm-scripts-tests/test-postgres/run-all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║   Tests PostgreSQL — ORM + Setup                 ║"
echo "║   postgresql://devuser:***@localhost:5432         ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

TOTAL=0
PASSED=0
FAILED=0

run_test() {
  local label="$1"
  local cmd="$2"
  TOTAL=$((TOTAL + 1))

  echo -e "\n${BOLD}${CYAN}── ${label} ──${NC}\n"

  if eval "$cmd"; then
    PASSED=$((PASSED + 1))
    echo -e "\n${GREEN}✔ ${label} — PASSED${NC}"
  else
    FAILED=$((FAILED + 1))
    echo -e "\n${RED}✘ ${label} — FAILED${NC}"
  fi
}

# ── Test 1: ORM CRUD complet ─────────────────────────────────────
run_test "ORM — CRUD complet (connexion, schéma, create, read, update, delete)" \
  "npx tsx orm-scripts-tests/test-sgbd.ts postgres"

# ── Test 2: Setup — testDbConnection ─────────────────────────────
run_test "Setup — testDbConnection (valide, mauvais pass, mauvais port)" \
  "npx tsx orm-scripts-tests/test-postgres/02-test-setup-connection.ts"

# ── Test 3: Setup — runInstall flow complet ──────────────────────
run_test "Setup — runInstall (needsSetup, RBAC seed, admin, vérification, cleanup)" \
  "npx tsx orm-scripts-tests/test-postgres/03-test-setup-install.ts"

# ── Résumé ────────────────────────────────────────────────────────
echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Résumé PostgreSQL${NC}"
echo -e "  Total: ${TOTAL}  |  ${GREEN}Passés: ${PASSED}${NC}  |  ${FAILED > 0 && echo $RED || echo $GREEN}Échoués: ${FAILED}${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi

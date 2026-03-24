#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Run all discriminator + soft-delete tests
# Usage: ./run-all.sh [sqlite|mongo|postgres|oracle|all]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-all}"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

TOTAL_PASS=0
TOTAL_FAIL=0

run_suite() {
  local script="$1"
  local name="$2"
  if bash "$SCRIPT_DIR/$script"; then
    TOTAL_PASS=$((TOTAL_PASS+1))
  else
    TOTAL_FAIL=$((TOTAL_FAIL+1))
  fi
}

case "$TARGET" in
  sqlite)   run_suite test-discriminator-sqlite.sh "SQLite" ;;
  mongo)    run_suite test-discriminator-mongo.sh "MongoDB" ;;
  postgres) run_suite test-discriminator-postgres.sh "PostgreSQL" ;;
  oracle)   run_suite test-discriminator-oracle.sh "Oracle" ;;
  all)
    run_suite test-discriminator-sqlite.sh "SQLite"
    run_suite test-discriminator-mongo.sh "MongoDB"
    if pg_isready -h localhost -p 5432 -q 2>/dev/null; then
      run_suite test-discriminator-postgres.sh "PostgreSQL"
    else
      echo -e "\n${CYAN}▶ PostgreSQL — ${RED}SKIPPED (not running)${NC}"
    fi
    if node -e "require('oracledb')" 2>/dev/null; then
      run_suite test-discriminator-oracle.sh "Oracle"
    else
      echo -e "\n${CYAN}▶ Oracle — ${RED}SKIPPED (oracledb not installed)${NC}"
    fi
    ;;
  *) echo "Usage: $0 [sqlite|mongo|postgres|oracle|all]"; exit 1 ;;
esac

echo -e "\n${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "  Suites: ${GREEN}$TOTAL_PASS passed${NC}  ${RED}$TOTAL_FAIL failed${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"

[ "$TOTAL_FAIL" -eq 0 ] && exit 0 || exit 1

#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet de toutes les fonctions IDialect — multi-SGBD
# Usage: ./test-full-dialect.sh sqlite
#        ./test-full-dialect.sh postgres [uri]
#        ./test-full-dialect.sh oracle [uri]
#        ./test-full-dialect.sh mssql [uri]
#        ./test-full-dialect.sh cockroachdb [uri]
#        ./test-full-dialect.sh mariadb [uri]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASS=0; FAIL=0

DB=$1
URI=${2:-}

# Defaults par dialect
case "$DB" in
  sqlite)      URI="${URI:-:memory:}" ;;
  postgres)    URI="${URI:-postgresql://devuser:devpass26@localhost:5432/test_full_orm}" ;;
  oracle)      URI="${URI:-oracle://devuser:devpass26@localhost:1521/XEPDB1}" ;;
  mssql)       URI="${URI:-Server=localhost,1433;Database=test_full_orm;User Id=devuser;Password=Devpass@26;TrustServerCertificate=true;Encrypt=false}" ;;
  cockroachdb) URI="${URI:-postgresql://devuser:devpass26@localhost:26257/test_full_orm?sslmode=disable}" ;;
  mariadb)     URI="${URI:-mariadb://devuser:devpass26@[::1]:3306/test_full_orm}" ;;
  mongodb)     URI="${URI:-mongodb://localhost:27017/test_full_orm}" ;;
  *)           echo "Usage: $0 {sqlite|postgres|oracle|mssql|cockroachdb|mariadb|mongodb} [uri]"; exit 1 ;;
esac

DB_UPPER=$(echo "$DB" | tr '[:lower:]' '[:upper:]')

echo -e "\n${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test complet IDialect — ${DB_UPPER}${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}\n"

cd "$ORM_DIR"
RESULT=$(DIALECT="$DB" DB_URI="$URI" node tests-scripts/test-full-dialect.mjs 2>/dev/null)

if [ -z "$RESULT" ]; then
  echo -e "  ${RED}✗ Script failed. Errors:${NC}"
  DIALECT="$DB" DB_URI="$URI" node tests-scripts/test-full-dialect.mjs 2>&1 | head -40
  exit 1
fi

while IFS='|' read -r status label detail; do
  if [ "$status" = "OK" ]; then
    PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $label"
  else
    FAIL=$((FAIL+1)); echo -e "  ${RED}✗${NC} $label — ${YELLOW}$detail${NC}"
  fi
done < <(echo "$RESULT" | node -e "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const [k, v] of Object.entries(r)) {
    const l = k.replace(/^t\d+_/, '').replace(/_/g, ' ');
    console.log(v === 'OK' ? 'OK|'+l : 'FAIL|'+l+'|'+v);
  }
")

TOTAL=$((PASS + FAIL))
echo ""
echo -e "${CYAN}────────────────────────────────────────────────────────${NC}"
echo -e "  ${DB_UPPER}: ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  (${TOTAL} tests)"
echo -e "${CYAN}────────────────────────────────────────────────────────${NC}"
[ "$FAIL" -eq 0 ] || exit 1

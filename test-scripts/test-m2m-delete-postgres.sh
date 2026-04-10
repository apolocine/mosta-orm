#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test P0-2: M2M delete junction cleanup — PostgreSQL
# Requires: PostgreSQL on localhost:5432 (SSH tunnel from amia.fr)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'
PASS=0; FAIL=0

PG_URI="${PG_URI:-postgresql://devuser:devpass26@localhost:5432/test_m2m_orm}"

echo -e "\n${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test P0-2 : M2M Delete Junction Cleanup — PostgreSQL${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}\n"

cd "$ORM_DIR"
RESULT=$(DIALECT=postgres DB_URI="$PG_URI" node test-scripts/test-m2m-delete.mjs 2>/dev/null)

if [ -z "$RESULT" ]; then
  echo -e "  ${RED}✗ Script failed. Errors:${NC}"
  DIALECT=postgres DB_URI="$PG_URI" node test-scripts/test-m2m-delete.mjs 2>&1 | head -30
  exit 1
fi

while IFS='|' read -r status label detail; do
  if [ "$status" = "OK" ]; then
    PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $label"
  else
    FAIL=$((FAIL+1)); echo -e "  ${RED}✗${NC} $label — $detail"
  fi
done < <(echo "$RESULT" | node -e "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  for (const [k, v] of Object.entries(r)) {
    const l = k.replace(/^t\d+_/, '').replace(/_/g, ' ');
    console.log(v === 'OK' ? 'OK|'+l : 'FAIL|'+l+'|'+v);
  }
")

echo ""
echo -e "${CYAN}────────────────────────────────────────────────────────${NC}"
echo -e "  ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}"
echo -e "${CYAN}────────────────────────────────────────────────────────${NC}"
[ "$FAIL" -eq 0 ] || exit 1

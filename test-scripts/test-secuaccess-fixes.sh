#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test: SecuAccessPro SQL compatibility fixes (B, C, D)
# Validates many-to-many relation patterns on PostgreSQL
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PG_URI="${PG_URI:-postgresql://devuser:devpass26@localhost:5432/test_fixes_orm}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}✗${NC} $1 — $2"; }

echo -e "\n${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test SecuAccessPro SQL Fixes (B, C, D) — PostgreSQL${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}\n"

cd "$ORM_DIR"
RESULT=$(PG_URI="$PG_URI" node test-scripts/test-secuaccess-fixes.mjs 2>/dev/null)

if [ -z "$RESULT" ]; then
  echo -e "  ${RED}✗ Test script failed. Errors:${NC}"
  PG_URI="$PG_URI" node test-scripts/test-secuaccess-fixes.mjs 2>&1 | head -40
  exit 1
fi

while IFS='|' read -r status label detail; do
  if [ "$status" = "OK" ]; then ok "$label"; else fail "$label" "$detail"; fi
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

[ "$FAIL" -eq 0 ] && exit 0 || exit 1

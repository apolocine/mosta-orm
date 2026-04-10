#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test: Full seeding flow on all available dialects
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/_runner.sh"

cd "$ORM_DIR"

run_seed_test() {
  local dialect="$1"
  local uri="$2"
  header "Seeding — $dialect"
  RESULT=$(DIALECT="$dialect" DB_URI="$uri" node test-scripts/test-seeding-multidialect.mjs 2>/dev/null)
  if [ -z "$RESULT" ]; then
    echo -e "  ${RED}✗ Test failed. Errors:${NC}"
    DIALECT="$dialect" DB_URI="$uri" node test-scripts/test-seeding-multidialect.mjs 2>&1 | head -30
    FAIL=$((FAIL+1))
    return
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
}

DB_FILE=$(mktemp /tmp/test-seed-XXXXXX.db)
trap "rm -f $DB_FILE" EXIT

run_seed_test "sqlite" "$DB_FILE"

PASS=0; FAIL=0
run_seed_test "mongodb" "mongodb://localhost:27017/test_seeding_orm"

PASS=0; FAIL=0
run_seed_test "postgres" "postgresql://devuser:devpass26@localhost:5432/secuaccessdb"

PASS=0; FAIL=0
run_seed_test "oracle" "oracle://devuser:devpass26@localhost:1521/XEPDB1"

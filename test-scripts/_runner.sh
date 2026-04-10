# Author: Dr Hamid MADANI drmdh@msn.com
# Shared test runner for discriminator tests
# Sourced by test-discriminator-*.sh scripts

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}✗${NC} $1 — $2"; }

header() {
  echo -e "\n${CYAN}════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  Test Discriminateur _type + Soft-Delete — $1${NC}"
  echo -e "${CYAN}════════════════════════════════════════════════════════${NC}\n"
}

run_test() {
  local dialect="$1"
  local uri="$2"

  RESULT=$(DIALECT="$dialect" DB_URI="$uri" node tests-scripts/test-discriminator.mjs 2>/dev/null)

  if [ -z "$RESULT" ]; then
    echo -e "  ${RED}✗ Test script failed to execute. Errors:${NC}"
    DIALECT="$dialect" DB_URI="$uri" node tests-scripts/test-discriminator.mjs 2>&1 | head -30
    exit 1
  fi

  while IFS='|' read -r status label detail; do
    if [ "$status" = "OK" ]; then
      ok "$label"
    else
      fail "$label" "$detail"
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
}

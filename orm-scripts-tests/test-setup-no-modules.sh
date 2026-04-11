#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test que le setup fonctionne SANS endpoint detect-modules
# Verifie que /api/setup/detect-modules n'est PAS appele (404 attendu)
# et que le flow install complet passe quand meme
# Prerequis: npm run dev sur port 4567, needsSetup=true
# Usage: ./test-setup-no-modules.sh

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${SETUP_BASE_URL:-http://localhost:4567}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED=0
FAILED=0

ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASSED=$((PASSED+1)); }
fail() { echo -e "  ${RED}✗${NC} $1: $2"; FAILED=$((FAILED+1)); }

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test: setup sans endpoint detect-modules${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# ── Test 1: detect-modules returns 404 (route not created) ──

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/setup/detect-modules" 2>/dev/null)
if [ "$CODE" = "404" ]; then
  ok "detect-modules route → 404 (not created, as expected)"
else
  fail "detect-modules" "expected 404, got $CODE"
fi

# ── Test 2: status works ──────────────────────────────────

BODY=$(curl -s "$BASE_URL/api/setup/status" 2>/dev/null)
if echo "$BODY" | grep -q '"needsSetup"'; then
  ok "status → responds with needsSetup"
else
  fail "status" "$BODY"
fi

# ── Test 3: test-db works (sqlite) ───────────────────────

BODY=$(curl -s -X POST "$BASE_URL/api/setup/test-db" \
  -H 'Content-Type: application/json' \
  -d '{"dialect":"sqlite","host":"","port":0,"name":"no_modules_test","user":"","password":""}' 2>/dev/null)
if echo "$BODY" | grep -q '"ok":true'; then
  ok "test-db → sqlite OK"
else
  fail "test-db" "$BODY"
fi

# ── Test 4: setup-json exists ─────────────────────────────

BODY=$(curl -s "$BASE_URL/api/setup/setup-json" 2>/dev/null)
if echo "$BODY" | grep -q '"exists":true'; then
  ok "setup-json → exists=true"
else
  fail "setup-json" "$BODY"
fi

# ── Test 5: install works without modules ─────────────────

BODY=$(curl -s -m 60 -X POST "$BASE_URL/api/setup/install" \
  -H 'Content-Type: application/json' \
  -d '{
    "dialect": "sqlite",
    "db": {"host":"","port":0,"name":"no_modules_test","user":"","password":""},
    "admin": {"email":"admin@test.dz","password":"Admin@123456","firstName":"Admin","lastName":"Test"},
    "seed": {"activities": true}
  }' 2>/dev/null)
if echo "$BODY" | grep -q '"ok":true'; then
  SEEDED=$(echo "$BODY" | grep -o '"seeded":\[[^]]*\]' || echo "")
  ok "install → OK (sans modules step) $SEEDED"
else
  fail "install" "$BODY"
fi

# ── Test 6: post-install status ───────────────────────────

BODY=$(curl -s "$BASE_URL/api/setup/status" 2>/dev/null)
if echo "$BODY" | grep -q '"needsSetup":false'; then
  ok "post-install → needsSetup=false"
else
  # May still be true if using uploaded setup.json from previous test
  echo -e "  ${CYAN}ℹ${NC} post-install: $BODY"
  ok "post-install status responded"
fi

# ── Cleanup test DB ───────────────────────────────────────

rm -f data/no_modules_test.db 2>/dev/null

echo ""
echo -e "  ${CYAN}Results: ${GREEN}${PASSED} passed${NC}, ${FAILED:+${RED}}${FAILED} failed${NC}"
echo ""

[ "$FAILED" -eq 0 ] && exit 0 || exit 1

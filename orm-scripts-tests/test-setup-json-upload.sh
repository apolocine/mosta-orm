#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test upload setup.json via API
# Prerequis: npm run dev sur port 4567, needsSetup=true, setup.json absent
# Usage: ./test-setup-json-upload.sh

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${SETUP_BASE_URL:-http://localhost:4567}"
EP="$BASE_URL/api/setup/setup-json"

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
echo -e "${CYAN}  Test /api/setup/setup-json (upload flow)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# Backup and remove setup.json
SETUP_BAK=""
if [ -f setup.json ]; then
  SETUP_BAK="setup.json.test-bak-$$"
  mv setup.json "$SETUP_BAK"
fi

cleanup() {
  rm -f setup.json
  [ -n "$SETUP_BAK" ] && [ -f "$SETUP_BAK" ] && mv "$SETUP_BAK" setup.json
}
trap cleanup EXIT

# ── Test 1: GET when missing ──────────────────────────────

BODY=$(curl -s "$EP" 2>/dev/null)
if echo "$BODY" | grep -q '"exists":false'; then
  ok "GET — setup.json missing: exists=false"
else
  fail "GET missing" "$BODY"
fi

# ── Test 2: POST invalid JSON ────────────────────────────

BODY=$(curl -s -X POST "$EP" -H 'Content-Type: application/json' -d '{"app":{}}' 2>/dev/null)
if echo "$BODY" | grep -q '"error"'; then
  ok "POST — invalid (no app.name): rejected"
else
  fail "POST invalid" "$BODY"
fi

# ── Test 3: POST valid setup.json ─────────────────────────

BODY=$(curl -s -X POST "$EP" -H 'Content-Type: application/json' -d '{
  "app": {"name": "UploadTest", "port": 4567},
  "rbac": {
    "categories": [{"name": "admin", "label": "Admin"}],
    "permissions": [{"code": "admin:access", "description": "Acces admin", "category": "admin"}],
    "roles": [{"name": "admin", "permissions": ["*"]}]
  },
  "seeds": [{"key": "demo", "label": "Demo", "collection": "user", "data": [{"email": "test@test.dz"}]}]
}' 2>/dev/null)
if echo "$BODY" | grep -q '"ok":true'; then
  ok "POST — valid setup.json uploaded"
else
  fail "POST valid" "$BODY"
fi

# ── Test 4: GET after upload ──────────────────────────────

BODY=$(curl -s "$EP" 2>/dev/null)
if echo "$BODY" | grep -q '"exists":true' && echo "$BODY" | grep -q '"appName":"UploadTest"'; then
  ok "GET — after upload: exists=true, appName=UploadTest"
else
  fail "GET after upload" "$BODY"
fi

# ── Test 5: File actually written ─────────────────────────

if [ -f setup.json ]; then
  NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('setup.json','utf-8')).app.name)")
  if [ "$NAME" = "UploadTest" ]; then
    ok "File on disk: setup.json contains app.name=UploadTest"
  else
    fail "File content" "got name=$NAME"
  fi
else
  fail "File on disk" "setup.json not found"
fi

# ── Test 6: Config details ────────────────────────────────

HAS_RBAC=$(echo "$BODY" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).config.hasRbac)}catch{console.log('ERR')}})")
SEED_COUNT=$(echo "$BODY" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).config.seedCount)}catch{console.log('ERR')}})")
if [ "$HAS_RBAC" = "true" ] && [ "$SEED_COUNT" = "1" ]; then
  ok "Config details: hasRbac=true, seedCount=1"
else
  fail "Config details" "hasRbac=$HAS_RBAC seedCount=$SEED_COUNT"
fi

echo ""
echo -e "  ${CYAN}Results: ${GREEN}${PASSED} passed${NC}, ${FAILED:+${RED}}${FAILED} failed${NC}"
echo ""

[ "$FAILED" -eq 0 ] && exit 0 || exit 1

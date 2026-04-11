#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test CLI: npx mosta-setup --quick
# Verifie la generation de setup.json en mode non-interactif
# Usage: ./test-cli-init.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="$(cd "$SCRIPT_DIR/../../mostajs/mosta-setup" && pwd)/dist/cli/init.js"
LOADER_PATH="$(cd "$SCRIPT_DIR/../../mostajs/mosta-setup" && pwd)/dist/lib/load-setup-json.js"
TMPDIR=$(mktemp -d)

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
echo -e "${CYAN}  Test CLI mosta-setup init${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# ── Test 1: --quick generates valid JSON ──────────────────

rm -f "$TMPDIR/setup.json"
(cd "$TMPDIR" && node "$CLI" --quick --name TestApp --port 4500 --db testdb 2>/dev/null)
if [ -f "$TMPDIR/setup.json" ]; then
  NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR/setup.json','utf-8')).app.name)")
  PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR/setup.json','utf-8')).app.port)")
  DB=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR/setup.json','utf-8')).app.dbNamePrefix)")
  if [ "$NAME" = "TestApp" ] && [ "$PORT" = "4500" ] && [ "$DB" = "testdb" ]; then
    ok "--quick generates correct app config (name=$NAME port=$PORT db=$DB)"
  else
    fail "--quick" "got name=$NAME port=$PORT db=$DB"
  fi
else
  fail "--quick" "setup.json not created"
fi

# ── Test 2: --quick with --modules ────────────────────────

rm -f "$TMPDIR/setup.json"
(cd "$TMPDIR" && node "$CLI" --quick --name ModApp --modules "orm,auth,setup" 2>/dev/null)
if [ -f "$TMPDIR/setup.json" ]; then
  MODS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR/setup.json','utf-8')).env?.MOSTAJS_MODULES || '')")
  if [ "$MODS" = "orm,auth,setup" ]; then
    ok "--quick with --modules (MOSTAJS_MODULES=$MODS)"
  else
    fail "--modules" "got MOSTAJS_MODULES=$MODS"
  fi
else
  fail "--modules" "setup.json not created"
fi

# ── Test 3: --stdout outputs to stdout ────────────────────

rm -f "$TMPDIR/setup.json"
OUTPUT=$(cd "$TMPDIR" && node "$CLI" --quick --name StdoutApp --stdout 2>/dev/null)
if echo "$OUTPUT" | grep -q '"name": "StdoutApp"'; then
  if [ ! -f "$TMPDIR/setup.json" ]; then
    ok "--stdout writes to stdout, no file created"
  else
    fail "--stdout" "file was also created"
  fi
else
  fail "--stdout" "output does not contain app name"
fi

# ── Test 4: $schema is present ────────────────────────────

rm -f "$TMPDIR/setup.json"
(cd "$TMPDIR" && node "$CLI" --quick --name SchemaApp 2>/dev/null)
SCHEMA=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR/setup.json','utf-8'))['\$schema'] || '')")
if echo "$SCHEMA" | grep -q "mostajs.dev/schemas"; then
  ok "\$schema references mostajs.dev"
else
  fail "\$schema" "got $SCHEMA"
fi

# ── Test 5: default port omitted ──────────────────────────

rm -f "$TMPDIR/setup.json"
(cd "$TMPDIR" && node "$CLI" --quick --name DefPort 2>/dev/null)
HAS_PORT=$(node -e "const j=JSON.parse(require('fs').readFileSync('$TMPDIR/setup.json','utf-8')); console.log('port' in j.app ? 'yes' : 'no')")
if [ "$HAS_PORT" = "no" ]; then
  ok "port=3000 omitted from output (clean JSON)"
else
  fail "default port" "port should not be in output when 3000"
fi

# ── Test 6: loadSetupJson reads CLI-generated file ────────

rm -f "$TMPDIR/setup.json"
(cd "$TMPDIR" && node "$CLI" --quick --name LoadTest --port 5555 --db loadtestdb --modules "orm,auth" 2>/dev/null)
LOAD_RESULT=$(node --input-type=module -e "
import { loadSetupJson } from '$LOADER_PATH'
const config = await loadSetupJson('$TMPDIR/setup.json')
console.log(JSON.stringify({ name: config.appName, port: config.defaultPort, env: config.extraEnvVars?.MOSTAJS_MODULES || '' }))
" 2>/dev/null || echo '{"name":"ERROR"}')
LNAME=$(echo "$LOAD_RESULT" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).name)}catch{console.log('ERR')}})")
LPORT=$(echo "$LOAD_RESULT" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).port)}catch{console.log('ERR')}})")
if [ "$LNAME" = "LoadTest" ] && [ "$LPORT" = "5555" ]; then
  ok "loadSetupJson parses CLI-generated setup.json"
else
  fail "loadSetupJson" "got name=$LNAME port=$LPORT"
fi

# ── Cleanup ───────────────────────────────────────────────

rm -rf "$TMPDIR"

echo ""
echo -e "  ${CYAN}Results: ${GREEN}${PASSED} passed${NC}, ${FAILED:+${RED}}${FAILED} failed${NC}"
echo ""

[ "$FAILED" -eq 0 ] && exit 0 || exit 1

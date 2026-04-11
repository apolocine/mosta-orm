#!/bin/bash
# @mostajs/orm — Run all tests (SQLite + TypeScript)
# Author: Dr Hamid MADANI drmdh@msn.com
# Usage: bash test-scripts/run-all.sh [dialect]
#   dialect: sqlite (default), postgres, mongo, etc.
set -e

cd "$(dirname "$0")/.."

DIALECT="${1:-sqlite}"
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
SCRIPTS=0

echo "══════════════════════════════════════════════"
echo "  @mostajs/orm — Run all tests (${DIALECT})"
echo "══════════════════════════════════════════════"

run_test() {
  local FILE="$1"
  local NAME=$(basename "$FILE" | sed 's/\.\(ts\|mjs\|sh\)$//')
  SCRIPTS=$((SCRIPTS + 1))
  echo ""
  echo "▶ ${NAME}"

  local EXT="${FILE##*.}"
  local OUTPUT=""
  local EXIT_CODE=0

  if [ "$EXT" = "ts" ]; then
    OUTPUT=$(npx tsx "$FILE" 2>&1) || EXIT_CODE=$?
  elif [ "$EXT" = "mjs" ]; then
    OUTPUT=$(node "$FILE" 2>&1) || EXIT_CODE=$?
  elif [ "$EXT" = "sh" ]; then
    OUTPUT=$(bash "$FILE" 2>&1) || EXIT_CODE=$?
  fi

  echo "$OUTPUT" | grep -E "✅|❌" | head -30 || true

  local P=$(echo "$OUTPUT" | grep -oP '\d+(?= passed)' | tail -1)
  local F=$(echo "$OUTPUT" | grep -oP '\d+(?= failed)' | tail -1)
  P=${P:-0}
  F=${F:-0}

  TOTAL_PASSED=$((TOTAL_PASSED + P))
  TOTAL_FAILED=$((TOTAL_FAILED + F))

  if [ "$EXIT_CODE" -ne 0 ] && [ "$F" -eq 0 ]; then
    F=1
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi

  if [ "$F" -gt 0 ]; then
    echo "  ❌ FAILED ($P passed, $F failed)"
  else
    echo "  ✅ OK ($P passed)"
  fi
}

# ── TypeScript tests (all dialects) ──
echo ""
echo "── TypeScript tests ──"
for f in test-scripts/test-*.ts; do
  [ -f "$f" ] && run_test "$f"
done

# ── Shell tests for selected dialect ──
echo ""
echo "── Shell tests (${DIALECT}) ──"
for f in test-scripts/test-*-${DIALECT}.sh; do
  [ -f "$f" ] && run_test "$f"
done

# ── Generic MJS tests (SQLite default) ──
if [ "$DIALECT" = "sqlite" ]; then
  echo ""
  echo "── MJS tests (SQLite) ──"
  for f in test-scripts/test-full-dialect.mjs test-scripts/test-logging-modes.mjs test-scripts/test-secuaccess-fixes.mjs test-scripts/test-seeding-multidialect.mjs; do
    [ -f "$f" ] && run_test "$f"
  done
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  Total: $SCRIPTS suites, $TOTAL_PASSED passed, $TOTAL_FAILED failed"
echo "══════════════════════════════════════════════"

[ "$TOTAL_FAILED" -eq 0 ] && exit 0 || exit 1

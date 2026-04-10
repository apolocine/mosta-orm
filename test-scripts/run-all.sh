#!/bin/bash
# @mostajs/orm — Run all tests
# Author: Dr Hamid MADANI drmdh@msn.com
# Usage: bash test-scripts/run-all.sh
set -e

cd "$(dirname "$0")/.."

TOTAL_PASSED=0
TOTAL_FAILED=0
SCRIPTS=0

echo "══════════════════════════════════════════════"
echo "  @mostajs/orm — Run all tests"
echo "══════════════════════════════════════════════"

for f in test-scripts/test-*.ts; do
  NAME=$(basename "$f" .ts)
  SCRIPTS=$((SCRIPTS + 1))
  echo ""
  echo "▶ ${NAME}"
  OUTPUT=$(npx tsx "$f" 2>&1)
  echo "$OUTPUT" | grep -E "✅|❌" || true
  P=$(echo "$OUTPUT" | grep -oP '\d+ passed' | grep -oP '\d+' || echo 0)
  F=$(echo "$OUTPUT" | grep -oP '\d+ failed' | grep -oP '\d+' || echo 0)
  TOTAL_PASSED=$((TOTAL_PASSED + P))
  TOTAL_FAILED=$((TOTAL_FAILED + F))
  if [ "$F" -gt 0 ]; then
    echo "  ❌ FAILED ($P passed, $F failed)"
  else
    echo "  ✅ OK ($P passed)"
  fi
done

echo ""
echo "══════════════════════════════════════════════"
echo "  Total: $SCRIPTS suites, $TOTAL_PASSED passed, $TOTAL_FAILED failed"
echo "══════════════════════════════════════════════"

[ "$TOTAL_FAILED" -eq 0 ] && exit 0 || exit 1

#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Lance les tests de validation des dialects ORM
# Usage:
#   bash orm-scripts-tests/run-all.sh              # tous les SGBD
#   bash orm-scripts-tests/run-all.sh sqlite mongodb postgres  # sélection

set -uo pipefail
cd "$(dirname "$0")/.."

ALL_DIALECTS=(sqlite mongodb mariadb mysql postgres oracle)

if [ $# -gt 0 ]; then
  DIALECTS=("$@")
else
  DIALECTS=("${ALL_DIALECTS[@]}")
fi

PASSED=()
FAILED=()
SKIPPED=()

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  Validation Dialects @mostajs/orm                 ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
echo "SGBDs: ${DIALECTS[*]}"
echo ""

for dialect in "${DIALECTS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $dialect"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Nettoyer SQLite
  if [ "$dialect" = "sqlite" ]; then
    rm -f data/test-orm.db
  fi

  if npx tsx orm-scripts-tests/test-sgbd.ts "$dialect"; then
    PASSED+=("$dialect")
  else
    rc=$?
    if [ $rc -eq 1 ]; then
      FAILED+=("$dialect")
    else
      SKIPPED+=("$dialect")
    fi
  fi

  echo ""
done

# ── Résumé ──
echo "╔════════════════════════════════════════════════════╗"
echo "║  RÉSUMÉ                                           ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

[ ${#PASSED[@]} -gt 0 ]  && echo "  ✔ Validés  (${#PASSED[@]}):  ${PASSED[*]}"
[ ${#FAILED[@]} -gt 0 ]  && echo "  ✘ Échoués  (${#FAILED[@]}):  ${FAILED[*]}"
[ ${#SKIPPED[@]} -gt 0 ] && echo "  ⊘ Skippés  (${#SKIPPED[@]}): ${SKIPPED[*]}"

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  exit 1
else
  echo "  Tous les dialects testés sont conformes!"
  exit 0
fi

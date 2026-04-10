#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test loadSetupJson() — validates that setup.json is correctly parsed
# into a MostaSetupConfig with seedRBAC, optionalSeeds, etc.
# Usage: ./test-setup-json.sh

set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test loadSetupJson() — setup.json → MostaSetupConfig${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# Run the TypeScript test via tsx
npx tsx orm-scripts-tests/test-setup-json.ts
EXIT=$?

echo ""
if [ $EXIT -eq 0 ]; then
  echo -e "${GREEN}  All loadSetupJson tests passed${NC}"
else
  echo -e "${RED}  loadSetupJson tests FAILED (exit $EXIT)${NC}"
fi
echo ""
exit $EXIT

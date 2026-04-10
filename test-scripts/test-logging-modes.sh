#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test: hibernate.show_sql / format_sql / highlight_sql modes
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "\n${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test Logging Modes — hibernate.show_sql / format_sql / highlight_sql${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}\n"

cd "$ORM_DIR"
DB_FILE=$(mktemp /tmp/test-logging-XXXXXX.db)
trap "rm -f $DB_FILE ${DB_FILE}2 ${DB_FILE}3" EXIT

node tests-scripts/test-logging-modes.mjs "$DB_FILE" 2>&1

echo -e "\n${GREEN}✓ Logging modes test complete${NC}\n"

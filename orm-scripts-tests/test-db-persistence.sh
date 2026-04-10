#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Diagnostic: verifie que la DB est bien creee physiquement apres install
# Prerequis: npm run dev sur port 4567, needsSetup=true
# Usage: ./test-db-persistence.sh

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${SETUP_BASE_URL:-http://localhost:4567}"
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Diagnostic: persistence DB apres install${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Check .env.local BEFORE
echo -e "  ${CYAN}1. .env.local AVANT install:${NC}"
grep -E "^(DB_DIALECT|SGBD_URI|DB_SCHEMA)" .env.local 2>/dev/null || echo "    (fichier absent)"
echo ""

# Step 2: Install sqlite with unique name
DB_NAME="diag_persist_$$"
echo -e "  ${CYAN}2. Install SQLite: $DB_NAME${NC}"
RESULT=$(curl -s -m 30 -X POST "$BASE_URL/api/setup/install" \
  -H 'Content-Type: application/json' \
  -d "{
    \"dialect\":\"sqlite\",
    \"db\":{\"host\":\"\",\"port\":0,\"name\":\"$DB_NAME\",\"user\":\"\",\"password\":\"\"},
    \"admin\":{\"email\":\"diag@test.dz\",\"password\":\"Admin@123456\",\"firstName\":\"Diag\",\"lastName\":\"Test\"}
  }")
echo "    Reponse: $RESULT"
echo ""

# Step 3: Check .env.local AFTER
echo -e "  ${CYAN}3. .env.local APRES install:${NC}"
grep -E "^(DB_DIALECT|SGBD_URI|DB_SCHEMA)" .env.local 2>/dev/null
echo ""

# Step 4: Search for the DB file
echo -e "  ${CYAN}4. Recherche du fichier DB:${NC}"
echo -n "    data/${DB_NAME}.db : "
if [ -f "data/${DB_NAME}.db" ]; then
  echo -e "${GREEN}TROUVE${NC} ($(stat -c%s "data/${DB_NAME}.db") octets)"
else
  echo -e "${RED}ABSENT${NC}"
fi

echo -n "    find dans le projet : "
FOUND=$(find . -name "${DB_NAME}*" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null)
if [ -n "$FOUND" ]; then
  echo -e "${GREEN}$FOUND${NC}"
else
  echo -e "${RED}AUCUN FICHIER${NC}"
fi

echo -n "    find dans /home/hmd : "
FOUND2=$(find /home/hmd -name "${DB_NAME}*" 2>/dev/null | head -5)
if [ -n "$FOUND2" ]; then
  echo -e "${GREEN}$FOUND2${NC}"
else
  echo -e "${RED}AUCUN FICHIER${NC}"
fi
echo ""

# Step 5: Check needsSetup after
echo -e "  ${CYAN}5. needsSetup apres install:${NC}"
curl -s "$BASE_URL/api/setup/status"
echo ""
echo ""

# Step 6: Check data/ directory
echo -e "  ${CYAN}6. Contenu data/:${NC}"
ls -la data/ 2>/dev/null || echo "    (repertoire absent)"
echo ""

# Cleanup
rm -f "data/${DB_NAME}.db" "data/${DB_NAME}.db-shm" "data/${DB_NAME}.db-wal" 2>/dev/null

echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Si le fichier DB est ABSENT mais install OK:${NC}"
echo -e "${YELLOW}  → Le probleme est dans la resolution du chemin relatif${NC}"
echo -e "${YELLOW}  → ou dans le bundling Turbopack de @mostajs/setup${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test /api/setup/install complet sur un dialect specifique
# Cree les tables, seeds RBAC, admin user, optional seeds
# Prerequis: npm run dev sur port 4567, needsSetup=true
# Usage: ./test-setup-install.sh <dialect> [--with-seeds]
#   ex: ./test-setup-install.sh mariadb
#   ex: ./test-setup-install.sh postgres --with-seeds

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${SETUP_BASE_URL:-http://localhost:4567}"
STATUS_EP="$BASE_URL/api/setup/status"
TESTDB_EP="$BASE_URL/api/setup/test-db"
INSTALL_EP="$BASE_URL/api/setup/install"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DIALECT="${1:-}"
WITH_SEEDS="${2:-}"

if [ -z "$DIALECT" ]; then
  echo "Usage: $0 <dialect> [--with-seeds]"
  echo "  Dialects: sqlite mongodb mariadb mysql postgres oracle"
  exit 1
fi

# ────────────────────────────────────────────────────────────
# Config par dialect
# ────────────────────────────────────────────────────────────

case "$DIALECT" in
  sqlite)
    DB_HOST="" DB_PORT=0 DB_NAME="secuaccess_install_test" DB_USER="" DB_PASS="" ;;
  mongodb)
    DB_HOST="localhost" DB_PORT=27017 DB_NAME="secuaccess_install_test" DB_USER="devuser" DB_PASS="devpass26" ;;
  mariadb)
    DB_HOST="localhost" DB_PORT=3307 DB_NAME="secuaccess_install_test" DB_USER="devuser" DB_PASS="devpass26" ;;
  mysql)
    DB_HOST="localhost" DB_PORT=3308 DB_NAME="secuaccess_install_test" DB_USER="devuser" DB_PASS="devpass26" ;;
  postgres)
    DB_HOST="localhost" DB_PORT=5432 DB_NAME="secuaccess_install_test" DB_USER="devuser" DB_PASS="devpass26" ;;
  oracle)
    DB_HOST="localhost" DB_PORT=1521 DB_NAME="XEPDB1" DB_USER="devuser" DB_PASS="devpass26" ;;
  *)
    echo -e "${RED}Dialect inconnu: $DIALECT${NC}"
    exit 1 ;;
esac

SEED_ACTIVITIES="false"
SEED_DEMO_USERS="false"
SEED_DEMO_DATA="false"
if [ "$WITH_SEEDS" = "--with-seeds" ]; then
  SEED_ACTIVITIES="true"
  SEED_DEMO_USERS="true"
  SEED_DEMO_DATA="true"
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test /api/setup/install — $DIALECT${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# ────────────────────────────────────────────────────────────
# Step 1: Verifier le serveur
# ────────────────────────────────────────────────────────────

echo -n "  1. Serveur ... "
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STATUS_EP" 2>/dev/null || echo "000")
if [ "$STATUS_CODE" != "200" ]; then
  echo -e "${RED}FAIL${NC} (serveur non disponible)"
  exit 1
fi
BODY=$(curl -s "$STATUS_EP")
if ! echo "$BODY" | grep -q '"needsSetup":true'; then
  echo -e "${YELLOW}needsSetup=false — redemarrez avec une DB vierge${NC}"
  exit 1
fi
echo -e "${GREEN}OK${NC} (needsSetup=true)"

# ────────────────────────────────────────────────────────────
# Step 2: Test DB connection
# ────────────────────────────────────────────────────────────

echo -n "  2. test-db ($DIALECT:$DB_PORT) ... "
TESTDB_BODY=$(curl -s -m 15 -X POST "$TESTDB_EP" \
  -H 'Content-Type: application/json' \
  -d "{\"dialect\":\"$DIALECT\",\"host\":\"$DB_HOST\",\"port\":$DB_PORT,\"name\":\"$DB_NAME\",\"user\":\"$DB_USER\",\"password\":\"$DB_PASS\"}")

if echo "$TESTDB_BODY" | grep -q '"ok":true'; then
  echo -e "${GREEN}OK${NC}"
else
  ERROR=$(echo "$TESTDB_BODY" | sed 's/.*"error":"\([^"]*\)".*/\1/' | head -c 100)
  echo -e "${RED}FAIL${NC}: $ERROR"
  exit 1
fi

# ────────────────────────────────────────────────────────────
# Step 3: Install complet
# ────────────────────────────────────────────────────────────

echo -n "  3. install ($DIALECT) ... "

INSTALL_PAYLOAD=$(cat <<ENDJSON
{
  "dialect": "$DIALECT",
  "db": {
    "host": "$DB_HOST",
    "port": $DB_PORT,
    "name": "$DB_NAME",
    "user": "$DB_USER",
    "password": "$DB_PASS"
  },
  "admin": {
    "email": "admin@secuaccess.test",
    "password": "Admin@123456",
    "firstName": "Admin",
    "lastName": "Test"
  },
  "seed": {
    "activities": $SEED_ACTIVITIES,
    "demoUsers": $SEED_DEMO_USERS,
    "demoData": $SEED_DEMO_DATA
  }
}
ENDJSON
)

INSTALL_BODY=$(curl -s -m 60 -X POST "$INSTALL_EP" \
  -H 'Content-Type: application/json' \
  -d "$INSTALL_PAYLOAD")

if echo "$INSTALL_BODY" | grep -q '"ok":true'; then
  echo -e "${GREEN}OK${NC}"
  SEEDED=$(echo "$INSTALL_BODY" | grep -o '"seeded":\[[^]]*\]' || echo "")
  RESTART=$(echo "$INSTALL_BODY" | grep -o '"needsRestart":true' || echo "")
  [ -n "$SEEDED" ] && echo -e "     Seeds: $SEEDED"
  [ -n "$RESTART" ] && echo -e "     ${YELLOW}needsRestart=true (dialect a change)${NC}"
else
  ERROR=$(echo "$INSTALL_BODY" | sed 's/.*"message":"\([^"]*\)".*/\1/' | head -c 100)
  echo -e "${RED}FAIL${NC}: $ERROR"
  echo "  Reponse complete: $INSTALL_BODY"
  exit 1
fi

# ────────────────────────────────────────────────────────────
# Step 4: Verifier que needsSetup est maintenant false
# ────────────────────────────────────────────────────────────

echo -n "  4. status post-install ... "
POST_STATUS=$(curl -s "$STATUS_EP")
if echo "$POST_STATUS" | grep -q '"needsSetup":false'; then
  echo -e "${GREEN}OK${NC} (needsSetup=false)"
else
  echo -e "${YELLOW}needsSetup encore true?${NC} $POST_STATUS"
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Install $DIALECT termine avec succes${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

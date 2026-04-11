#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test /api/setup/test-db sur tous les SGBD via HTTP
# Prerequis: npm run dev doit tourner sur le port 4567
# Usage: ./test-setup-http.sh [dialect]   (ex: mariadb, mongodb, all)

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${SETUP_BASE_URL:-http://localhost:4567}"
ENDPOINT="$BASE_URL/api/setup/test-db"
STATUS_ENDPOINT="$BASE_URL/api/setup/status"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

passed=0
failed=0
skipped=0
results=()

# ────────────────────────────────────────────────────────────
# Configurations SGBD (meme credentials que config.ts)
# ────────────────────────────────────────────────────────────

declare -A DIALECTS
DIALECTS[sqlite]='{"dialect":"sqlite","host":"","port":0,"name":"secuaccess_test","user":"","password":""}'
DIALECTS[mongodb]='{"dialect":"mongodb","host":"localhost","port":27017,"name":"secuaccess_test","user":"devuser","password":"devpass26"}'
DIALECTS[mariadb]='{"dialect":"mariadb","host":"localhost","port":3307,"name":"secuaccess_test","user":"devuser","password":"devpass26"}'
DIALECTS[mysql]='{"dialect":"mysql","host":"localhost","port":3308,"name":"testormdb","user":"devuser","password":"devpass26"}'
DIALECTS[postgres]='{"dialect":"postgres","host":"localhost","port":5432,"name":"testormdb","user":"devuser","password":"devpass26"}'
DIALECTS[oracle]='{"dialect":"oracle","host":"localhost","port":1521,"name":"XEPDB1","user":"devuser","password":"devpass26"}'

declare -A LABELS
LABELS[sqlite]="SQLite (local)"
LABELS[mongodb]="MongoDB 7.0 (tunnel 27017)"
LABELS[mariadb]="MariaDB 10.6 (tunnel 3307)"
LABELS[mysql]="MySQL 5.7 (tunnel 3308->3306, arrete sur VPS)"
LABELS[postgres]="PostgreSQL 14 (tunnel 5432)"
LABELS[oracle]="Oracle XE 21c (tunnel 1521)"

declare -A PORTS
PORTS[sqlite]=0
PORTS[mongodb]=27017
PORTS[mariadb]=3307
PORTS[mysql]=3308
PORTS[postgres]=5432
PORTS[oracle]=1521

# Ordre d'execution
ORDER="sqlite mongodb mariadb mysql postgres oracle"

# ────────────────────────────────────────────────────────────
# Fonctions
# ────────────────────────────────────────────────────────────

check_server() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$STATUS_ENDPOINT" 2>/dev/null || echo "000")
  if [ "$status" != "200" ]; then
    echo -e "${RED}Serveur non disponible sur $BASE_URL${NC}"
    echo "Lancez: npm run dev"
    exit 1
  fi

  local body
  body=$(curl -s "$STATUS_ENDPOINT" 2>/dev/null)
  local needs_setup
  needs_setup=$(echo "$body" | grep -o '"needsSetup":true' || true)
  if [ -z "$needs_setup" ]; then
    echo -e "${YELLOW}ATTENTION: needsSetup=false — le wizard est bloque${NC}"
    echo "Utilisez une DB vierge dans .env.local ou videz la table users"
    exit 1
  fi
}

check_port() {
  local port=$1
  if [ "$port" -eq 0 ]; then return 0; fi
  ss -tlnp 2>/dev/null | grep -q ":${port} " && return 0
  return 1
}

test_dialect() {
  local dialect=$1
  local label="${LABELS[$dialect]}"
  local port="${PORTS[$dialect]}"
  local payload="${DIALECTS[$dialect]}"

  printf "  %-35s" "$label"

  # Verifier si le port est ouvert (sauf SQLite)
  if [ "$port" -ne 0 ] && ! check_port "$port"; then
    echo -e "${YELLOW}SKIP${NC} (port $port non ouvert)"
    skipped=$((skipped + 1))
    results+=("SKIP $label (port $port)")
    return
  fi

  local response
  response=$(curl -s -m 10 -X POST "$ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d "$payload" 2>&1)

  local ok
  ok=$(echo "$response" | grep -o '"ok":true' || true)

  if [ -n "$ok" ]; then
    echo -e "${GREEN}OK${NC}"
    passed=$((passed + 1))
    results+=("OK   $label")
  else
    local error
    error=$(echo "$response" | sed 's/.*"error":"\([^"]*\)".*/\1/' | head -c 80)
    echo -e "${RED}FAIL${NC} $error"
    failed=$((failed + 1))
    results+=("FAIL $label: $error")
  fi
}

# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test /api/setup/test-db — SecuAccessPro (branche dal)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# Verifier le serveur
echo -n "  Serveur $BASE_URL ... "
check_server
echo -e "${GREEN}OK${NC} (needsSetup=true)"
echo ""

# Filtre par dialect si argument
FILTER="${1:-all}"

for d in $ORDER; do
  if [ "$FILTER" != "all" ] && [ "$FILTER" != "$d" ]; then
    continue
  fi
  test_dialect "$d"
done

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "  Resultat: ${GREEN}$passed OK${NC}, ${RED}$failed FAIL${NC}, ${YELLOW}$skipped SKIP${NC} / $((passed + failed + skipped)) tests"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# Resume detaille
for r in "${results[@]}"; do
  case "$r" in
    OK*)   echo -e "  ${GREEN}$r${NC}" ;;
    FAIL*) echo -e "  ${RED}$r${NC}" ;;
    SKIP*) echo -e "  ${YELLOW}$r${NC}" ;;
  esac
done
echo ""

exit $failed

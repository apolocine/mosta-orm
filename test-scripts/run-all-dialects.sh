#!/bin/bash
# @mostajs/orm — Run tests on ALL dialects via SSH tunnel to amia.fr
# Author: Dr Hamid MADANI drmdh@msn.com
# Usage: bash test-scripts/run-all-dialects.sh
#
# Prerequisites:
#   - SSH alias 'amia' configured (~/.ssh/config)
#   - Databases installed on amia.fr (PostgreSQL, MongoDB, MariaDB, Oracle XE, MSSQL)
#   - User devuser/devpass26 on all SGBD
#
# Flow per dialect:
#   1. Start SGBD on server (if not running)
#   2. Verify SSH tunnel (ports already forwarded via ssh config)
#   3. Create test database if needed
#   4. Run tests
#   5. Report results
#   6. Next dialect
set -e

cd "$(dirname "$0")/.."

SSH_HOST="amia"
CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
DIALECTS_TESTED=0

echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  @mostajs/orm — Tests multi-dialectes via SSH tunnel      ${NC}"
echo -e "${CYAN}  Serveur: ${SSH_HOST} (amia.fr)                           ${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"

# ── Helper: check tunnel port ──
check_port() {
  local PORT=$1
  nc -z localhost "$PORT" 2>/dev/null && return 0 || return 1
}

# ── Helper: start SGBD on server ──
start_sgbd() {
  local NAME=$1
  local CMD=$2
  echo -e "  ${CYAN}Starting ${NAME} on server...${NC}"
  ssh "$SSH_HOST" "$CMD" 2>&1 | grep -v "bind\|channel\|forwarding" | tail -2 || true
}

# ── Helper: stop SGBD on server ──
stop_sgbd() {
  local NAME=$1
  local CMD=$2
  echo -e "  ${YELLOW}Stopping ${NAME}...${NC}"
  ssh "$SSH_HOST" "$CMD" 2>&1 | grep -v "bind\|channel\|forwarding" | tail -1 || true
}

# ── Helper: run test suite ──
run_dialect_test() {
  local DIALECT=$1
  local TEST_SCRIPT=$2
  DIALECTS_TESTED=$((DIALECTS_TESTED + 1))
  echo -e "\n${CYAN}▶ Running tests: ${DIALECT}${NC}"
  
  local OUTPUT=""
  local EXIT_CODE=0
  OUTPUT=$(bash "$TEST_SCRIPT" 2>&1) || EXIT_CODE=$?

  echo "$OUTPUT" | grep -E "✅|❌|✓|✗|passed|failed" | head -20 || true

  local P=$(echo "$OUTPUT" | grep -oP '\d+(?= passed)' | tail -1)
  local F=$(echo "$OUTPUT" | grep -oP '\d+(?= failed)' | tail -1)
  P=${P:-0}; F=${F:-0}

  if [ "$EXIT_CODE" -ne 0 ] && [ "$F" -eq 0 ]; then F=1; fi

  TOTAL_PASS=$((TOTAL_PASS + P))
  TOTAL_FAIL=$((TOTAL_FAIL + F))

  if [ "$F" -gt 0 ]; then
    echo -e "  ${RED}❌ ${DIALECT}: ${P} passed, ${F} failed${NC}"
  else
    echo -e "  ${GREEN}✅ ${DIALECT}: ${P} passed${NC}"
  fi
}

skip_dialect() {
  local DIALECT=$1
  local REASON=$2
  TOTAL_SKIP=$((TOTAL_SKIP + 1))
  echo -e "\n${YELLOW}⏭ ${DIALECT}: SKIP — ${REASON}${NC}"
}

# ══════════════════════════════════════════════════════════
# 1. SQLite (local, pas besoin de tunnel)
# ══════════════════════════════════════════════════════════
echo -e "\n${CYAN}━━━ 1/6 SQLite (local) ━━━${NC}"
run_dialect_test "sqlite" "test-scripts/test-full-sqlite.sh"

# ══════════════════════════════════════════════════════════
# 2. PostgreSQL (tunnel :5432)
# ══════════════════════════════════════════════════════════
echo -e "\n${CYAN}━━━ 2/6 PostgreSQL ━━━${NC}"
if check_port 5432; then
  echo -e "  ${GREEN}Tunnel :5432 actif${NC}"
  # Create test DB if needed
  ssh "$SSH_HOST" "sudo -u postgres psql -tc \"SELECT 1 FROM pg_database WHERE datname='test_full_orm'\" | grep -q 1 || sudo -u postgres psql -c 'CREATE DATABASE test_full_orm OWNER devuser;'" 2>&1 | grep -v "bind\|channel\|forwarding" | tail -1 || true
  run_dialect_test "postgres" "test-scripts/test-full-postgres.sh"
else
  skip_dialect "PostgreSQL" "tunnel :5432 inactif"
fi

# ══════════════════════════════════════════════════════════
# 3. MongoDB (tunnel :27017)
# ══════════════════════════════════════════════════════════
echo -e "\n${CYAN}━━━ 3/6 MongoDB ━━━${NC}"
if check_port 27017; then
  echo -e "  ${GREEN}Tunnel :27017 actif${NC}"
  # Start mongod if not running
  start_sgbd "MongoDB" "pgrep -x mongod > /dev/null || sudo systemctl start mongod"
  run_dialect_test "mongodb" "test-scripts/test-full-mongo.sh"
else
  skip_dialect "MongoDB" "tunnel :27017 inactif"
fi

# ══════════════════════════════════════════════════════════
# 4. MariaDB (tunnel :3307 ou :3306)
# ══════════════════════════════════════════════════════════
echo -e "\n${CYAN}━━━ 4/6 MariaDB ━━━${NC}"
if check_port 3307 || check_port 3306; then
  MARIA_PORT=$(check_port 3307 && echo 3307 || echo 3306)
  echo -e "  ${GREEN}Tunnel :${MARIA_PORT} actif${NC}"
  start_sgbd "MariaDB" "pgrep -x mariadbd > /dev/null || sudo systemctl start mariadb"
  # Create test DB
  ssh "$SSH_HOST" "mariadb -u devuser -pdevpass26 -e 'CREATE DATABASE IF NOT EXISTS test_full_orm;'" 2>&1 | grep -v "bind\|channel\|forwarding\|Warning" | tail -1 || true
  run_dialect_test "mariadb" "test-scripts/test-full-mariadb.sh"
else
  skip_dialect "MariaDB" "tunnel :3306/:3307 inactif"
fi

# ══════════════════════════════════════════════════════════
# 5. Oracle XE (tunnel :1521)
# ══════════════════════════════════════════════════════════
echo -e "\n${CYAN}━━━ 5/6 Oracle XE ━━━${NC}"
if check_port 1521; then
  echo -e "  ${GREEN}Tunnel :1521 actif${NC}"
  start_sgbd "Oracle XE" "pgrep -f ora_pmon > /dev/null || sudo systemctl start oracle-xe-21c"
  run_dialect_test "oracle" "test-scripts/test-full-oracle.sh"
else
  skip_dialect "Oracle XE" "tunnel :1521 inactif"
fi

# ══════════════════════════════════════════════════════════
# 6. MSSQL (tunnel :1433)
# ══════════════════════════════════════════════════════════
echo -e "\n${CYAN}━━━ 6/6 MSSQL ━━━${NC}"
if check_port 1433; then
  echo -e "  ${GREEN}Tunnel :1433 actif${NC}"
  start_sgbd "MSSQL" "pgrep -f sqlservr > /dev/null || sudo systemctl start mssql-server"
  run_dialect_test "mssql" "test-scripts/test-full-mssql.sh"
else
  skip_dialect "MSSQL" "tunnel :1433 inactif"
fi

# ══════════════════════════════════════════════════════════
# Rapport final
# ══════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "  Dialectes testes: ${DIALECTS_TESTED} | Skipped: ${TOTAL_SKIP}"
echo -e "  ${GREEN}${TOTAL_PASS} passed${NC}  ${RED}${TOTAL_FAIL} failed${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"

[ "$TOTAL_FAIL" -eq 0 ] && exit 0 || exit 1

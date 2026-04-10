#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Diagnostic MySQL 5.7 + MariaDB sur amia.fr
# Usage: ssh amia 'bash -s' < orm-scripts-tests/test-mysql/00-diagnostic-server.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✔ $*${NC}"; }
fail() { echo -e "  ${RED}✘ $*${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $*${NC}"; }
info() { echo -e "  ${CYAN}ℹ $*${NC}"; }
header() { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

header "1. Binaires"

# MySQL 5.7
if [ -f /usr/local/mysql/bin/mysqld ]; then
    ok "MySQL 5.7 binary: /usr/local/mysql/bin/mysqld"
    info "$(/usr/local/mysql/bin/mysqld --version 2>&1 || echo 'version inconnue')"
else
    fail "MySQL 5.7 binary not found at /usr/local/mysql/bin/mysqld"
fi

# MariaDB (system)
if [ -f /usr/sbin/mysqld ]; then
    ok "System mysqld: /usr/sbin/mysqld"
    info "$(/usr/sbin/mysqld --version 2>&1 || echo 'version inconnue')"
else
    warn "System mysqld not found"
fi

header "2. Services"

for svc in mysql mariadb; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        ok "$svc: RUNNING"
    elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
        warn "$svc: STOPPED (enabled)"
    else
        info "$svc: STOPPED (disabled)"
    fi
done

header "3. Ports"

for port in 3306 3307; do
    pid=$(sudo lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        proc=$(ps -p "$pid" -o comm= 2>/dev/null || echo "???")
        ok "Port $port: PID $pid ($proc)"
    else
        warn "Port $port: libre"
    fi
done

header "4. Config MySQL 5.7"

if [ -f /etc/mysql57.cnf ]; then
    ok "/etc/mysql57.cnf exists"
    echo "  ---"
    cat /etc/mysql57.cnf | sed 's/^/  /'
    echo "  ---"
else
    fail "/etc/mysql57.cnf not found"
fi

header "5. Config MariaDB"

for f in /etc/mysql/mariadb.conf.d/50-server.cnf /etc/mysql/my.cnf /etc/mysql/mariadb.cnf; do
    if [ -f "$f" ]; then
        ok "$f exists"
        grep -E "^(port|bind|datadir|socket|pid)" "$f" 2>/dev/null | sed 's/^/    /' || true
    fi
done

header "6. Datadir MySQL 5.7"

DATADIR="/var/lib/mysql57"
if [ -d "$DATADIR" ]; then
    ok "$DATADIR exists"
    info "Owner: $(stat -c '%U:%G' "$DATADIR")"
    info "Files: $(ls "$DATADIR" | wc -l)"
    # Check for MariaDB contamination
    if ls "$DATADIR"/aria_log* &>/dev/null; then
        fail "MariaDB aria_log files found in MySQL 5.7 datadir — CONTAMINATED"
    else
        ok "No MariaDB contamination"
    fi
    # Check for ibdata
    if [ -f "$DATADIR/ibdata1" ]; then
        ok "ibdata1 present (InnoDB system tablespace)"
    else
        warn "ibdata1 missing — datadir may need initialization"
    fi
else
    fail "$DATADIR does not exist"
fi

header "7. Datadir MariaDB"

MARIA_DATADIR="/var/lib/mysql"
if [ -d "$MARIA_DATADIR" ]; then
    ok "$MARIA_DATADIR exists"
    info "Owner: $(stat -c '%U:%G' "$MARIA_DATADIR")"
    info "Files: $(ls "$MARIA_DATADIR" | wc -l)"
else
    warn "$MARIA_DATADIR does not exist"
fi

header "8. Logs"

echo -e "  ${BOLD}MySQL 5.7 error log:${NC}"
if [ -f /var/log/mysql/error57.log ]; then
    tail -10 /var/log/mysql/error57.log 2>/dev/null | sed 's/^/    /' || warn "Cannot read"
else
    warn "/var/log/mysql/error57.log not found"
fi

echo ""
echo -e "  ${BOLD}MariaDB error log:${NC}"
if [ -f /var/log/mysql/error.log ]; then
    tail -5 /var/log/mysql/error.log 2>/dev/null | sed 's/^/    /' || warn "Cannot read"
else
    warn "/var/log/mysql/error.log not found"
fi

header "9. Socket files"

for sock in /var/run/mysqld/mysqld57.sock /var/run/mysqld/mysqld.sock /run/mysqld/mysqld.sock; do
    if [ -S "$sock" ]; then
        ok "$sock exists"
    else
        info "$sock absent"
    fi
done

header "Diagnostic terminé"

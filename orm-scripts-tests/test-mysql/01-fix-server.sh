#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Fix MySQL 5.7 + MariaDB coexistence sur amia.fr
# Usage: ssh amia 'bash -s' < orm-scripts-tests/test-mysql/01-fix-server.sh
#
# MySQL 5.7 → port 3306, socket mysqld57.sock, datadir /var/lib/mysql57
# MariaDB   → port 3307, socket mysqld.sock,   datadir /var/lib/mysql

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

# ══════════════════════════════════════════════════════════════
# PHASE 1: Arrêter tout
# ══════════════════════════════════════════════════════════════
header "Phase 1 — Arrêt des services"

sudo systemctl stop mysql 2>/dev/null || true
sudo systemctl stop mariadb 2>/dev/null || true

# Kill any remaining mysqld processes
sudo killall mysqld 2>/dev/null || true
sleep 2
ok "Services arrêtés"

# ══════════════════════════════════════════════════════════════
# PHASE 2: Configurer MariaDB sur port 3307
# ══════════════════════════════════════════════════════════════
header "Phase 2 — MariaDB → port 3307"

MARIA_CONF="/etc/mysql/mariadb.conf.d/50-server.cnf"

if [ -f "$MARIA_CONF" ]; then
    # Backup
    sudo cp "$MARIA_CONF" "${MARIA_CONF}.bak.$(date +%Y%m%d)"
    ok "Backup: ${MARIA_CONF}.bak"

    # Change port to 3307
    if grep -q "^port" "$MARIA_CONF"; then
        sudo sed -i 's/^port.*/port = 3307/' "$MARIA_CONF"
    else
        # Insert after [mysqld] section
        sudo sed -i '/^\[mysqld\]/a port = 3307' "$MARIA_CONF"
    fi
    ok "MariaDB port → 3307"

    # Ensure bind-address allows local connections
    if grep -q "^bind-address" "$MARIA_CONF"; then
        sudo sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' "$MARIA_CONF"
    fi
    ok "MariaDB bind → 127.0.0.1"
else
    warn "$MARIA_CONF not found — creating minimal config"
    sudo mkdir -p /etc/mysql/mariadb.conf.d
    sudo tee "$MARIA_CONF" > /dev/null <<CONFEOF
[mysqld]
port = 3307
bind-address = 127.0.0.1
datadir = /var/lib/mysql
socket = /var/run/mysqld/mysqld.sock
pid-file = /var/run/mysqld/mysqld.pid
CONFEOF
    ok "Created $MARIA_CONF"
fi

# ══════════════════════════════════════════════════════════════
# PHASE 3: Nettoyer et réinitialiser MySQL 5.7
# ══════════════════════════════════════════════════════════════
header "Phase 3 — MySQL 5.7 datadir reset"

MYSQL57_DATADIR="/var/lib/mysql57"
MYSQL57_BIN="/usr/local/mysql/bin"

# Ensure run directory exists
sudo mkdir -p /var/run/mysqld
sudo chown mysql:mysql /var/run/mysqld

# Ensure log directory
sudo mkdir -p /var/log/mysql
sudo chown mysql:mysql /var/log/mysql
sudo touch /var/log/mysql/error57.log
sudo chown mysql:mysql /var/log/mysql/error57.log

# Clean contaminated datadir
if [ -d "$MYSQL57_DATADIR" ]; then
    warn "Cleaning contaminated datadir..."
    sudo rm -rf "${MYSQL57_DATADIR:?}"/*
    ok "Datadir cleaned"
fi

sudo mkdir -p "$MYSQL57_DATADIR"
sudo chown mysql:mysql "$MYSQL57_DATADIR"

# Initialize MySQL 5.7 fresh
info "Initializing MySQL 5.7 datadir..."
sudo "$MYSQL57_BIN/mysqld" --defaults-file=/etc/mysql57.cnf --initialize-insecure --user=mysql 2>&1
ok "MySQL 5.7 initialized (insecure — no root password)"

# ══════════════════════════════════════════════════════════════
# PHASE 4: Démarrer MariaDB
# ══════════════════════════════════════════════════════════════
header "Phase 4 — Démarrer MariaDB (port 3307)"

sudo systemctl start mariadb
sleep 2

if systemctl is-active --quiet mariadb; then
    ok "MariaDB started on port 3307"
else
    fail "MariaDB failed to start"
    sudo journalctl -u mariadb --no-pager -n 10
fi

# ══════════════════════════════════════════════════════════════
# PHASE 5: Démarrer MySQL 5.7
# ══════════════════════════════════════════════════════════════
header "Phase 5 — Démarrer MySQL 5.7 (port 3306)"

sudo systemctl start mysql
sleep 3

if systemctl is-active --quiet mysql; then
    ok "MySQL 5.7 started on port 3306"
else
    fail "MySQL 5.7 failed to start — checking log..."
    sudo tail -20 /var/log/mysql/error57.log
    exit 1
fi

# ══════════════════════════════════════════════════════════════
# PHASE 6: Créer utilisateur devuser sur les deux
# ══════════════════════════════════════════════════════════════
header "Phase 6 — Créer devuser"

# MySQL 5.7
info "MySQL 5.7..."
"$MYSQL57_BIN/mysql" -S /var/run/mysqld/mysqld57.sock -u root <<'SQL' 2>/dev/null || true
CREATE USER IF NOT EXISTS 'devuser'@'localhost' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'localhost' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'devuser'@'127.0.0.1' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL
ok "devuser created on MySQL 5.7"

# MariaDB
info "MariaDB..."
sudo mysql -S /var/run/mysqld/mysqld.sock -u root <<'SQL' 2>/dev/null || true
CREATE USER IF NOT EXISTS 'devuser'@'localhost' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'localhost' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'devuser'@'127.0.0.1' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL
ok "devuser created on MariaDB"

# ══════════════════════════════════════════════════════════════
# PHASE 7: Créer bases de test
# ══════════════════════════════════════════════════════════════
header "Phase 7 — Créer bases testormdb"

"$MYSQL57_BIN/mysql" -S /var/run/mysqld/mysqld57.sock -u devuser -pdevpass26 -e "CREATE DATABASE IF NOT EXISTS testormdb;" 2>/dev/null
ok "testormdb created on MySQL 5.7"

sudo mysql -S /var/run/mysqld/mysqld.sock -u devuser -pdevpass26 -e "CREATE DATABASE IF NOT EXISTS testormdb;" 2>/dev/null
ok "testormdb created on MariaDB"

# ══════════════════════════════════════════════════════════════
# PHASE 8: Vérification finale
# ══════════════════════════════════════════════════════════════
header "Phase 8 — Vérification"

echo -e "  ${BOLD}Ports:${NC}"
for port in 3306 3307; do
    pid=$(sudo lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        proc=$(ps -p "$pid" -o comm= 2>/dev/null || echo "???")
        ok "Port $port: PID $pid ($proc)"
    else
        fail "Port $port: rien"
    fi
done

echo ""
echo -e "  ${BOLD}Connexions:${NC}"
"$MYSQL57_BIN/mysql" -S /var/run/mysqld/mysqld57.sock -u devuser -pdevpass26 -e "SELECT 'MySQL 5.7 OK' AS status, VERSION() AS version;" 2>/dev/null && ok "MySQL 5.7 connection OK" || fail "MySQL 5.7 connection FAILED"
sudo mysql -S /var/run/mysqld/mysqld.sock -u devuser -pdevpass26 -e "SELECT 'MariaDB OK' AS status, VERSION() AS version;" 2>/dev/null && ok "MariaDB connection OK" || fail "MariaDB connection FAILED"

header "Configuration terminée"
echo -e "  MySQL 5.7 : localhost:3306 (devuser/devpass26)"
echo -e "  MariaDB   : localhost:3307 (devuser/devpass26)"

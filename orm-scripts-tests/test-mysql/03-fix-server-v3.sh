#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Fix v3: MySQL 5.7 (port 3306) + MariaDB (port 3307)
# MariaDB datadir → /var/lib/mariadb (séparé de MySQL)
# Le service systemd MySQL 5.7 timeout → démarrage manuel en daemon
# Lancer: sudo bash /tmp/fix-mysql-v3.sh

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✔ $*${NC}"; }
fail() { echo -e "  ${RED}✘ $*${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $*${NC}"; }
info() { echo -e "  ${CYAN}ℹ $*${NC}"; }
header() { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

MYSQL57_BIN="/usr/local/mysql/bin"
MYSQL57_CONF="/etc/mysql57.cnf"
MYSQL57_DATADIR="/var/lib/mysql57"
MARIA_CONF="/etc/mysql/mariadb.conf.d/50-server.cnf"
MARIA_DATADIR="/var/lib/mariadb"

# ══════════════════════════════════════════════════════════════
header "Phase 1 — Tout arrêter"
# ══════════════════════════════════════════════════════════════
systemctl stop mysql 2>/dev/null || true
systemctl stop mariadb 2>/dev/null || true
killall mysqld 2>/dev/null || true
sleep 2
ok "Tout arrêté"

# ══════════════════════════════════════════════════════════════
header "Phase 2 — MariaDB → /var/lib/mariadb, port 3307"
# ══════════════════════════════════════════════════════════════

# Créer le nouveau datadir MariaDB
mkdir -p "$MARIA_DATADIR"
chown mysql:mysql "$MARIA_DATADIR"

# Copier les données existantes si /var/lib/mysql a du contenu
if [ -d /var/lib/mysql ] && [ "$(ls -A /var/lib/mysql 2>/dev/null)" ]; then
    if [ ! "$(ls -A "$MARIA_DATADIR" 2>/dev/null)" ]; then
        cp -a /var/lib/mysql/* "$MARIA_DATADIR"/ 2>/dev/null || true
        chown -R mysql:mysql "$MARIA_DATADIR"
        ok "Données copiées de /var/lib/mysql → $MARIA_DATADIR"
    else
        ok "$MARIA_DATADIR déjà peuplé"
    fi
else
    warn "/var/lib/mysql vide — MariaDB réinitialisera"
fi

# Configurer MariaDB
sed -i "s|^datadir.*|datadir = $MARIA_DATADIR|" "$MARIA_CONF" 2>/dev/null || \
    sed -i "/^\[mysqld\]/a datadir = $MARIA_DATADIR" "$MARIA_CONF"
sed -i 's/^port.*/port = 3307/' "$MARIA_CONF"

# PID et socket distincts
if grep -q "^pid-file" "$MARIA_CONF"; then
    sed -i 's|^pid-file.*|pid-file = /run/mysqld/mariadb.pid|' "$MARIA_CONF"
else
    sed -i '/^\[mysqld\]/a pid-file = /run/mysqld/mariadb.pid' "$MARIA_CONF"
fi

if grep -q "^socket" "$MARIA_CONF"; then
    sed -i 's|^socket.*|socket = /run/mysqld/mariadb.sock|' "$MARIA_CONF"
else
    sed -i '/^\[mysqld\]/a socket = /run/mysqld/mariadb.sock' "$MARIA_CONF"
fi

ok "MariaDB configurée:"
grep -E "^(port|datadir|pid-file|socket|bind)" "$MARIA_CONF" | sed 's/^/    /'

# ══════════════════════════════════════════════════════════════
header "Phase 3 — MySQL 5.7 datadir propre"
# ══════════════════════════════════════════════════════════════

mkdir -p /var/run/mysqld /var/log/mysql "$MYSQL57_DATADIR"
chown mysql:mysql /var/run/mysqld /var/log/mysql "$MYSQL57_DATADIR"
touch /var/log/mysql/error57.log
chown mysql:mysql /var/log/mysql/error57.log

rm -rf "${MYSQL57_DATADIR:?}"/*
ok "Datadir nettoyé"

"$MYSQL57_BIN/mysqld" --defaults-file="$MYSQL57_CONF" --initialize-insecure --user=mysql 2>&1
ok "MySQL 5.7 initialisé"

if ls "$MYSQL57_DATADIR"/aria_log* &>/dev/null; then
    fail "Contamination aria_log !"
else
    ok "Datadir propre"
fi

# ══════════════════════════════════════════════════════════════
header "Phase 4 — Démarrer MySQL 5.7 (daemon manuel)"
# ══════════════════════════════════════════════════════════════

# Le service systemd timeout → démarrage direct en daemon
info "Démarrage manuel (le service systemd timeout)..."
"$MYSQL57_BIN/mysqld" --defaults-file="$MYSQL57_CONF" --user=mysql --daemonize --pid-file=/var/run/mysqld/mysqld57.pid
sleep 3

if [ -f /var/run/mysqld/mysqld57.pid ]; then
    PID=$(cat /var/run/mysqld/mysqld57.pid)
    if kill -0 "$PID" 2>/dev/null; then
        ok "MySQL 5.7 démarré (PID $PID, port 3306)"
    else
        fail "PID $PID mort"
        tail -20 /var/log/mysql/error57.log
        exit 1
    fi
else
    fail "Pas de PID file"
    tail -20 /var/log/mysql/error57.log
    exit 1
fi

# ══════════════════════════════════════════════════════════════
header "Phase 5 — Démarrer MariaDB"
# ══════════════════════════════════════════════════════════════

mkdir -p /run/mysqld
chown mysql:mysql /run/mysqld

# Si le datadir MariaDB est vide, initialiser
if [ ! -f "$MARIA_DATADIR/ibdata1" ]; then
    info "Initialisation MariaDB datadir..."
    mysql_install_db --user=mysql --datadir="$MARIA_DATADIR" 2>/dev/null || \
        mariadb-install-db --user=mysql --datadir="$MARIA_DATADIR" 2>/dev/null || true
fi

systemctl start mariadb
sleep 2

if systemctl is-active --quiet mariadb; then
    ok "MariaDB démarrée (port 3307)"
else
    fail "MariaDB échouée"
    journalctl -u mariadb --no-pager -n 10
fi

# ══════════════════════════════════════════════════════════════
header "Phase 6 — Vérification séparation"
# ══════════════════════════════════════════════════════════════

for port in 3306 3307; do
    pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        proc=$(ps -p "$pid" -o comm= 2>/dev/null)
        ok "Port $port: PID $pid ($proc)"
    else
        fail "Port $port: rien"
    fi
done

echo ""
info "MySQL 5.7 datadir ($MYSQL57_DATADIR):"
ls "$MYSQL57_DATADIR" | head -5 | sed 's/^/    /'
if ls "$MYSQL57_DATADIR"/aria_log* &>/dev/null; then
    fail "CONTAMINATION dans MySQL 5.7 !"
else
    ok "MySQL 5.7 datadir propre"
fi

echo ""
info "MariaDB datadir ($MARIA_DATADIR):"
ls "$MARIA_DATADIR" 2>/dev/null | head -5 | sed 's/^/    /' || warn "Vide"

# ══════════════════════════════════════════════════════════════
header "Phase 7 — Créer devuser + testormdb"
# ══════════════════════════════════════════════════════════════

# MySQL 5.7
info "MySQL 5.7..."
"$MYSQL57_BIN/mysql" -S /var/run/mysqld/mysqld57.sock -u root <<'SQL' 2>/dev/null || true
CREATE USER IF NOT EXISTS 'devuser'@'localhost' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'localhost' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'devuser'@'127.0.0.1' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE IF NOT EXISTS testormdb;
FLUSH PRIVILEGES;
SQL
ok "MySQL 5.7: devuser + testormdb"

# MariaDB
info "MariaDB..."
MARIA_SOCK=""
for sock in /run/mysqld/mariadb.sock /run/mysqld/mysqld.sock; do
    [ -S "$sock" ] && MARIA_SOCK="$sock" && break
done

if [ -n "$MARIA_SOCK" ]; then
    mysql -S "$MARIA_SOCK" -u root <<'SQL' 2>/dev/null || true
CREATE USER IF NOT EXISTS 'devuser'@'localhost' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'localhost' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'devuser'@'127.0.0.1' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE IF NOT EXISTS testormdb;
FLUSH PRIVILEGES;
SQL
    ok "MariaDB: devuser + testormdb"
else
    warn "Socket MariaDB introuvable"
fi

# ══════════════════════════════════════════════════════════════
header "Phase 8 — Test connexion TCP"
# ══════════════════════════════════════════════════════════════

echo -e "  ${BOLD}MySQL 5.7 (port 3306):${NC}"
"$MYSQL57_BIN/mysql" -h 127.0.0.1 -P 3306 -u devuser -pdevpass26 -e "SELECT VERSION() AS v, 'MySQL 5.7' AS engine;" 2>/dev/null && ok "OK" || fail "FAILED"

echo -e "  ${BOLD}MariaDB (port 3307):${NC}"
mysql -h 127.0.0.1 -P 3307 -u devuser -pdevpass26 -e "SELECT VERSION() AS v, 'MariaDB' AS engine;" 2>/dev/null && ok "OK" || fail "FAILED"

header "Terminé"
echo -e "  MySQL 5.7 : 127.0.0.1:3306  datadir=$MYSQL57_DATADIR"
echo -e "  MariaDB   : 127.0.0.1:3307  datadir=$MARIA_DATADIR"
echo -e "  User      : devuser / devpass26"

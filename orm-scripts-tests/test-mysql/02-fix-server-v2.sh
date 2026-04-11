#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Fix v2: MySQL 5.7 + MariaDB coexistence — forcer datadirs séparés
# Lancer sur le serveur: sudo bash /tmp/fix-mysql-v2.sh

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
MARIA_DATADIR="/var/lib/mysql"

# ══════════════════════════════════════════════════════════════
header "Phase 1 — Tout arrêter"
# ══════════════════════════════════════════════════════════════
systemctl stop mysql 2>/dev/null || true
systemctl stop mariadb 2>/dev/null || true
killall mysqld 2>/dev/null || true
sleep 2
ok "Services et processus arrêtés"

# ══════════════════════════════════════════════════════════════
header "Phase 2 — Forcer datadir MariaDB → /var/lib/mysql"
# ══════════════════════════════════════════════════════════════

# Décommenter et forcer datadir dans MariaDB config
if grep -q "#datadir" "$MARIA_CONF"; then
    sed -i 's|#datadir.*|datadir = /var/lib/mysql|' "$MARIA_CONF"
    ok "Décommenté datadir → /var/lib/mysql"
elif grep -q "^datadir" "$MARIA_CONF"; then
    sed -i 's|^datadir.*|datadir = /var/lib/mysql|' "$MARIA_CONF"
    ok "datadir forcé → /var/lib/mysql"
else
    sed -i '/^\[mysqld\]/a datadir = /var/lib/mysql' "$MARIA_CONF"
    ok "datadir ajouté → /var/lib/mysql"
fi

# Forcer le port 3307
sed -i 's/^port.*/port = 3307/' "$MARIA_CONF"
ok "Port MariaDB → 3307"

# Forcer un PID file distinct
if grep -q "^pid-file" "$MARIA_CONF"; then
    sed -i 's|^pid-file.*|pid-file = /run/mysqld/mariadb.pid|' "$MARIA_CONF"
else
    sed -i '/^\[mysqld\]/a pid-file = /run/mysqld/mariadb.pid' "$MARIA_CONF"
fi
ok "PID MariaDB → /run/mysqld/mariadb.pid"

# Forcer socket distinct
if ! grep -q "^socket" "$MARIA_CONF"; then
    sed -i '/^\[mysqld\]/a socket = /run/mysqld/mariadb.sock' "$MARIA_CONF"
    ok "Socket MariaDB → /run/mysqld/mariadb.sock"
fi

# Vérification
info "Config MariaDB finale:"
grep -E "^(port|datadir|pid-file|socket|bind)" "$MARIA_CONF" | sed 's/^/    /'

# ══════════════════════════════════════════════════════════════
header "Phase 3 — Initialiser MySQL 5.7 proprement"
# ══════════════════════════════════════════════════════════════

# Créer les répertoires nécessaires
mkdir -p /var/run/mysqld /var/log/mysql "$MYSQL57_DATADIR"
chown mysql:mysql /var/run/mysqld /var/log/mysql "$MYSQL57_DATADIR"
touch /var/log/mysql/error57.log
chown mysql:mysql /var/log/mysql/error57.log

# Nettoyer le datadir MySQL 5.7 (enlever contamination MariaDB)
rm -rf "${MYSQL57_DATADIR:?}"/*
ok "Datadir MySQL 5.7 nettoyé"

# Initialiser
info "Initialisation MySQL 5.7..."
"$MYSQL57_BIN/mysqld" --defaults-file="$MYSQL57_CONF" --initialize-insecure --user=mysql 2>&1
ok "MySQL 5.7 initialisé"

# Vérifier qu'il n'y a PAS de aria_log
if ls "$MYSQL57_DATADIR"/aria_log* &>/dev/null; then
    fail "aria_log toujours présent après init — problème !"
else
    ok "Pas de contamination MariaDB"
fi

# ══════════════════════════════════════════════════════════════
header "Phase 4 — Démarrer MySQL 5.7 EN PREMIER"
# ══════════════════════════════════════════════════════════════

systemctl start mysql
sleep 3

if systemctl is-active --quiet mysql; then
    ok "MySQL 5.7 démarré (port 3306)"
else
    fail "MySQL 5.7 échoué — log:"
    tail -20 /var/log/mysql/error57.log 2>/dev/null || journalctl -u mysql --no-pager -n 15

    # Essai de démarrage manuel pour debug
    info "Tentative de démarrage manuel..."
    "$MYSQL57_BIN/mysqld" --defaults-file="$MYSQL57_CONF" --user=mysql &
    MANUAL_PID=$!
    sleep 5
    if kill -0 $MANUAL_PID 2>/dev/null; then
        ok "Démarrage manuel réussi (PID $MANUAL_PID)"
        info "Le problème est dans le service systemd, pas dans MySQL"
    else
        fail "Démarrage manuel échoué aussi"
        tail -20 /var/log/mysql/error57.log 2>/dev/null
        exit 1
    fi
fi

# ══════════════════════════════════════════════════════════════
header "Phase 5 — Démarrer MariaDB"
# ══════════════════════════════════════════════════════════════

# S'assurer que le répertoire run existe
mkdir -p /run/mysqld
chown mysql:mysql /run/mysqld

systemctl start mariadb
sleep 2

if systemctl is-active --quiet mariadb; then
    ok "MariaDB démarrée (port 3307)"
else
    fail "MariaDB échouée"
    journalctl -u mariadb --no-pager -n 10
fi

# ══════════════════════════════════════════════════════════════
header "Phase 6 — Vérifier la séparation"
# ══════════════════════════════════════════════════════════════

# Ports
for port in 3306 3307; do
    pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        proc=$(ps -p "$pid" -o args= 2>/dev/null | head -c 60)
        ok "Port $port: $proc"
    else
        fail "Port $port: rien"
    fi
done

# Datadirs
info "MySQL 5.7 datadir:"
ls "$MYSQL57_DATADIR" | head -5 | sed 's/^/    /'
if ls "$MYSQL57_DATADIR"/aria_log* &>/dev/null; then
    fail "CONTAMINATION: aria_log dans MySQL 5.7 datadir !"
else
    ok "MySQL 5.7 datadir propre"
fi

info "MariaDB datadir:"
ls "$MARIA_DATADIR" 2>/dev/null | head -5 | sed 's/^/    /' || warn "Accès refusé"

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
ok "devuser + testormdb sur MySQL 5.7"

# MariaDB (socket peut être mariadb.sock ou mysqld.sock)
info "MariaDB..."
MARIA_SOCK=""
for sock in /run/mysqld/mariadb.sock /run/mysqld/mysqld.sock /var/run/mysqld/mysqld.sock; do
    if [ -S "$sock" ]; then
        MARIA_SOCK="$sock"
        break
    fi
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
    ok "devuser + testormdb sur MariaDB (via $MARIA_SOCK)"
else
    warn "Socket MariaDB introuvable — configurer manuellement"
fi

# ══════════════════════════════════════════════════════════════
header "Phase 8 — Test connexion"
# ══════════════════════════════════════════════════════════════

echo -e "  ${BOLD}MySQL 5.7:${NC}"
"$MYSQL57_BIN/mysql" -h 127.0.0.1 -P 3306 -u devuser -pdevpass26 -e "SELECT VERSION() AS version, 'MySQL 5.7' AS engine;" 2>/dev/null && ok "MySQL 5.7 OK" || fail "MySQL 5.7 FAILED"

echo -e "  ${BOLD}MariaDB:${NC}"
mysql -h 127.0.0.1 -P 3307 -u devuser -pdevpass26 -e "SELECT VERSION() AS version, 'MariaDB' AS engine;" 2>/dev/null && ok "MariaDB OK" || fail "MariaDB FAILED"

header "Terminé"
echo -e "  MySQL 5.7 : 127.0.0.1:3306 (devuser/devpass26) datadir=$MYSQL57_DATADIR"
echo -e "  MariaDB   : 127.0.0.1:3307 (devuser/devpass26) datadir=$MARIA_DATADIR"

#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Séparer les configs MySQL 5.7 et MariaDB
#
# AVANT:
#   /etc/mysql/my.cnf → symlink vers mariadb.cnf (les deux SGBD le lisent)
#   /etc/mysql57.cnf  → MySQL 5.7 standalone
#
# APRÈS:
#   /etc/mysql/my.cnf      → MySQL 5.7 client uniquement (socket mysql57)
#   /etc/mysql/mariadb.cnf → MariaDB (socket mariadb, includes mariadb.conf.d/)
#   /etc/mysql57.cnf        → MySQL 5.7 server (inchangé)
#
# Lancer: sudo bash /tmp/separate-configs.sh

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()     { echo -e "  ${GREEN}✔ $*${NC}"; }
info()   { echo -e "  ${CYAN}ℹ $*${NC}"; }
header() { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

# ══════════════════════════════════════════════════════════════
header "Phase 1 — Backup"
# ══════════════════════════════════════════════════════════════

STAMP=$(date +%Y%m%d%H%M)
cp -a /etc/mysql/my.cnf /etc/mysql/my.cnf.bak.$STAMP 2>/dev/null || true
cp -a /etc/mysql/mariadb.cnf /etc/mysql/mariadb.cnf.bak.$STAMP 2>/dev/null || true
ok "Backups créés (.bak.$STAMP)"

# ══════════════════════════════════════════════════════════════
header "Phase 2 — /etc/mysql/my.cnf → MySQL 5.7 client"
# ══════════════════════════════════════════════════════════════

# Supprimer le symlink si c'en est un
rm -f /etc/mysql/my.cnf

cat > /etc/mysql/my.cnf <<'EOF'
# MySQL 5.7 client configuration
# Server config: /etc/mysql57.cnf
# MariaDB config: /etc/mysql/mariadb.cnf

[client]
port = 3306
socket = /var/run/mysqld/mysqld57.sock

[mysql]
default-character-set = utf8mb4
EOF

ok "/etc/mysql/my.cnf → MySQL 5.7 client (port 3306, socket mysqld57)"
cat /etc/mysql/my.cnf | sed 's/^/    /'

# ══════════════════════════════════════════════════════════════
header "Phase 3 — /etc/mysql/mariadb.cnf → MariaDB"
# ══════════════════════════════════════════════════════════════

cat > /etc/mysql/mariadb.cnf <<'EOF'
# MariaDB configuration
# Séparé de MySQL 5.7 (/etc/mysql57.cnf)

[client-server]
port = 3307
socket = /run/mariadb/mariadb.sock

# MariaDB-specific config
!includedir /etc/mysql/mariadb.conf.d/
EOF

ok "/etc/mysql/mariadb.cnf → MariaDB (port 3307, socket mariadb)"
cat /etc/mysql/mariadb.cnf | sed 's/^/    /'

# ══════════════════════════════════════════════════════════════
header "Phase 4 — Vérifier 50-server.cnf"
# ══════════════════════════════════════════════════════════════

SCONF="/etc/mysql/mariadb.conf.d/50-server.cnf"
info "Config serveur MariaDB:"
grep -E "^(port|datadir|pid-file|socket|bind)" "$SCONF" | sed 's/^/    /'

# ══════════════════════════════════════════════════════════════
header "Phase 5 — Mettre à jour le service systemd MariaDB"
# ══════════════════════════════════════════════════════════════

# MariaDB doit lire mariadb.cnf, pas my.cnf
# Vérifier si le service unit utilise --defaults-file
MARIA_UNIT=$(systemctl show mariadb -p FragmentPath --value 2>/dev/null || echo "")
if [ -n "$MARIA_UNIT" ] && [ -f "$MARIA_UNIT" ]; then
    info "Service unit: $MARIA_UNIT"
    if grep -q "defaults-file" "$MARIA_UNIT"; then
        info "Service utilise déjà --defaults-file"
    else
        info "Service utilise la config par défaut"
    fi
fi

# Créer un override pour que MariaDB utilise mariadb.cnf
mkdir -p /etc/systemd/system/mariadb.service.d
cat > /etc/systemd/system/mariadb.service.d/config.conf <<'EOF'
[Service]
# Force MariaDB à lire sa propre config, pas /etc/mysql/my.cnf
ExecStart=
ExecStart=/usr/sbin/mariadbd --defaults-file=/etc/mysql/mariadb.cnf $MYSQLD_OPTS
EOF

systemctl daemon-reload
ok "Service MariaDB override → --defaults-file=/etc/mysql/mariadb.cnf"

# ══════════════════════════════════════════════════════════════
header "Phase 6 — Redémarrer les services"
# ══════════════════════════════════════════════════════════════

# Arrêter tout
systemctl stop mariadb 2>/dev/null || true
killall mysqld 2>/dev/null || true
sleep 2

# Démarrer MySQL 5.7
info "Démarrage MySQL 5.7..."
/usr/local/mysql/bin/mysqld --defaults-file=/etc/mysql57.cnf --user=mysql --daemonize --pid-file=/var/run/mysqld/mysqld57.pid
sleep 3
if [ -f /var/run/mysqld/mysqld57.pid ] && kill -0 $(cat /var/run/mysqld/mysqld57.pid) 2>/dev/null; then
    ok "MySQL 5.7 démarré (port 3306)"
else
    echo "  ERREUR MySQL 5.7"
    tail -10 /var/log/mysql/error57.log 2>/dev/null
fi

# Démarrer MariaDB
info "Démarrage MariaDB..."
mkdir -p /run/mariadb
chown mysql:mysql /run/mariadb
systemctl start mariadb
sleep 2
if systemctl is-active --quiet mariadb; then
    ok "MariaDB démarrée (port 3307)"
else
    echo "  ERREUR MariaDB"
    journalctl -u mariadb --no-pager -n 10
fi

# ══════════════════════════════════════════════════════════════
header "Phase 7 — Créer devuser sur MariaDB"
# ══════════════════════════════════════════════════════════════

MARIA_SOCK="/run/mariadb/mariadb.sock"
if [ -S "$MARIA_SOCK" ]; then
    mysql -S "$MARIA_SOCK" -u root <<'SQL' 2>/dev/null || true
CREATE USER IF NOT EXISTS 'devuser'@'localhost' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'localhost' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'devuser'@'127.0.0.1' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE IF NOT EXISTS testormdb;
FLUSH PRIVILEGES;
SQL
    ok "devuser + testormdb sur MariaDB"
else
    # Chercher le socket
    FOUND=$(find /run /var/run -name '*.sock' 2>/dev/null | grep -i maria || true)
    echo "  Socket $MARIA_SOCK absent. Trouvé: $FOUND"
fi

# ══════════════════════════════════════════════════════════════
header "Phase 8 — Test final"
# ══════════════════════════════════════════════════════════════

echo -e "  ${BOLD}Ports:${NC}"
for port in 3306 3307; do
    pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        proc=$(ps -p "$pid" -o comm= 2>/dev/null)
        ok "Port $port: $proc (PID $pid)"
    else
        echo "  ✘ Port $port: rien"
    fi
done

echo ""
echo -e "  ${BOLD}Sockets:${NC}"
ls -la /var/run/mysqld/mysqld57.sock 2>/dev/null && ok "MySQL 5.7 socket OK" || echo "  ✘ mysqld57.sock absent"
ls -la /run/mariadb/mariadb.sock 2>/dev/null && ok "MariaDB socket OK" || echo "  ✘ mariadb.sock absent"

echo ""
echo -e "  ${BOLD}Connexions TCP:${NC}"
/usr/local/mysql/bin/mysql -h 127.0.0.1 -P 3306 -u devuser -pdevpass26 -e "SELECT VERSION() AS v, 'MySQL 5.7' AS engine;" 2>/dev/null && ok "MySQL 5.7 TCP OK" || echo "  ✘ MySQL 5.7 TCP FAILED"
mysql -h 127.0.0.1 -P 3307 -u devuser -pdevpass26 -e "SELECT VERSION() AS v, 'MariaDB' AS engine;" 2>/dev/null && ok "MariaDB TCP OK" || echo "  ✘ MariaDB TCP FAILED"

header "Résumé"
echo "  MySQL 5.7 : 127.0.0.1:3306  config=/etc/mysql57.cnf        socket=/var/run/mysqld/mysqld57.sock"
echo "  MariaDB   : 127.0.0.1:3307  config=/etc/mysql/mariadb.cnf   socket=/run/mariadb/mariadb.sock"
echo "  Client my.cnf → MySQL 5.7 par défaut"
echo "  Client MariaDB: mysql -S /run/mariadb/mariadb.sock"

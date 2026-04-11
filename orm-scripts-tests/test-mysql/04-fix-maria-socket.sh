#!/bin/bash
# Reconfigurer MariaDB socket → /run/mariadb/mariadb.sock

set -euo pipefail

echo "1. Arrêt MariaDB..."
systemctl stop mariadb

echo "2. Créer /run/mariadb..."
mkdir -p /run/mariadb
chown mysql:mysql /run/mariadb

echo "3. Mettre à jour 50-server.cnf..."
CONF="/etc/mysql/mariadb.conf.d/50-server.cnf"
sed -i 's|^socket.*|socket = /run/mariadb/mariadb.sock|' "$CONF"
sed -i 's|^pid-file.*|pid-file = /run/mariadb/mariadb.pid|' "$CONF"

echo "4. Mettre à jour /etc/mysql/my.cnf..."
sed -i 's|socket.*=.*/run/mysqld.*|socket = /run/mariadb/mariadb.sock|' /etc/mysql/my.cnf

echo "5. Tmpfiles (persist après reboot)..."
cat > /etc/tmpfiles.d/mariadb.conf <<EOF
d /run/mariadb 0755 mysql mysql -
EOF
systemd-tmpfiles --create 2>/dev/null || true

echo "6. Démarrer MariaDB..."
systemctl start mariadb
sleep 2

echo "7. Vérification..."
ls -la /run/mariadb/
echo "---"

# Créer devuser
mysql -S /run/mariadb/mariadb.sock -u root <<'SQL'
CREATE USER IF NOT EXISTS 'devuser'@'localhost' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'localhost' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS 'devuser'@'127.0.0.1' IDENTIFIED BY 'devpass26';
GRANT ALL PRIVILEGES ON *.* TO 'devuser'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE IF NOT EXISTS testormdb;
FLUSH PRIVILEGES;
SQL
echo "devuser créé"

echo "8. Test TCP..."
mysql -h 127.0.0.1 -P 3307 -u devuser -pdevpass26 -e "SELECT VERSION() AS v, 'MariaDB OK' AS status;"

echo "Done."

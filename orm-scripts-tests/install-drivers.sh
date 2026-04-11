#!/bin/bash
# Installe les drivers SQL nécessaires pour les tests ORM sur tous les SGBD
# Les drivers sont installés en devDependencies pour ne pas alourdir la production
cd "$(dirname "$0")/.."

echo "Installation des drivers SQL pour les tests ORM..."
echo ""

# PostgreSQL
echo "▶ pg (PostgreSQL)..."
npm install --save-dev pg --legacy-peer-deps 2>&1 | tail -1

# MySQL / MariaDB (mysql2 supporte les deux)
echo "▶ mysql2 (MySQL + MariaDB)..."
npm install --save-dev mysql2 --legacy-peer-deps 2>&1 | tail -1

# MariaDB (native driver)
echo "▶ mariadb (MariaDB natif)..."
npm install --save-dev mariadb --legacy-peer-deps 2>&1 | tail -1

# Oracle (oracledb)
echo "▶ oracledb (Oracle)..."
npm install --save-dev oracledb --legacy-peer-deps 2>&1 | tail -1

echo ""
echo "✔ Drivers installés. Vous pouvez maintenant lancer les tests :"
echo "  bash orm-scripts-tests/run-all.sh"

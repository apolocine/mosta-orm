#!/bin/bash
# Test ORM + Setup sur MariaDB
cd "$(dirname "$0")/.."
npx tsx orm-scripts-tests/test-sgbd.ts mariadb

#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet IDialect — MariaDB
# Requires: MariaDB on localhost:3306 (SSH tunnel from amia.fr)
# User: devuser / devpass26
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"
MARIA_URI="${MARIA_URI:-mariadb://devuser:devpass26@[::1]:3306/test_full_orm}"
bash tests-scripts/test-full-dialect.sh mariadb "$MARIA_URI"

#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet IDialect — Oracle XE
# Requires: Oracle on localhost:1521 (SSH tunnel from amia.fr)
# User: devuser / devpass26 sur XEPDB1
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"
ORACLE_URI="${ORACLE_URI:-oracle://devuser:devpass26@localhost:1521/XEPDB1}"
bash test-scripts/test-full-dialect.sh oracle "$ORACLE_URI"

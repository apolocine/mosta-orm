#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet IDialect — PostgreSQL
# Requires: PostgreSQL on localhost:5432 (SSH tunnel from amia.fr)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"
PG_URI="${PG_URI:-postgresql://devuser:devpass26@localhost:5432/test_full_orm}"
bash test-scripts/test-full-dialect.sh postgres "$PG_URI"

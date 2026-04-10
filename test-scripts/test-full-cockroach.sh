#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet IDialect — CockroachDB
# Requires: CockroachDB on localhost:26257 (SSH tunnel from amia.fr)
# User: devuser / devpass26
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"
CRDB_URI="${CRDB_URI:-postgresql://devuser:devpass26@localhost:26257/test_full_orm?sslmode=disable}"
bash tests-scripts/test-full-dialect.sh cockroachdb "$CRDB_URI"

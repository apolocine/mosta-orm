#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test: Discriminator _type + soft-delete on PostgreSQL
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/_runner.sh"

PG_URI="${PG_URI:-postgresql://devuser:devpass26@localhost:5432/secuaccessdb}"

header "PostgreSQL"
cd "$ORM_DIR"
run_test "postgres" "$PG_URI"

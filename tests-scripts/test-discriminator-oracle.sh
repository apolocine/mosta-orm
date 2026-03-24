#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test: Discriminator _type + soft-delete on Oracle
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/_runner.sh"

ORACLE_URI="${ORACLE_URI:-oracle://devuser:devpass26@localhost:1521/XEPDB1}"

header "Oracle"
cd "$ORM_DIR"
run_test "oracle" "$ORACLE_URI"

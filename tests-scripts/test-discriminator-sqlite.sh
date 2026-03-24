#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test: Discriminator _type + soft-delete on SQLite
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/_runner.sh"

DB_FILE=$(mktemp /tmp/test-discrim-XXXXXX.db)
trap "rm -f $DB_FILE" EXIT

header "SQLite"
cd "$ORM_DIR"
run_test "sqlite" "$DB_FILE"

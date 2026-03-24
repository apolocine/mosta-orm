#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test: Discriminator _type + soft-delete on MongoDB
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/_runner.sh"

MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/test_discriminator_orm}"

header "MongoDB"
cd "$ORM_DIR"
run_test "mongodb" "$MONGO_URI"

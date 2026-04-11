#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet IDialect — MongoDB
# Requires: MongoDB on localhost:27017 (SSH tunnel from amia.fr)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/test_full_orm}"
bash test-scripts/test-full-dialect.sh mongodb "$MONGO_URI"

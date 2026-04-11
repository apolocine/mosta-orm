#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet IDialect — SQLite
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"
bash test-scripts/test-full-dialect.sh sqlite ":memory:"

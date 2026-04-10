#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Test complet IDialect — SQL Server
# Requires: MSSQL on localhost:1433 (SSH tunnel from amia.fr)
# User: devuser / Devpass@26
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"
MSSQL_URI="${MSSQL_URI:-Server=localhost,1433;Database=test_full_orm;User Id=devuser;Password=Devpass@26;TrustServerCertificate=true;Encrypt=false}"
bash tests-scripts/test-full-dialect.sh mssql "$MSSQL_URI"

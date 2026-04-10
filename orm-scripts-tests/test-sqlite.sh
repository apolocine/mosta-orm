#!/bin/bash
# Test ORM + Setup sur SQLite
cd "$(dirname "$0")/.."
rm -f data/test-orm.db
npx tsx orm-scripts-tests/test-sgbd.ts sqlite

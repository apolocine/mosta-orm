#!/bin/bash
# Test ORM + Setup sur MySQL
cd "$(dirname "$0")/.."
npx tsx orm-scripts-tests/test-sgbd.ts mysql

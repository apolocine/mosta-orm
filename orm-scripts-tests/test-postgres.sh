#!/bin/bash
# Test ORM + Setup sur PostgreSQL
cd "$(dirname "$0")/.."
npx tsx orm-scripts-tests/test-sgbd.ts postgres

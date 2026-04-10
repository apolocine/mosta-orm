#!/bin/bash
# Test ORM + Setup sur MongoDB
cd "$(dirname "$0")/.."
npx tsx orm-scripts-tests/test-sgbd.ts mongodb

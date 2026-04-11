#!/bin/bash
# Test ORM + Setup sur Oracle XE 21c
cd "$(dirname "$0")/.."
npx tsx orm-scripts-tests/test-sgbd.ts oracle

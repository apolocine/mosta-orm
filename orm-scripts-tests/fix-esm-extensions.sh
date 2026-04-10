#!/bin/bash
# Author: Dr Hamid MADANI drmdh@msn.com
# Fix ESM imports in @mostajs/setup — ajoute .js aux imports relatifs
# Cree un backup avant modification pour rollback facile
#
# Usage:
#   ./fix-esm-extensions.sh          # applique le fix
#   ./fix-esm-extensions.sh --check  # dry-run (montre les changements sans modifier)
#   ./fix-esm-extensions.sh --rollback  # restaure depuis le backup
#
# Apres fix: npm run build && tester

set -euo pipefail

SETUP_DIR="$(cd "$(dirname "$0")/../../mostajs/mosta-setup" && pwd)"
BACKUP_DIR="$SETUP_DIR/.esm-fix-backup"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

MODE="${1:-apply}"

# ── Rollback ──────────────────────────────────────────────

if [ "$MODE" = "--rollback" ]; then
  if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Pas de backup trouve dans $BACKUP_DIR${NC}"
    exit 1
  fi
  echo -e "${CYAN}Rollback depuis $BACKUP_DIR ...${NC}"
  cp -r "$BACKUP_DIR"/* "$SETUP_DIR/"
  rm -rf "$BACKUP_DIR"
  echo -e "${GREEN}Rollback termine. Fichiers originaux restaures.${NC}"
  exit 0
fi

# ── Collect files to fix ──────────────────────────────────

FILES=()
for f in "$SETUP_DIR"/index.ts \
         "$SETUP_DIR"/register.ts \
         "$SETUP_DIR"/lib/*.ts \
         "$SETUP_DIR"/api/*.ts \
         "$SETUP_DIR"/data/*.ts \
         "$SETUP_DIR"/types/*.ts; do
  [ -f "$f" ] && FILES+=("$f")
done

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Fix ESM extensions — @mostajs/setup${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Repertoire: $SETUP_DIR"
echo "  Fichiers:   ${#FILES[@]}"
echo ""

# ── Check mode (dry-run) ─────────────────────────────────

if [ "$MODE" = "--check" ]; then
  echo -e "${YELLOW}  Mode dry-run — aucune modification${NC}"
  echo ""
  TOTAL=0
  for f in "${FILES[@]}"; do
    REL="${f#$SETUP_DIR/}"
    # Find relative imports without .js
    MATCHES=$(grep -nE "from '\.\.?/[^']+'" "$f" | grep -v "\.js'" | grep -v "\.tsx'" || true)
    if [ -n "$MATCHES" ]; then
      echo -e "  ${CYAN}$REL:${NC}"
      echo "$MATCHES" | while read -r line; do
        echo "    $line"
        TOTAL=$((TOTAL+1))
      done
    fi
  done
  echo ""
  echo -e "  Imports a fixer: recherchez les lignes ci-dessus"
  exit 0
fi

# ── Apply mode ────────────────────────────────────────────

# Create backup
if [ -d "$BACKUP_DIR" ]; then
  echo -e "${YELLOW}  Backup existant supprime${NC}"
  rm -rf "$BACKUP_DIR"
fi
mkdir -p "$BACKUP_DIR"

# Backup each file preserving directory structure
for f in "${FILES[@]}"; do
  REL="${f#$SETUP_DIR/}"
  DIR=$(dirname "$REL")
  mkdir -p "$BACKUP_DIR/$DIR"
  cp "$f" "$BACKUP_DIR/$REL"
done
echo -e "  ${GREEN}Backup cree: $BACKUP_DIR${NC}"

# Apply fix: add .js to relative imports
FIXED=0
for f in "${FILES[@]}"; do
  REL="${f#$SETUP_DIR/}"
  BEFORE=$(cat "$f")

  # Pattern: from './something' or from '../something'
  # But NOT if already ends with .js or .jsx or .tsx or .json
  # Strategy: match from '.<path>' where path doesn't end with known extension
  python3 << PYEOF
import re

with open('$f', 'r') as fh:
    content = fh.read()

def add_js(match):
    path = match.group(1)
    if re.search(r'\.(js|jsx|ts|tsx|json|css)$', path):
        return match.group(0)
    return "from '" + path + ".js'"

result = re.sub(r"from '(\.\./[^']+)'", add_js, content)
result = re.sub(r"from '(\./[^']+)'", add_js, result)

with open('$f', 'w') as fh:
    fh.write(result)

count = len(re.findall(r"from '\.\./.*\.js'", result)) + len(re.findall(r"from '\./.*\.js'", result))
print('  $REL: ' + str(count) + ' imports with .js')
PYEOF
  AFTER=$(cat "$f")
  if [ "$BEFORE" != "$AFTER" ]; then
    FIXED=$((FIXED+1))
  fi
done

echo ""
echo -e "  ${GREEN}$FIXED fichiers modifies${NC}"
echo ""

# ── Verify build ──────────────────────────────────────────

echo -e "  ${CYAN}Build...${NC}"
cd "$SETUP_DIR"
if npm run build 2>&1 | tail -5; then
  echo ""
  echo -e "  ${GREEN}Build OK${NC}"
else
  echo ""
  echo -e "${RED}  Build ECHOUE — rollback automatique${NC}"
  cp -r "$BACKUP_DIR"/* "$SETUP_DIR/"
  rm -rf "$BACKUP_DIR"
  echo -e "${GREEN}  Rollback effectue${NC}"
  exit 1
fi

# ── Verify dist has .js extensions ────────────────────────

echo ""
echo -e "  ${CYAN}Verification dist...${NC}"
BAD=$(grep -rn "from '\.\." "$SETUP_DIR/dist/" --include="*.js" | grep -v "\.js'" || true)
if [ -n "$BAD" ]; then
  echo -e "  ${RED}ERREUR: imports sans .js dans dist/:${NC}"
  echo "$BAD" | head -5
  echo ""
  echo -e "  ${YELLOW}Rollback: ./fix-esm-extensions.sh --rollback${NC}"
  exit 1
else
  echo -e "  ${GREEN}Tous les imports dans dist/ ont .js${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Fix applique avec succes${NC}"
echo -e "${GREEN}  Rollback: $0 --rollback${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

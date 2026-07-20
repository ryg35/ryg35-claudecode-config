#!/bin/bash
# PreToolUse hook: Inspect staged files for safety before commit-push
# Block with exit 2 + stderr if dangerous files are detected
#
# Detection targets:
#   1. Sensitive information (.env, private keys, tokens, credentials, etc.)
#   2. Oversized files (over 5MB)
#   3. Cache, build artifacts, and unnecessary files

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

if [ "$TOOL_NAME" != "Skill" ] || [ "$SKILL_NAME" != "commit-push" ]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -z "$CWD" ] || [ ! -d "$CWD/.git" ]; then
  exit 0
fi

cd "$CWD" || exit 0

# Get the list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
if [ -z "$STAGED_FILES" ]; then
  # If staging is empty, also check untracked new files
  STAGED_FILES=$(git status --porcelain 2>/dev/null | awk '{print $2}')
fi

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

VIOLATIONS=""

# --- 1. Detect sensitive information ---
SECRET_PATTERNS=(
  '\.env$'
  '\.env\.'
  '\.pem$'
  '\.key$'
  '\.p12$'
  '\.pfx$'
  '\.jks$'
  '\.keystore$'
  'id_rsa'
  'id_ed25519'
  'id_ecdsa'
  'id_dsa'
  '\.ssh/'
  'secret'
  'credential'
  'token\.json$'
  'service.account\.json$'
  'gcloud.*\.json$'
  '\.aws/'
  '\.kube/'
  'kubeconfig'
  '\.npmrc$'
  '\.pypirc$'
  '\.netrc$'
  '\.htpasswd$'
)

for file in $STAGED_FILES; do
  fname=$(basename "$file" | tr '[:upper:]' '[:lower:]')
  fpath=$(echo "$file" | tr '[:upper:]' '[:lower:]')
  for pattern in "${SECRET_PATTERNS[@]}"; do
    if echo "$fpath" | grep -qiE "$pattern"; then
      VIOLATIONS="${VIOLATIONS}  [SECRET] $file (pattern: $pattern)\n"
      break
    fi
  done
done

# --- 2. Detect oversized files (over 50MB) ---
# GitHub: warns at 50MB, rejects push at 100MB
SIZE_LIMIT=$((50 * 1024 * 1024))

for file in $STAGED_FILES; do
  if [ -f "$CWD/$file" ]; then
    FILE_SIZE=$(stat -f%z "$CWD/$file" 2>/dev/null || stat -c%s "$CWD/$file" 2>/dev/null || echo 0)
    if [ "$FILE_SIZE" -gt "$SIZE_LIMIT" ] 2>/dev/null; then
      SIZE_MB=$(echo "scale=1; $FILE_SIZE / 1048576" | bc 2>/dev/null || echo "?")
      VIOLATIONS="${VIOLATIONS}  [LARGE] $file (${SIZE_MB}MB > 50MB)\n"
    fi
  fi
done

# --- 3. Detect cache, build artifacts, and unnecessary files ---
JUNK_PATTERNS=(
  '^node_modules/'
  '^\.next/'
  '^__pycache__/'
  '\.pyc$'
  '^\.cache/'
  '^\.turbo/'
  '^\.nuxt/'
  '^dist/'
  '^build/'
  '^out/'
  '^\.parcel-cache/'
  '\.DS_Store$'
  'Thumbs\.db$'
  'desktop\.ini$'
  '\.log$'
  '^\.vscode/'
  '^\.idea/'
  '\.swp$'
  '\.swo$'
  '~$'
  '^vendor/'
  '^\.gradle/'
  '^\.sass-cache/'
  'package-lock\.json$'
  'yarn\.lock$'
  'pnpm-lock\.yaml$'
)

for file in $STAGED_FILES; do
  for pattern in "${JUNK_PATTERNS[@]}"; do
    if echo "$file" | grep -qiE "$pattern"; then
      VIOLATIONS="${VIOLATIONS}  [JUNK] $file (pattern: $pattern)\n"
      break
    fi
  done
done

# --- Evaluate results ---
if [ -n "$VIOLATIONS" ]; then
  {
    echo ""
    echo "============================================"
    echo " commit-push safeguard: Dangerous files detected"
    echo "============================================"
    echo ""
    echo "The following files are included in the commit:"
    echo ""
    echo -e "$VIOLATIONS"
    echo ""
    echo "How to fix:"
    echo "  1. Add to .gitignore, then ASK THE USER to run: git rm --cached <file>  # git rm is deny-listed for agents"
    echo "  2. Remove from staging with git restore --staged <file>  # git reset is deny-listed for agents"
    echo "  3. After confirming there are no issues, run /commit-push again"
    echo ""
    echo "* To pass this check, remove the above files from the commit."
    echo "============================================"
  } >&2
  exit 2
fi

exit 0

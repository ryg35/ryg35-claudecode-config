#!/usr/bin/env bash
# log-review.sh: append a single review run as one line of JSONL
#
# Usage:
#   log-review.sh <skill> <target> [note]
#
# Examples:
#   log-review.sh pre-pr-review "PR#1185"
#   log-review.sh review-prs "branch:feature-auth" "auth check still pending"
#
# Output: ~/.claude/memory/review-log.jsonl
# One line = one review run (timestamp + skill + target + cwd + note)

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: log-review.sh <skill> <target> [note]" >&2
  echo "  example: log-review.sh pre-pr-review PR#1185 'auth check needed'" >&2
  exit 2
fi

SKILL="$1"
TARGET="$2"
NOTE="${3:-}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CWD="$(pwd)"
LOG="$HOME/.claude/memory/review-log.jsonl"

mkdir -p "$(dirname "$LOG")"

# JSON-escape backslash and double-quote
escape_json() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

SKILL_E="$(escape_json "$SKILL")"
TARGET_E="$(escape_json "$TARGET")"
CWD_E="$(escape_json "$CWD")"
NOTE_E="$(escape_json "$NOTE")"

# Atomic append (a single POSIX write is atomic at the kernel level)
printf '{"ts":"%s","skill":"%s","target":"%s","cwd":"%s","note":"%s"}\n' \
  "$TS" "$SKILL_E" "$TARGET_E" "$CWD_E" "$NOTE_E" >> "$LOG"

echo "logged: $SKILL $TARGET ($TS)"

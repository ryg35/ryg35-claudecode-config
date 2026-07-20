#!/bin/bash
# Background watcher: poll git diff and display in __claude-diff__ tab
# Detects file changes NOT made by Claude Code's Edit/Write tools (e.g. Codex)
# Uses a lock file to avoid stomping on PostToolUse diff display.
#
# Usage: git-diff-watcher.sh <repo-dir>
# Runs until the PID file is removed or the process is killed.

set -euo pipefail

REPO_DIR="${1:-.}"
POLL_INTERVAL=2  # seconds
LOCK_FILE="/tmp/.claude-diff-lock"
LOCK_GRACE=3     # seconds after lock to wait before showing git diff
PID_FILE="/tmp/.git-diff-watcher.pid"
DIFF_TAB_NAME="__claude-diff__"
LAST_HASH=""

# Write PID so SessionEnd or other scripts can kill us
echo $$ > "$PID_FILE"

cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT

# Find the __claude-diff__ surface by scanning all panes
find_diff_surface() {
  for pane in $(cmux list-panes 2>/dev/null | grep -o 'pane:[0-9]*'); do
    while IFS= read -r line; do
      if echo "$line" | grep -q "$DIFF_TAB_NAME"; then
        echo "$line" | grep -o 'surface:[0-9]*'
        return 0
      fi
    done <<< "$(cmux list-pane-surfaces --pane "$pane" 2>/dev/null)"
  done
  return 1
}

# ANSI color codes
RED='\033[31m'
GREEN='\033[32m'
CYAN='\033[36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

while true; do
  sleep "$POLL_INTERVAL"

  # Exit if PID file was removed (signal to stop)
  [ ! -f "$PID_FILE" ] && exit 0

  # Skip if not in a git repo
  if ! git -C "$REPO_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
    continue
  fi

  # Get current diff hash (staged + unstaged)
  CURRENT_HASH=$(git -C "$REPO_DIR" diff HEAD --stat 2>/dev/null | md5 -q 2>/dev/null || echo "")

  # No change since last check
  [ "$CURRENT_HASH" = "$LAST_HASH" ] && continue

  # Skip if PostToolUse is currently showing a diff (lock file exists and is recent)
  if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0) ))
    if [ "$LOCK_AGE" -lt "$LOCK_GRACE" ]; then
      # Update hash so we don't re-trigger for the same Claude Code edit
      LAST_HASH="$CURRENT_HASH"
      continue
    fi
    rm -f "$LOCK_FILE"
  fi

  LAST_HASH="$CURRENT_HASH"

  # Empty hash means no diff (clean working tree)
  if [ -z "$CURRENT_HASH" ] || [ "$(git -C "$REPO_DIR" diff HEAD --stat 2>/dev/null | wc -l)" -eq 0 ]; then
    continue
  fi

  # Find the diff surface
  SURFACE=$(find_diff_surface)
  if [ -z "$SURFACE" ]; then
    continue
  fi

  # Generate colored diff output to a temp file
  DIFF_FILE=$(mktemp /tmp/claude-gitdiff-XXXXXX)
  {
    echo -e "${BOLD}${CYAN}━━━ Git Diff (external change detected) ━━━${RESET}"
    echo -e "${DIM}$(date '+%H:%M:%S') — ${REPO_DIR}${RESET}"
    echo ""
    git -C "$REPO_DIR" diff HEAD --color --stat 2>/dev/null
    echo ""
    git -C "$REPO_DIR" diff HEAD --color 2>/dev/null | head -200
    TOTAL_LINES=$(git -C "$REPO_DIR" diff HEAD 2>/dev/null | wc -l)
    if [ "$TOTAL_LINES" -gt 200 ]; then
      echo -e "${DIM}... ($((TOTAL_LINES - 200)) more lines, run 'git diff' for full output)${RESET}"
    fi
  } > "$DIFF_FILE" 2>/dev/null

  # Send to the diff tab
  cmux send --surface "$SURFACE" $'\x03' 2>/dev/null
  sleep 0.15
  cmux send --surface "$SURFACE" "clear && cat '$DIFF_FILE' && rm -f '$DIFF_FILE'" 2>/dev/null
  cmux send-key --surface "$SURFACE" enter 2>/dev/null
done

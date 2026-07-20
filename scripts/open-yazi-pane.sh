#!/bin/bash
# Claude Code SessionStart hook: create 3-pane layout in cmux
# Layout: Left=Claude Code | Top-Right=Diff(__claude-diff__) | Bottom-Right=Yazi
# Also starts the git-diff-watcher for detecting Codex/external changes.
# Only runs inside cmux, skips if already split.

# Check if running inside cmux
if [ -z "$CMUX_SURFACE_ID" ]; then
  exit 0
fi

# Check if already split
pane_count=$(cmux list-panes 2>/dev/null | grep -c "pane:")
if [ "$pane_count" -ge 2 ]; then
  # Already split — just make sure watcher is running
  if [ ! -f /tmp/.git-diff-watcher.pid ] || ! kill -0 "$(cat /tmp/.git-diff-watcher.pid 2>/dev/null)" 2>/dev/null; then
    CWD_CHECK=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd', ''))" 2>/dev/null < /dev/stdin || echo "$PWD")
    [ -z "$CWD_CHECK" ] && CWD_CHECK="$PWD"
    nohup ~/.claude/scripts/git-diff-watcher.sh "$CWD_CHECK" &>/dev/null &
  fi
  exit 0
fi

# Read CWD from stdin (SessionStart sends JSON)
CWD=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd', ''))" 2>/dev/null || echo "")
if [ -z "$CWD" ]; then
  CWD="$PWD"
fi

DIFF_TAB_NAME="__claude-diff__"

# Create right split (top-right: diff pane)
RESULT1=$(cmux new-split right 2>&1)
DIFF_SURFACE=$(echo "$RESULT1" | grep -o 'surface:[0-9]*')
sleep 0.4

# Split the right pane down (bottom-right: yazi pane)
if [ -n "$DIFF_SURFACE" ]; then
  RESULT2=$(cmux new-split down --surface "$DIFF_SURFACE" 2>&1)
  YAZI_SURFACE=$(echo "$RESULT2" | grep -o 'surface:[0-9]*')
  sleep 0.4

  # Rename diff surface so PostToolUse and watcher can find it by name
  cmux rename-tab --surface "$DIFF_SURFACE" "$DIFF_TAB_NAME" 2>/dev/null

  # Show welcome message in diff pane
  cmux send --surface "$DIFF_SURFACE" "clear && echo -e '\033[2m  Edit/Write diffs will be displayed here\n  External changes (Codex, etc.) are also auto-detected\033[0m'" 2>/dev/null
  cmux send-key --surface "$DIFF_SURFACE" enter 2>/dev/null

  # Launch yazi in bottom-right
  if [ -n "$YAZI_SURFACE" ]; then
    cmux send --surface "$YAZI_SURFACE" "cd '$CWD' && yazi" 2>/dev/null
    cmux send-key --surface "$YAZI_SURFACE" enter 2>/dev/null
  fi
fi

# Start git-diff-watcher in background
# Kill any existing watcher first
if [ -f /tmp/.git-diff-watcher.pid ]; then
  kill "$(cat /tmp/.git-diff-watcher.pid)" 2>/dev/null
  rm -f /tmp/.git-diff-watcher.pid
fi
nohup ~/.claude/scripts/git-diff-watcher.sh "$CWD" &>/dev/null &

exit 0

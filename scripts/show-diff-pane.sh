#!/bin/bash
# PostToolUse hook: show edit diff in the __claude-diff__ tab
# and navigate yazi to the edited file's directory.
#
# The diff tab is identified by name "__claude-diff__" across ALL panes,
# so it never accidentally sends to Codex or other terminal tabs.
#
# Creates a lock file so the git-diff-watcher doesn't overwrite this diff.
# Only runs inside cmux. Does nothing in other environments.

# Skip if not in cmux
if [ -z "$CMUX_SURFACE_ID" ]; then
  exit 0
fi

# Read JSON from stdin into temp file
INPUT_FILE=$(mktemp /tmp/claude-hook-input-XXXXXX.json)
cat > "$INPUT_FILE"

DIFF_FILE=$(mktemp /tmp/claude-diff-XXXXXX)

# Generate colorized diff and extract file path
python3 ~/.claude/scripts/generate-diff.py "$INPUT_FILE" "$DIFF_FILE" 2>/dev/null

# Extract file_path for yazi navigation
FILE_PATH=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('tool_input',{}).get('file_path',''))" "$INPUT_FILE" 2>/dev/null)

rm -f "$INPUT_FILE"

if [ ! -s "$DIFF_FILE" ]; then
  rm -f "$DIFF_FILE"
  exit 0
fi

# --- Constants ---
DIFF_TAB_NAME="__claude-diff__"
LOCK_FILE="/tmp/.claude-diff-lock"

# --- Create lock file to suppress git-diff-watcher ---
touch "$LOCK_FILE"

# --- Find __claude-diff__ tab across all panes ---
DIFF_SURFACE=""
for pane in $(cmux list-panes 2>/dev/null | grep -o 'pane:[0-9]*'); do
  while IFS= read -r line; do
    if echo "$line" | grep -q "$DIFF_TAB_NAME"; then
      DIFF_SURFACE=$(echo "$line" | grep -o 'surface:[0-9]*')
      break 2
    fi
  done <<< "$(cmux list-pane-surfaces --pane "$pane" 2>/dev/null)"
done

# If not found, create in caller's pane
if [ -z "$DIFF_SURFACE" ]; then
  CALLER_PANE=$(cmux identify 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('caller',{}).get('pane_ref',''))" 2>/dev/null)
  if [ -n "$CALLER_PANE" ]; then
    RESULT=$(cmux new-surface --pane "$CALLER_PANE" 2>&1)
    DIFF_SURFACE=$(echo "$RESULT" | grep -o 'surface:[0-9]*')
    if [ -n "$DIFF_SURFACE" ]; then
      sleep 0.3
      cmux rename-tab --surface "$DIFF_SURFACE" "$DIFF_TAB_NAME" 2>/dev/null
    fi
  fi
fi

if [ -z "$DIFF_SURFACE" ]; then
  rm -f "$DIFF_FILE"
  rm -f "$LOCK_FILE"
  exit 0
fi

# --- Show diff in the dedicated tab ---
cmux send --surface "$DIFF_SURFACE" $'\x03' 2>/dev/null
sleep 0.15
cmux send --surface "$DIFF_SURFACE" "clear && cat '$DIFF_FILE' && rm -f '$DIFF_FILE'" 2>/dev/null
cmux send-key --surface "$DIFF_SURFACE" enter 2>/dev/null

# --- Navigate yazi to the edited file ---
YAZI_SURFACE=""
for pane in $(cmux list-panes 2>/dev/null | grep -o 'pane:[0-9]*'); do
  while IFS= read -r line; do
    if echo "$line" | grep -q "Yazi:"; then
      YAZI_SURFACE=$(echo "$line" | grep -o 'surface:[0-9]*')
      break 2
    fi
  done <<< "$(cmux list-pane-surfaces --pane "$pane" 2>/dev/null)"
done

if [ -n "$YAZI_SURFACE" ] && [ -n "$FILE_PATH" ]; then
  # Use `ya emit reveal` for internal navigation without restarting yazi
  ya emit reveal "$FILE_PATH" 2>/dev/null
fi

exit 0

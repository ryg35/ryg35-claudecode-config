#!/bin/bash
# PostToolUse Hook: During the project-init flow, when both docs/ and .github/workflows/
# are present, provide feedback saying "Please run /commit-push".
#
# Conditions:
#   1. The Write tool was executed
#   2. project-context.json exists (during project-init flow)
#   3. initPhase in project-context.json is "in_progress"
#   4. Files exist under docs/
#   5. Files exist under .github/workflows/
#   6. CLAUDE.md exists
#
# exit 0: Non-blocking (feedback only)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Ignore tools other than Write
if [ "$TOOL_NAME" != "Write" ]; then
  exit 0
fi

# Estimate project root from the write destination path
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Get cwd (used as project root)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -z "$CWD" ]; then
  exit 0
fi

CONTEXT_FILE="$CWD/.claude/project-context.json"

# If project-context.json does not exist, we are outside the project-init flow
if [ ! -f "$CONTEXT_FILE" ]; then
  exit 0
fi

# Skip if initPhase is not in_progress
INIT_PHASE=$(jq -r '.initPhase // empty' "$CONTEXT_FILE" 2>/dev/null)
if [ "$INIT_PHASE" != "in_progress" ]; then
  exit 0
fi

# Check all conditions: docs/ + .github/workflows/ + CLAUDE.md are all present
HAS_DOCS=$(find "$CWD/docs" -type f -name "*.md" 2>/dev/null | head -1)
HAS_CI=$(find "$CWD/.github/workflows" -type f -name "*.yml" 2>/dev/null | head -1)
HAS_CLAUDE_MD=""
if [ -f "$CWD/CLAUDE.md" ]; then
  HAS_CLAUDE_MD="yes"
fi

if [ -n "$HAS_DOCS" ] && [ -n "$HAS_CI" ] && [ -n "$HAS_CLAUDE_MD" ]; then
  echo "project-init: All files generated. Please run /commit-push to make the initial commit." >&2
fi

exit 0

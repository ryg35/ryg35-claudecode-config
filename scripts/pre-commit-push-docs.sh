#!/bin/bash
# PreToolUse hook: Require /update-docs to run before commit-push skill execution
# exit 2 + stderr to block and return a feedback message
#
# Exception: Skip during the project-init flow
#   - When project-context.json exists and initPhase is "in_progress"
#   (For both new and existing projects, docs are already generated during project-init)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

# Only intervene when commit-push is called via the Skill tool
if [ "$TOOL_NAME" = "Skill" ] && [ "$SKILL_NAME" = "commit-push" ]; then

  # Get cwd
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

  # Check if we are in the project-init flow
  if [ -n "$CWD" ]; then
    CONTEXT_FILE="$CWD/.claude/project-context.json"
    if [ -f "$CONTEXT_FILE" ]; then
      INIT_PHASE=$(jq -r '.initPhase // empty' "$CONTEXT_FILE" 2>/dev/null)

      # Skip if in the project-init flow (initPhase is in_progress)
      if [ "$INIT_PHASE" = "in_progress" ]; then
        exit 0
      fi
    fi
  fi

  echo "Please run /update-docs before commit-push. After /update-docs completes, run /commit-push again." >&2
  exit 2
fi

exit 0

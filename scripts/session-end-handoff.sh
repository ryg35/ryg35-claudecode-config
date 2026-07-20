#!/usr/bin/env bash
# SessionEnd hook: surface the handoff file path so the user knows the next
# session will inherit it. Stays on stderr to avoid polluting tool output.
HANDOFF="$HOME/.claude/handoff/current.md"
if [ -f "$HANDOFF" ]; then
  echo "Session ended. Handoff saved at $HANDOFF (will be read on next SessionStart)." >&2
fi
exit 0

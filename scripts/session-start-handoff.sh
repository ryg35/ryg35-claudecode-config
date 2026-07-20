#!/usr/bin/env bash
# SessionStart hook: emit handoff/current.md as system-reminder so the new
# session inherits unfinished context from the previous one.
# Stateless: reads a single markdown file, no runtime dependency.
HANDOFF="$HOME/.claude/handoff/current.md"
if [ -f "$HANDOFF" ]; then
  echo "<system-reminder>"
  echo "Previous session handoff (~/.claude/handoff/current.md):"
  echo ""
  cat "$HANDOFF"
  echo ""
  echo "</system-reminder>"
fi
exit 0

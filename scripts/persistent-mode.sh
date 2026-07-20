#!/usr/bin/env bash
# Stop hook: ralph-mode persistence. While ~/.claude/handoff/.ralph-active
# exists, block Stop and tell the assistant to keep iterating the loop.
# When the flag is absent (default), do nothing.
FLAG="$HOME/.claude/handoff/.ralph-active"
if [ -f "$FLAG" ]; then
  # decision=block + exit 2 tells Claude Code to continue instead of stopping.
  printf '%s\n' '{"decision":"block","reason":"ralph mode active: continue the loop. Remove ~/.claude/handoff/.ralph-active to stop."}'
  exit 2
fi
exit 0

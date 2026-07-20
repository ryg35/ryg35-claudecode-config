#!/usr/bin/env bash
# Stop hook: periodic reminder to flush handoff/current.md.
# Hooks cannot observe context usage directly, so this fires every 50th Stop
# as a heartbeat to nudge the assistant to persist state.
COUNTER="$HOME/.claude/handoff/.stop-counter"
mkdir -p "$(dirname "$COUNTER")" 2>/dev/null || true
if [ ! -f "$COUNTER" ]; then
  echo 0 > "$COUNTER"
fi

N=$(cat "$COUNTER" 2>/dev/null || echo 0)
case "$N" in
  ''|*[!0-9]*) N=0 ;;
esac
N=$((N + 1))
echo "$N" > "$COUNTER"

if [ $((N % 50)) -eq 0 ]; then
  echo "<system-reminder>"
  echo "Heartbeat ($N stops). If this session has been long or context feels heavy,"
  echo "write a short status to ~/.claude/handoff/current.md before the next /compact."
  echo "</system-reminder>"
fi
exit 0

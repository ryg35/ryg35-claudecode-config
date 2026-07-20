#!/usr/bin/env bash
# Summarizes /tmp/claude-codex-jobs/*.meta + *.jsonl into a single statusline
# segment, e.g.:
#   codex 2m10s✓done | codex 0m42s turn3 apply_patch | +1 more
#
# Only jobs from codex-exec-bg.sh are read (see that script for the file
# format). Jobs older than JOB_TTL are ignored so a stale meta file left
# behind by a killed shell doesn't linger in the statusline forever.

set -uo pipefail

JOBS_DIR="/tmp/claude-codex-jobs"
MAX_SHOWN=3
JOB_TTL=$((6 * 3600)) # 6h; matches the 5h usage window shown elsewhere

# Same palette as statusline-command.sh so this segment matches the rest of
# the statusline instead of the low-contrast gray used for plain separators.
GREEN="\033[38;2;151;201;195m"
YELLOW="\033[38;2;229;192;123m"
RED="\033[38;2;224;108;117m"
GRAY="\033[38;2;74;88;92m"
RESET="\033[0m"

[ -d "$JOBS_DIR" ] || exit 0

now=$(date +%s)

# item.type -> short label for "what's it doing right now"
tool_label() {
  case "$1" in
    command_execution) printf 'shell' ;;
    file_change | patch_apply) printf 'apply_patch' ;;
    mcp_tool_call) printf 'mcp' ;;
    web_search) printf 'web' ;;
    "") printf '' ;;
    *) printf '%s' "$1" ;;
  esac
}

format_elapsed() {
  local secs=$1
  local m=$(( secs / 60 ))
  local s=$(( secs % 60 ))
  if (( m > 0 )); then
    printf '%dm%02ds' "$m" "$s"
  else
    printf '%ds' "$s"
  fi
}

# Collect (start_ts, meta_path) pairs, newest first.
entries=()
for meta in "$JOBS_DIR"/*.meta; do
  [ -e "$meta" ] || continue
  start_ts=$(grep -m1 '^start_ts=' "$meta" | cut -d= -f2)
  [ -z "$start_ts" ] && continue
  age=$(( now - start_ts ))
  (( age > JOB_TTL )) && continue
  entries+=("${start_ts}:${meta}")
done

[ "${#entries[@]}" -eq 0 ] && exit 0

IFS=$'\n' sorted=($(printf '%s\n' "${entries[@]}" | sort -t: -k1,1 -rn))
unset IFS

segments=()
count=0
for entry in "${sorted[@]}"; do
  meta="${entry#*:}"
  jsonl="${meta%.meta}.jsonl"

  status=$(grep -m1 '^status=' "$meta" | cut -d= -f2-)
  start_ts=$(grep -m1 '^start_ts=' "$meta" | cut -d= -f2-)
  end_ts=$(grep -m1 '^end_ts=' "$meta" | cut -d= -f2-)
  pid=$(grep -m1 '^pid=' "$meta" | cut -d= -f2-)

  # A meta file can be left at status=running if the wrapper's own process
  # was killed before it could write "done"/"error" (e.g. shell closed,
  # OOM). Detect that so the statusline doesn't show a job as running
  # forever.
  if [ "$status" = "running" ] && [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    status="stale"
  fi

  ref_ts="$now"
  if [ -n "$end_ts" ]; then
    ref_ts="$end_ts"
  fi
  elapsed=$(( ref_ts - start_ts ))
  elapsed_str=$(format_elapsed "$elapsed")

  turns=0
  running_tool=""
  if [ -f "$jsonl" ]; then
    turns=$(grep -c '"type":"turn.started"' "$jsonl" 2>/dev/null || echo 0)
    # Last item.started with no matching item.completed for the same id is
    # "what's running right now". Cheap approximation: last item.started
    # line's type, unless the very last jsonl line is already a completed
    # turn/item for it.
    last_started_type=$(grep '"type":"item.started"' "$jsonl" 2>/dev/null | tail -1 | sed -n 's/.*"item":{"id":"[^"]*","type":"\([^"]*\)".*/\1/p')
    last_line_type=$(tail -1 "$jsonl" 2>/dev/null | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
    if [ -n "$last_started_type" ] && [ "$last_line_type" = "item.started" ]; then
      running_tool=$(tool_label "$last_started_type")
    fi
  fi

  # Same three-color scale as the context-window percentage in line 1:
  # green = fine, yellow = in progress / pay attention, red = needs action.
  case "$status" in
    running)
      color="$YELLOW"
      detail="turn${turns}"
      if [ -n "$running_tool" ]; then
        detail="turn${turns} ${running_tool}"
      fi
      seg="codex ${elapsed_str} ${detail}"
      ;;
    done)
      color="$GREEN"
      seg="codex ${elapsed_str}✓done"
      ;;
    error)
      color="$RED"
      seg="codex ${elapsed_str}✗error"
      ;;
    stale)
      color="$RED"
      seg="codex ${elapsed_str}⚠stale"
      ;;
    *)
      color="$GRAY"
      seg="codex ${elapsed_str}?${status}"
      ;;
  esac
  seg="${color}${seg}${RESET}"

  segments+=("$seg")
  count=$(( count + 1 ))
  [ "$count" -ge "$MAX_SHOWN" ] && break
done

total=${#sorted[@]}
remaining=$(( total - count ))

sep=" ${GRAY}|${RESET} "
out=""
for seg in "${segments[@]}"; do
  if [ -z "$out" ]; then
    out="$seg"
  else
    out="${out}${sep}${seg}"
  fi
done
if [ "$remaining" -gt 0 ]; then
  out="${out}${sep}${GRAY}+${remaining} more${RESET}"
fi

printf '%s' "$out"

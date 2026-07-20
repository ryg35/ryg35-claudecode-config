#!/usr/bin/env bash
# Backgrounded `codex exec` wrapper with a fixed job log location so the
# statusline can read progress without knowing how the job was launched.
#
# Usage: codex-exec-bg.sh [codex exec args...]
#   e.g. codex-exec-bg.sh "fix the flaky test in foo.test.ts"
#        codex-exec-bg.sh -C /path/to/repo "refactor bar.ts"
#
# Writes:
#   /tmp/claude-codex-jobs/<id>.jsonl  - raw `codex exec --json` event stream
#   /tmp/claude-codex-jobs/<id>.meta   - job metadata (status/pid/label/times)
#
# Burn: a backgrounded `codex exec` without `< /dev/null` hangs 6+ minutes
# waiting on stdin even though the prompt is a CLI arg (see agents.md). This
# wrapper always redirects stdin from /dev/null so callers can't forget it.

set -euo pipefail

# Job logs contain prompts and model output; keep them owner-only. umask
# covers the .jsonl/.meta files, chmod covers a JOBS_DIR created by an older
# version of this script with default (world-readable) permissions.
umask 077
JOBS_DIR="/tmp/claude-codex-jobs"
mkdir -p "$JOBS_DIR"
chmod 700 "$JOBS_DIR"

# Sweep job files older than 24h so a long-uptime machine doesn't accumulate
# them forever. /tmp/claude-codex-jobs is a fixed location, not one Claude
# Code cleans up on its own, unlike the session-scoped scratchpad dir.
find "$JOBS_DIR" -maxdepth 1 -type f \( -name '*.meta' -o -name '*.jsonl' \) -mtime +1 -delete 2>/dev/null || true

job_id=$(date +%Y%m%d-%H%M%S)-$$
log_file="$JOBS_DIR/${job_id}.jsonl"
meta_file="$JOBS_DIR/${job_id}.meta"

# Best-effort one-line label for the statusline: first arg that isn't a flag
# or a flag's value. Flags that take a value (-C, -c, -m, -s, -p, -i, -o,
# --profile, --output-schema, ...) must have their following arg skipped too,
# otherwise e.g. `-C /some/dir` mislabels the job as the directory path.
label=""
skip_next=0
for arg in "$@"; do
  if [ "$skip_next" -eq 1 ]; then
    skip_next=0
    continue
  fi
  case "$arg" in
    -C | --cd | --add-dir | -c | --config | -m | --model | -s | --sandbox | -p | --profile | -i | --image | -o | --output-last-message | --output-schema | --local-provider | --color | --enable | --disable)
      skip_next=1
      continue
      ;;
    -*) continue ;;
    *) label="$arg"; break ;;
  esac
done
label_short=$(printf '%s' "$label" | tr '\n' ' ' | cut -c1-40)

start_ts=$(date +%s)
write_meta() {
  local status=$1
  local pid=${2:-}
  local end_ts=${3:-}
  {
    printf 'id=%s\n' "$job_id"
    printf 'status=%s\n' "$status"
    printf 'label=%s\n' "$label_short"
    printf 'start_ts=%s\n' "$start_ts"
    printf 'pid=%s\n' "$pid"
    if [ -n "$end_ts" ]; then
      printf 'end_ts=%s\n' "$end_ts"
    fi
  } > "$meta_file"
}

write_meta "running" "$$"

# Run in the foreground of THIS process. The caller is expected to launch
# this whole script backgrounded (e.g. Bash tool's run_in_background) --
# spawning a nested `&` job here was found to make the harness's sandboxed
# shell exit 1 immediately (verified 2026-07-13: xtrace showed the script
# dying right after `codex exec --json ... &`, before $! was even assigned).
# Always detach stdin (see burn note above) even though we're foreground now.
set +e
codex exec --json "$@" > "$log_file" 2>&1 < /dev/null
exit_code=$?
set -e

end_ts=$(date +%s)
if [ "$exit_code" -eq 0 ]; then
  write_meta "done" "$$" "$end_ts"
else
  write_meta "error" "$$" "$end_ts"
fi

exit "$exit_code"

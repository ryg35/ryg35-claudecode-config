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

# The caller is expected to launch this whole script backgrounded (Bash tool's
# run_in_background). Without that, the harness's 2-minute timeout SIGTERMs us.
#
# History: a nested `&` here used to make the harness's sandboxed shell exit 1
# immediately (2026-07-13: xtrace showed the script dying right after
# `codex exec --json ... &`, before $! was even assigned). Re-tested 2026-07-27
# with the `& + wait` shape below and that no longer reproduces -- the wrapper
# survives and codex runs normally. If the immediate exit-1 ever comes back,
# this block is the first suspect.
# Always detach stdin (see burn note above) even though we're foreground now.
#
# If we get killed before finishing (most commonly: the caller forgot
# run_in_background and the harness's 2-minute Bash timeout SIGTERMs the
# process group), record that instead of leaving the startup "running" behind.
# Burn: 2026-07-27, two reviews died this way and `.meta` kept claiming
# status=running for the rest of the session, so the death went unnoticed.
# NOTE: the trap must not wait on a FOREGROUND child. bash only runs a trap
# handler between commands, so with `codex exec` in the foreground the signal
# sits queued until codex exits, and the handler never gets to run before the
# kill. Start codex in the background and `wait` on it: `wait` IS interruptible
# by a trap, which is the whole point of this shape.
trap 'kill "$codex_pid" 2>/dev/null; write_meta "killed" "$$" "$(date +%s)"; exit 143' TERM INT HUP
set +e
codex exec --json "$@" > "$log_file" 2>&1 < /dev/null &
codex_pid=$!
wait "$codex_pid"
exit_code=$?
set -e

end_ts=$(date +%s)
if [ "$exit_code" -eq 0 ]; then
  write_meta "done" "$$" "$end_ts"
else
  write_meta "error" "$$" "$end_ts"
fi

# --- Token usage を永続ディレクトリへ1行追記 ---
# なぜ必要か: codex は通常 ~/.codex/sessions/ に rollout ログを残し、日報の
# AI Usage 集計はそこを読む。しかし `--ephemeral` を付けたジョブは rollout を
# 残さないため、消費が日報から丸ごと落ちる。
# /review-prs と /pre-pr-review は Codex レビュー2本を必ず --ephemeral で呼ぶので
# (review-prs.md:123,126 / pre-pr-review.md:128,131)、レビューを回すたびに漏れる。
# 2026-08-16 実測: 51 ジョブ中 --ephemeral の 2 件が sessions に無く、
# うち 1 件は input 7,201,604 tok を消費していた。
# 消費値自体はこのジョブログの turn.completed に入っているので、ここで拾って
# 永続化する。/tmp は再起動で消え、日報は翌朝に前日分を作るため、
# /tmp に置いたままでは夜の再起動で証拠ごと消える。
#
# 既存の /tmp/claude-codex-jobs は statusline (codex-jobs-status.sh)、
# codex-job-guard.sh、pre-tool-enforcer.sh が参照しているので動かさない。
# ここは追記のみで、既存の経路には一切触らない。
usage_dir="$HOME/.claude/codex-usage"
mkdir -p "$usage_dir"
usage_file="$usage_dir/$(date +%Y-%m-%d).jsonl"

# 最後の turn.completed の usage を取る (セッション累積ではなくターン単位なので合算する)
if [ -f "$log_file" ]; then
  thread_id=$(grep -o '"thread_id":"[^"]*"' "$log_file" 2>/dev/null | head -1 | cut -d'"' -f4)
  usage_json=$(grep -o '"usage":{[^}]*}' "$log_file" 2>/dev/null | tail -1 | sed 's/^"usage"://')
  if [ -n "$usage_json" ]; then
    # thread_id が空のジョブ (起動即エラー) も記録しておく。消費0でも
    # 「呼んだが失敗した」事実が残るほうが、後から数を突き合わせやすい。
    printf '{"job_id":"%s","thread_id":"%s","start_ts":%s,"end_ts":%s,"exit_code":%s,"usage":%s}\n' \
      "$job_id" "${thread_id:-}" "$start_ts" "$end_ts" "$exit_code" "$usage_json" >> "$usage_file"
  fi
fi

exit "$exit_code"

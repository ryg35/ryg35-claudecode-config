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
JOBS_DIR="${CODEX_JOBS_DIR:-/tmp/claude-codex-jobs}"
mkdir -p "$JOBS_DIR"
chmod 700 "$JOBS_DIR"

# Sweep job files older than 24h so a long-uptime machine doesn't accumulate
# them forever. /tmp/claude-codex-jobs is a fixed location, not one Claude
# Code cleans up on its own, unlike the session-scoped scratchpad dir.
find "$JOBS_DIR" -maxdepth 1 -type f \( -name '*.meta' -o -name '*.jsonl' -o -name '*.stale' -o -name '*.tokwarn' \) -mtime +1 -delete 2>/dev/null || true

job_id=$(date +%Y%m%d-%H%M%S)-$$
log_file="$JOBS_DIR/${job_id}.jsonl"
meta_file="$JOBS_DIR/${job_id}.meta"

mode="default"
pass_args=()
caller_model=0
caller_effort=0
caller_profile=0
caller_ignore_config=0
allow_subagents=0
prev=""
after_dashdash=0
for arg in "$@"; do
  if [ "$after_dashdash" -eq 1 ]; then
    pass_args+=("$arg")
    continue
  fi
  case "$arg" in
    --) after_dashdash=1 ;;
    --no-tools) mode="no-tools"; prev=""; continue ;;
    --no-search) [ "$mode" = "no-tools" ] || mode="no-search"; prev=""; continue ;;
    --allow-subagents) allow_subagents=1; prev=""; continue ;;
    --ignore-user-config) caller_ignore_config=1 ;;
    -m | --model | -m?* | --model=*) caller_model=1 ;;
    -p | --profile | -p?* | --profile=*) caller_profile=1 ;;
  esac
  case "$prev" in -c | --config) cfg="$arg" ;; *) cfg="" ;; esac
  case "$arg" in --config=* | -c=*) cfg="${arg#*=}" ;; -c?*) cfg="${arg#-c}" ;; esac
  case "$cfg" in
    model=*) caller_model=1 ;;
    model_reasoning_effort=*) caller_effort=1 ;;
    profile=*) caller_profile=1 ;;
    developer_instructions=*) allow_subagents=1 ;;
  esac
  pass_args+=("$arg")
  prev="$arg"
done

config_value() {
  local file="${CODEX_HOME:-$HOME/.codex}/config.toml"
  [ -f "$file" ] || return 0
  # Top-level keys only: the same key inside a [table] belongs to a profile or provider.
  awk -v key="$1" '
    /^[[:space:]]*\[/ { exit }
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      sub(/^[^=]*=[[:space:]]*/, "")
      if (match($0, /^"[^"]*"/) || match($0, /^\047[^\047]*\047/)) {
        print substr($0, 2, RLENGTH - 2)
        exit
      }
    }
  ' "$file" 2>/dev/null || true
}

if [ "$caller_model" -eq 0 ]; then
  cfg_model=$(config_value model)
  if [ -z "$cfg_model" ] && [ "$caller_profile" -eq 0 ]; then
    echo "codex-exec-bg.sh: no configured model; configure one or pass --model explicitly." >&2
    exit 2
  fi
fi

# Measured on codex-cli 0.159.2: blocking one route makes Codex fall back to
# another (web_search=disabled -> codex_apps MCP search, --disable apps -> native
# web_search), so each mode disables every route it covers.
mode_args=()
case "$mode" in
  no-search)
    mode_args=(-c web_search=disabled --disable apps --disable browser_use --disable computer_use)
    ;;
  no-tools)
    # --ignore-user-config drops config.toml, so carry its model and effort over.
    if [ "$caller_ignore_config" -eq 0 ]; then
      mode_args+=(--ignore-user-config)
    fi
    if [ "$caller_model" -eq 0 ]; then
      mode_args+=(-m "$cfg_model")
    fi
    if [ "$caller_effort" -eq 0 ]; then
      cfg_effort=$(config_value model_reasoning_effort)
      if [ -n "$cfg_effort" ]; then
        mode_args+=(-c "model_reasoning_effort=$cfg_effort")
      fi
    fi
    mode_args+=(-c web_search=disabled --disable shell_tool --disable apps --disable code_mode_host --disable computer_use --disable plugins --disable browser_use --disable multi_agent)
    ;;
esac
# Config cannot remove spawn_agent on codex-cli 0.159.2 (see codex-jobs SKILL.md §9); an instruction can.
if [ "$allow_subagents" -eq 0 ]; then
  mode_args+=(-c 'developer_instructions="This is a non-interactive codex exec job. Never call spawn_agent or start subagents, including reviewers; the caller reviews your work separately."')
fi

# Best-effort one-line label for the statusline: first arg that isn't a flag
# or a flag's value. Flags that take a value (-C, -c, -m, -s, -p, -i, -o,
# --profile, --output-schema, ...) must have their following arg skipped too,
# otherwise e.g. `-C /some/dir` mislabels the job as the directory path.
label=""
skip_next=0
for arg in "${pass_args[@]+"${pass_args[@]}"}"; do
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
    printf 'mode=%s\n' "$mode"
    if [ -n "$end_ts" ]; then
      printf 'end_ts=%s\n' "$end_ts"
    fi
    if [ -n "${usage_lines:-}" ]; then
      printf '%s\n' "$usage_lines"
    fi
  } > "$meta_file"
}

if [ "$mode" = "no-tools" ] && [ "$caller_profile" -eq 1 ]; then
  write_meta "error" "$$" "$(date +%s)"
  echo "codex-exec-bg.sh: --no-tools cannot be combined with -p/--profile (--ignore-user-config drops config.toml, so the profile would not exist). Pass -m and -c instead." >&2
  exit 2
fi

write_meta "running" "$$"
printf 'codex-job-id=%s meta=%s\n' "$job_id" "$meta_file" >&2

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
trap 'kill "${codex_pid:-}" 2>/dev/null; write_meta "killed" "$$" "$(date +%s)"; exit 143' TERM INT HUP
set +e
codex exec --json "${mode_args[@]+"${mode_args[@]}"}" "${pass_args[@]+"${pass_args[@]}"}" > "$log_file" 2>&1 < /dev/null &
codex_pid=$!
wait "$codex_pid"
exit_code=$?
set -e

end_ts=$(date +%s)
usage_lines=""
if [ -f "$log_file" ]; then
  last_turn=$(LC_ALL=C grep '"type":"turn.completed"' "$log_file" 2>/dev/null | tail -1 || true)
  if [ -n "$last_turn" ]; then
    if command -v jq >/dev/null 2>&1; then
      usage_lines=$(printf '%s' "$last_turn" | jq -r '.usage // {} | to_entries[] | select(.key == "input_tokens" or .key == "cached_input_tokens" or .key == "output_tokens") | select(.value | type == "number") | "\(.key)=\(.value)"' 2>/dev/null || true)
    else
      usage_lines=$(printf '%s' "$last_turn" | python3 -I -c '
import json, sys
u = json.load(sys.stdin).get("usage") or {}
for k in ("input_tokens", "cached_input_tokens", "output_tokens"):
    if isinstance(u.get(k), int):
        print(f"{k}={u[k]}")
' 2>/dev/null || true)
    fi
  fi
fi
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
  # pipefail + set -e: a no-match grep would exit 1 here and mask codex's own exit code.
  thread_id=$(LC_ALL=C grep -o '"thread_id":"[^"]*"' "$log_file" 2>/dev/null | head -1 | cut -d'"' -f4 || true)
  usage_json=$(LC_ALL=C grep -o '"usage":{[^}]*}' "$log_file" 2>/dev/null | tail -1 | sed 's/^"usage"://' || true)
  if [ -n "$usage_json" ]; then
    # thread_id が空のジョブ (起動即エラー) も記録しておく。消費0でも
    # 「呼んだが失敗した」事実が残るほうが、後から数を突き合わせやすい。
    printf '{"job_id":"%s","thread_id":"%s","start_ts":%s,"end_ts":%s,"exit_code":%s,"usage":%s}\n' \
      "$job_id" "${thread_id:-}" "$start_ts" "$end_ts" "$exit_code" "$usage_json" >> "$usage_file"
  fi
fi

exit "$exit_code"

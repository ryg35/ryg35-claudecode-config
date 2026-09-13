---
name: codex-jobs
description: Rules for running and observing Codex background jobs (codex-exec-bg.sh, /tmp/claude-codex-jobs). YOU MUST load this before launching, polling, or reporting the state of any codex exec job. Skipping it has already produced wrong reports twice: two dead jobs were reported as "still running" on 2026-07-27, and a healthy job was reported finished twice on 2026-08-16.
---

# Codex Jobs

Launch, watch, and report Codex jobs. Every rule below is a burn that already happened. No exceptions.

Usage: `~/.claude/scripts/codex-exec-bg.sh [codex exec args...]`
Example: `~/.claude/scripts/codex-exec-bg.sh --sandbox read-only "review this file for X"`
State lives in `/tmp/claude-codex-jobs/<job_id>.jsonl` + `.meta` (override the directory with `CODEX_JOBS_DIR` when testing, so no fake data lands in the real one).

## 1. Always the wrapper, never a raw `codex exec ... &`

Run Codex in the background only via `~/.claude/scripts/codex-exec-bg.sh`. Not a raw `codex exec ... > file 2>&1 &`, not the codex:rescue skill. The wrapper is what grants write permissions and what writes `/tmp/claude-codex-jobs/<job_id>.jsonl` + `.meta`, which `~/.claude/scripts/codex-jobs-status.sh` reads to render live job progress as line 4 of the statusline (`~/.claude/statusline-command.sh`). A hand-rolled call never registers, so the job runs invisibly.

Burn 2026-07-16: a hand-rolled `codex exec ... &` review ran 10+ minutes with zero statusline feedback. The fix is the wrapper, not more polling.

## 2. `run_in_background: true` is mandatory

YOU MUST call `codex-exec-bg.sh` with the Bash tool's `run_in_background: true`. Despite the `-bg` in its name, the wrapper runs `codex exec` in ITS OWN foreground (a nested `&` killed the harness's sandboxed shell; see the comment in the script). Backgrounding is the CALLER's job.

Without it, the harness's 2-minute Bash timeout SIGTERMs the whole process group mid-run: the job dies with `Exit code 143`, and because the wrapper never reaches its final `write_meta`, the `.meta` file says `status=running` forever.

Burn 2026-07-27: two consecutive code reviews were killed this way, and the stale `running` status was reported to the user as "still running" both times.

## 3. Any backgrounded `codex exec` ends with `< /dev/null`

Without it the process inherits a stdin that never reaches EOF and hangs waiting for "additional input from stdin", even though the prompt was already passed as a CLI argument. Verified 2026-07-13: a trivial one-line prompt hung 6+ minutes without it, reproduced at both `xhigh` and `low` reasoning effort (which rules out reasoning depth). The same prompt with `< /dev/null` returned in seconds. The wrapper redirects stdin internally, so this is handled when you use it. Foreground `codex exec` calls are unaffected.

## 4. Never report a job as running based on `.meta` alone

`status=running` is written at launch and only rewritten at clean exit, so a job killed by SIGTERM keeps saying `running` forever. Confirm with `ps -p <pid>` every single time before telling the user anything about a job's state. A dead job reported as live is worse than no report at all.

## 5. Read `.meta` with `LC_ALL=C`, never a bare grep

```bash
LC_ALL=C sed -n 's/^status=//p' /tmp/claude-codex-jobs/<job_id>.meta
```

The `label=` line truncates the prompt on a byte boundary, so a Japanese prompt leaves invalid UTF-8 in the file. BSD `grep` then treats the whole file as unmatched and silently returns nothing, which reads as "the job finished" to any watcher polling for `status=running`.

Burn 2026-08-16: a monitor fired two false "job finished" events in a row while the job was healthy.

## 6. The guard hook catches both failure modes

`~/.claude/scripts/codex-job-guard.sh` (PostToolUse) surfaces the error tail when a job dies within seconds of launch, and sweeps for `status=running` metas whose pid is gone. It reports each corpse once via a `.stale` marker, so it stays quiet on healthy runs. It does not replace rule 4; it is the backstop.

## 7. Watch the log size, not just the pid

A job that is alive but has stopped writing to its `.jsonl` is hung, and `ps` alone cannot tell you that. Poll the byte count; treat "no growth for 3 consecutive checks" as a hang.

```bash
ps -p <pid> >/dev/null && wc -c /tmp/claude-codex-jobs/<job_id>.jsonl
```

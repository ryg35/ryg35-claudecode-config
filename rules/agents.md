# Agent Orchestration

## Available Agents (`~/.claude/agents/`)

| Agent | Purpose |
|-------|---------|
| planner | Implementation planning |
| architect | System design |
| tdd-guide | Test-driven development |
| code-reviewer | Code review |
| security-reviewer | Security analysis |
| build-error-resolver | Fix build errors |
| e2e-runner | E2E testing |
| refactor-cleaner | Dead code cleanup |
| doc-updater | Documentation updates |
| ci-gen | CI/CD configuration generation |
| database-reviewer | Database review |
| project-doc-gen | Project document generation |
| repo-scaffolder | Repository initial setup |
| performance-optimizer | Performance profiling & optimization |
| code-simplifier | Code simplification & readability |
| code-explorer | Deep codebase analysis & architecture mapping |
| typescript-reviewer | TypeScript type safety & async correctness review |
| silent-failure-hunter | Silent error & swallowed exception detection |
| harness-optimizer | Harness config audit & optimization (invoked by /harness-audit) |
| tracer | Evidence-based root-cause tracing (hypothesis + observation, no fix) |
| executor | Implementation specialist (write code per plan) |
| verifier | Evidence-based verification of implementations |
| critic | Read-only design/plan critique (adversarial) |
| analyst | Read-only requirement & gap analysis |
| designer | UI/UX implementation |
| scientist | Data analysis with statistical rigor |
| git-master | Atomic commits, rebase, branch hygiene |
| document-specialist | External documentation lookup (context7, web fallback) |
| chaos-engineer | Controlled failure experiments, resilience validation, game days |
| error-detective | Error correlation and root-cause diagnosis across services |
| sre-engineer | SLO/error-budget design, toil reduction, reliability automation |

## Auto-Use (no user prompt needed)

- Complex feature → **planner**
- Code written/modified → **code-reviewer**
- Bug fix / new feature → **tdd-guide**
- Architectural decision → **architect**
- TypeScript code → **typescript-reviewer**
- Performance concerns → **performance-optimizer**
- Error handling review → **silent-failure-hunter**
- Refactoring → **code-simplifier**
- Codebase exploration → **code-explorer**
- Causal mystery / unknown-root-cause bug / competing-hypothesis verification → **tracer** (understanding phase, before fix)

## Codex / Planning Preferences

- Run Codex in the background via `~/.claude/scripts/codex-exec-bg.sh` (NOT a raw `codex exec ... &` shell backgrounding, NOT the codex:rescue skill); required for write permissions.
- **Always use `codex-exec-bg.sh`, never hand-roll `codex exec ... > file 2>&1 &` with Bash `run_in_background`.** The wrapper writes `/tmp/claude-codex-jobs/<job_id>.jsonl` + `.meta`, which `~/.claude/scripts/codex-jobs-status.sh` reads to render live Codex job progress as line 4 of the statusline (`~/.claude/statusline-command.sh`). A hand-rolled background call never registers in `/tmp/claude-codex-jobs/`, so the job runs invisibly with no statusline feedback, even though the job itself completes fine. Burn: 2026-07-16, a hand-rolled `codex exec ... &` call for a report review ran for 10+ minutes with zero statusline visibility; switching to the wrapper is the fix, not adding more polling.
  Usage: `~/.claude/scripts/codex-exec-bg.sh [codex exec args...]`, e.g. `~/.claude/scripts/codex-exec-bg.sh --sandbox read-only "review this file for X"`. The wrapper already redirects stdin from `/dev/null` internally, so the `< /dev/null` requirement below is handled automatically when using it.
- **YOU MUST call `codex-exec-bg.sh` with the Bash tool's `run_in_background: true`.** Despite the `-bg` in its name, the wrapper runs `codex exec` in ITS OWN foreground (a nested `&` was found to kill the harness's sandboxed shell, see the comment in the script). Backgrounding is the CALLER's job. Without `run_in_background`, the harness's 2-minute Bash timeout SIGTERMs the whole process group mid-run: the review dies with `Exit code 143`, and because the wrapper never reaches its final `write_meta`, the `.meta` file is left saying `status=running` forever. Do not trust `status=running` alone; confirm with `ps -p <pid>`. Burn: 2026-07-27, two consecutive code reviews were killed this way and the stale `running` status was reported to the user as "still running" both times.
- **Any backgrounded `codex exec` call must end with `< /dev/null`.** Without it, the process inherits a stdin that never reaches EOF and hangs indefinitely waiting for "additional input from stdin", even though the prompt was already supplied as a CLI argument. Verified 2026-07-13: a trivial one-line prompt hung 6+ minutes without it (reproduced at both `xhigh` and `low` reasoning effort, ruling out reasoning depth as the cause); the same prompt with `< /dev/null` returned in seconds. Foreground (non-backgrounded) `codex exec` calls are unaffected and do not need this.
- When the user wants to agree on an implementation plan with Codex, default to proposing `/ralplan --interactive --architect codex --critic codex`.
- **NEVER report a codex job as running based on `.meta` alone.** `status=running` is
  written at launch and only rewritten at clean exit, so a job killed by SIGTERM keeps
  saying `running` forever. Confirm with `ps -p <pid>` every single time before telling
  the user anything about a job's state. Burn: 2026-07-27, two consecutive reviews were
  killed by the 2-minute Bash timeout and both were reported to the user as "still
  running". A dead job reported as live is worse than no report at all.
- **Read `/tmp/claude-codex-jobs/*.meta` with `LC_ALL=C`.** The `label=` line truncates
  the prompt on a byte boundary, so a Japanese prompt leaves invalid UTF-8 in the file.
  BSD `grep` then treats the whole file as unmatched and silently returns nothing, which
  reads as "the job finished" to any watcher polling for `status=running`. Use
  `LC_ALL=C sed -n 's/^status=//p'`, never a bare `grep`. Burn: 2026-08-16, a monitor
  fired two false "job finished" events in a row while the job was healthy.
- A PostToolUse hook (`~/.claude/scripts/codex-job-guard.sh`) now catches both failure
  modes automatically: it surfaces the error tail when a job dies within seconds of
  launch, and it sweeps for `status=running` metas whose pid is gone. It reports each
  corpse once (`.stale` marker) so it stays quiet on healthy runs. The jobs directory is
  overridable via `CODEX_JOBS_DIR` for testing, so no fake data ever lands in the real
  directory.
- **Watch the log size, not just the pid.** A codex job that is alive but has stopped
  writing to its `.jsonl` is hung, and `ps` alone cannot tell you that. Poll the byte
  count; treat "no growth for 3 consecutive checks" as a hang.

## Guidelines

- ALWAYS launch independent agents in parallel
- tracer vs error-detective: tracer produces understanding only (read-only, no fix); error-detective diagnoses and also writes fixes/prevention. Prefer tracer when the root cause is unknown.
- Subagents lack context. Use iterative retrieval: broad search → evaluate relevance (0-1) → refine keywords → repeat (max 3 cycles). Stop when 3+ files score >= 0.7.
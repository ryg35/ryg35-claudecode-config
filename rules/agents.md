# Agent Orchestration

Roster lives in `~/.claude/agents/*.md`; the Agent tool lists them.

## Auto-Use

- Complex feature -> planner. Code written/modified -> code-reviewer. Bug fix or new feature -> tdd-guide. TypeScript -> typescript-reviewer.
- Unknown root cause -> tracer (read-only understanding, no fix). error-detective diagnoses AND writes fixes. Prefer tracer while the cause is unknown.

## Codex

- Codex runs ONLY via `~/.claude/scripts/codex-exec-bg.sh` with Bash `run_in_background: true`. Never hand-roll `codex exec ... &`.
- Before touching or reporting on a codex job, invoke the `codex-jobs` skill (five burns there).
- `/ralplan --interactive --architect codex --critic codex` is the default when agreeing a plan with Codex.

## Long-running processes (subagents and your own Bash)

**Whoever starts a long-running process owns stopping it.** Dev servers, watchers, tunnels, anything holding a port or PID. No exceptions.

1. **Every prompt to an implementation or verification agent MUST include the stop-when-done requirement.** If the prompt does not say it, the agent will not do it. Every time.
2. **Never escape a busy port by incrementing the port number.** Stop the previous process and reuse the same port. An incrementing port is the signature of this failure, not a workaround.
3. **Stop by PID with SIGTERM** (`kill <pid>`). `pkill -f next`, `killall node`, and any pattern-wide kill are FORBIDDEN: they take down other projects' and other sessions' servers.
4. **Before reporting completion, count your own live processes and put the number in the report.** "I stopped them" is not evidence; the count is.

```bash
ps -eo pid,etime,command | grep -E 'next-server|vite|webpack' | grep -v grep
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':3[0-9]{3}'
```

Stop stale ones by PID. Leave the newest one or two alive unless the agent is confirmed finished: killing a server mid-verification destroys its evidence.

Burn 2026-08-27: an executor left nine next-server processes on ports 3100-3108 in 30 minutes because the prompt never said to stop them.

## Scheduled-task sessions

Scheduled-task sessions (Claude Desktop) keep their process alive after finishing (2026-08-28: 69 strays, 16GB, 16h). `~/.claude/scripts/claude-session-janitor.py` runs from launchd (`com.ryg35.claude-session-janitor`, every 600s; `launchctl print gui/$(id -u)/com.ryg35.claude-session-janitor`, log `~/.claude/logs/session-janitor.log`). `scripts/scheduled-task-exit.sh` is a Stop hook (registered in `settings.json` on 2026-09-10) that exits them immediately; log `~/.claude/logs/scheduled-task-exit.log`. Match the escaped `name=\"...\"` inside jsonl; RSS size is not a classifier.

## Guidelines

- ALWAYS launch independent agents in parallel, in one message.
- Subagents lack context. Hand them file paths and keywords, not "look into X".

- Authoring and review are separate passes. No self-approval in the same context: `critic` for design, `verifier` for evidence, `code-reviewer` for code.
- Builds, test suites, and large greps go to `run_in_background`; keep working while they run.

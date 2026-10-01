# Agent Orchestration

Roster lives in `~/.claude/agents/*.md`; the Agent tool lists them.

## Auto-Use

- Complex feature -> planner. Code written/modified -> code-reviewer. Bug fix or new feature -> tdd-guide. TypeScript -> typescript-reviewer.
- Unknown root cause -> tracer (read-only understanding, no fix). error-detective diagnoses AND writes fixes. Prefer tracer while the cause is unknown.

## Codex

- Codex runs ONLY via `~/.claude/scripts/codex-exec-bg.sh` with Bash `run_in_background: true`. Never hand-roll `codex exec ... &`.
- Before touching or reporting on a codex job, invoke the `codex-jobs` skill (five burns there).
- Codex model is `gpt-6.1-sol` (the `~/.codex/config.toml` default, effort medium). NEVER pass `-m gpt-6-astra` unless the user names Astra in the conversation. Burn 2026-09-19: Astra at effort low took the Pro Lite weekly limit from 37% to 100% in 3 hours, about 2.7x Sol ultra per token.
- Agreeing a plan with Codex: run the `plan` skill with `--consensus`, then the `second-opinion` skill for an independent Codex pass.

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

## MCP Servers

- **Do NOT re-add `chrome-devtools-mcp` to any MCP config.** Removed 2026-08-22
  from `~/.claude.json` (1 global + 15 project entries, 16 total; backup at
  `~/.claude.json.bak-chrome-devtools-20260822`). On macOS 26 the MCP launches
  Chrome with its own profile and Chrome aborts within ~30ms in
  `TransformProcessType` / `_RegisterApplication`, then the MCP retries, so the
  user gets bursts of macOS crash dialogs (13 crash reports in one day, in runs
  of 4-8 a few seconds apart). Browser work is covered by the built-in Claude
  Browser pane and Claude in Chrome; there is no capability gap.
- Known leftover: `<dev-root>/everything-claude-code/.mcp.json` still
  registers chrome-devtools (git-tracked in that repo). Sessions opened there
  can reproduce the crash until it is removed.

## Guidelines

- ALWAYS launch independent agents in parallel, in one message.
- Subagents lack context. Hand them file paths and keywords, not "look into X".

- Authoring and review are separate passes. No self-approval in the same context: `critic` for design, `verifier` for evidence, `code-reviewer` for code.
- Builds, test suites, and large greps go to `run_in_background`; keep working while they run.

---
name: omc-teams
description: "Spawn N external CLI workers (claude / codex / gemini) in parallel background processes when you need process-based execution instead of Task subagents. Complements /team. team uses Claude Task subagents in-session, omc-teams launches separate CLI processes."
user_invocable: true
argument-hint: "N:claude|codex|gemini <task description>"
---

# OMC Teams (/omc-teams)

## Purpose

Spawn N independent CLI worker processes, each backed by an external AI CLI (`claude`, `codex`, or `gemini`), to execute decomposed subtasks in parallel. The lead (this skill) decomposes the work, writes a prompt file per worker, launches each as a background `Bash` job, monitors output, and collects results.

Use this when you want **process-based** parallelism: each worker is a separate OS process with its own context, its own model, and full filesystem access in its working directory. They cannot coordinate among themselves; the lead coordinates by reading their output files.

## Use when

- You want to run multiple AI CLI processes in parallel from inside this Claude Code session.
- You want a mix of provider models on the same task (e.g. 1 Claude + 1 Codex + 1 Gemini).
- You want each worker to operate independently with its own context budget.

## Do not use when

- You want in-session Claude subagents that share context. Use the `team` skill instead. That's the lighter, faster default for most parallel work.
- You only want one CLI invocation. Just call it directly via `Bash`.
- You want an independent second opinion on a finished diff. Use `second-opinion`.
- The required CLIs aren't installed (check `command -v` before claiming the skill is available).

## `omc-teams` vs `team`

| | `team` | `omc-teams` |
|---|---|---|
| Workers | Claude `Task` subagents (in-session) | External CLI processes via `Bash` |
| Context sharing | Lead can pass context per worker prompt | Each CLI has its own session |
| Cost | One Claude Code session | N separate AI CLI sessions, charged independently |
| Best for | Standard parallel implementation | Mixing providers, isolating per-worker context, long autonomous runs |

`team` covers most cases. Reach for `omc-teams` only when you specifically want N separate CLI processes.

---

## Requirements

```bash
# Verify the requested CLI is available before launching.
command -v claude >/dev/null || echo "claude CLI missing"
command -v codex  >/dev/null || echo "codex CLI missing"
command -v gemini >/dev/null || echo "gemini CLI missing"
```

If the requested CLI is missing, report it and stop. Do not silently fall back to a different provider.

Install if needed (these are user-side, not for the skill to run):

- `claude`: `npm install -g @anthropic-ai/claude-code`
- `codex`: `npm install -g @openai/codex`
- `gemini`: `npm install -g @google/gemini-cli`

---

## Arguments

```
/omc-teams N:provider "<task description>"
```

- **N**: 1 to 10 workers.
- **provider**: `claude`, `codex`, or `gemini`. Only these three.
- **task**: the task to distribute.

### Examples

```
/omc-teams 2:claude "implement the auth module and write tests"
/omc-teams 2:codex "review the auth module for security issues and propose fixes"
/omc-teams 3:gemini "rebuild the UI components for accessibility"
```

---

## Workflow

### Phase 0: Verify prerequisites

Validate provider availability with `Bash("command -v <provider>")`. If missing, report and stop.

Reject unsupported provider types. Only `claude`, `codex`, `gemini` are supported. If the user asks for `executor` / `debugger` / `designer` / `expert`, redirect them to the `team` skill, which uses native Claude `Task` subagents and supports those names.

### Phase 1: Parse and validate

- Extract `N` (1-10), `provider`, `task`.
- Validate.

### Phase 2: Decompose

Break work into N independent subtasks. Each subtask must be file-scoped or concern-scoped so workers don't collide on writes.

Write the task list to `.claude/omc-teams/<slug>/tasks.json`:

```json
{
  "task": "<original task>",
  "slug": "<kebab-case>",
  "provider": "claude",
  "subtasks": [
    {
      "id": "W1",
      "subject": "Implement login flow",
      "description": "<full prompt for this worker including paths and acceptance criteria>",
      "status": "pending"
    }
  ]
}
```

### Phase 2.5: Resolve workspace root for multi-repo plans

All workers launch with one shared working directory. For single-repo tasks the current repo is correct. For multi-repo plans, especially when a plan lives in one repo but implementation touches sibling repos:

- Choose the shared workspace root containing all participating repos.
- Use **absolute paths** to plan files inside the worker prompts.
- Include explicit repo paths inside each subtask description.
- Do not anchor workers to the plan's repo when target repos are siblings; that strands workers in the wrong tree.
- If no safe shared workspace root can be identified, do not launch. Report the single-cwd constraint and ask the user to confirm the workspace root.

### Phase 3: Write per-worker prompt files

For each subtask, write a prompt file at `.claude/omc-teams/<slug>/W<n>/prompt.md`:

```markdown
# Worker W<n> task

You are worker W<n> on team "<slug>". You are an external CLI process,
not in the lead's session. You cannot message the lead. Write your final
report to `.claude/omc-teams/<slug>/W<n>/output.md` when done.

## Task
<subject>

## Description
<full description>

## Files in scope
- <absolute path 1>
- <absolute path 2>

## Acceptance criteria
- <criterion 1>
- <criterion 2>

## Rules
- Work only on files in your scope.
- Use absolute paths.
- Do not run team / omc-teams commands.
- When done, write a summary to `.claude/omc-teams/<slug>/W<n>/output.md` with:
  - Files changed
  - What you implemented
  - Verification you ran
  - Anything you couldn't finish or any open questions
```

### Phase 4: Launch workers

Fire all N workers as background `Bash` jobs in one message:

```
Bash("claude -p \"$(cat .claude/omc-teams/<slug>/W1/prompt.md)\" > .claude/omc-teams/<slug>/W1/stdout.log 2>&1",
     run_in_background=true,
     description="Launch worker W1 (claude)")
Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --skip-git-repo-check -- \"$(cat .claude/omc-teams/<slug>/W2/prompt.md)\" < /dev/null > .claude/omc-teams/<slug>/W2/stdout.log 2>&1",
     run_in_background=true,
     description="Launch worker W2 (codex)")
Bash("gemini -p \"$(cat .claude/omc-teams/<slug>/W3/prompt.md)\" > .claude/omc-teams/<slug>/W3/stdout.log 2>&1",
     run_in_background=true,
     description="Launch worker W3 (gemini)")
```

Note the exact invocation per provider:

- `claude -p "<prompt>"`: non-interactive mode.
- `~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --skip-git-repo-check -- "<prompt>"`: non-interactive exec mode (the wrapper redirects stdin from /dev/null internally). Defaults to Sol; cost is not a constraint for worker execution. A raw `codex exec` without stdin redirection inherits a stdin that never reaches EOF and hangs indefinitely waiting for "additional input from stdin", even though the prompt was already supplied as an argument. Verified 2026-07-13 (6+ min hang without it, seconds with it).
- `gemini -p "<prompt>"`: non-interactive prompt mode.

Each worker's stdout goes to its own log file so they don't interleave.

### Phase 5: Monitor

Periodically check each worker:

- `TaskOutput` on the launched task IDs to read fresh output.
- Read `.claude/omc-teams/<slug>/W<n>/output.md` once the worker has written it.
- Track status in `tasks.json`: `pending` → `running` → `completed` or `failed`.

When a worker writes its `output.md`, mark it `completed` and move on.

### Phase 6: Shutdown if needed

If you need to cancel a worker before it finishes:

```
TaskStop(task_id="<task-id-of-worker>")
```

Update its task status to `cancelled`.

### Phase 7: Collect and report

Once all workers have finished, completed, or been cancelled:

1. Read every `output.md`.
2. Aggregate: total files changed, total tests added/passed, blockers.
3. If any worker failed or left work undone, surface it explicitly. Don't gloss over partial completion.
4. Report to the user.

---

## Files this skill owns

```
.claude/omc-teams/<slug>/
  tasks.json
  W1/
    prompt.md          # what the worker was asked to do
    stdout.log         # raw CLI output
    output.md          # worker's final report (worker writes this)
  W2/
    ...
```

Keep these around for debugging. Clean up later via `git clean -fdX .claude/omc-teams/<slug>/` if not needed.

---

## Error reference

| Error | Cause | Fix |
|---|---|---|
| `claude: command not found` | Claude Code CLI not installed | `npm install -g @anthropic-ai/claude-code` |
| `codex: command not found` | Codex CLI not installed | `npm install -g @openai/codex` |
| `gemini: command not found` | Gemini CLI not installed | `npm install -g @google/gemini-cli` |
| Worker hangs indefinitely | CLI waiting for interactive input | Kill via `TaskStop`, fix the prompt to be self-contained |
| Worker output garbled | Two workers writing to the same file | Subtask scopes overlap; redecompose to be mutually exclusive |
| Worker says "out of credits" | Provider account quota | Switch provider or wait |

---

## Relationship to `/team`

| Aspect | `/team` | `/omc-teams` |
|---|---|---|
| Worker type | Claude `Task` subagents (or codex/gemini CLI workers as a sub-feature) | Pure external CLI processes only |
| Invocation | `Task` tool, with optional `Bash("~/.claude/scripts/codex-exec-bg.sh ...")` per subtask | `Bash` with `run_in_background` for every worker |
| Coordination | Lead can talk to subagents via subagent prompts; can compose with `ralph` | Lead writes prompt files, reads output files; no live messaging |
| Use when | Standard parallel implementation | Mix providers, isolate per-worker context, run truly independent CLI sessions |

Default to `team` unless you specifically need external CLI processes.

---

## Final checklist

- [ ] Provider CLI verified present before launching.
- [ ] Task decomposed into mutually exclusive subtasks.
- [ ] Each worker's prompt file is fully self-contained (no implicit context).
- [ ] All N workers launched in parallel (same message, `run_in_background: true`).
- [ ] Each worker's stdout went to its own log file.
- [ ] Each worker wrote its own `output.md` (or its task was explicitly marked failed/cancelled).
- [ ] Aggregate report surfaces partial completion and blockers honestly.

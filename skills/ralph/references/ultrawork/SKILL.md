---
name: ultrawork
description: Parallel execution engine. Fan out independent work across multiple Task subagents at the right model tier, with intent grounding and lightweight verification.
user_invocable: true
argument-hint: "<task description with parallel work items>"
---

# Ultrawork Skill (/ultrawork)

## Purpose

A protocol for fanning out independent work. Confirm intent, gather context in parallel, build a small dependency graph for non-trivial work, route each task to the right model tier, fire independent subagents in the same message, run long ops in the background, then run a lightweight verification pass.

This is the parallelism layer. It does not own persistence (use `ralph` for that) or the full idea-to-PR lifecycle (use `autopilot` or `/vibe` for that). It is a building block.

## Use when

- Multiple independent tasks can run at the same time.
- User says "ulw", "ultrawork", or "do these in parallel".
- You need to delegate work to multiple subagents in one shot.
- The user manages completion themselves (no persistence/verification loop needed).

## Do not use when

- The work must be guaranteed complete with reviewer sign-off. Use `ralph`.
- Vague-idea-to-PR. Use `autopilot` or `/vibe`.
- One sequential task with no parallelism. Just `Task` it directly or do it yourself.
- The user needs cross-session resume. Use `ralph` (which builds on this pattern).

---

## Execution policy

- Fire all independent agent calls in the same message. Never serialize independent work.
- Always pass the `model` parameter explicitly when delegating, even if "auto" would also work, so the routing is auditable.
- Use `run_in_background: true` for any `Bash` that runs longer than about 30 seconds (installs, builds, full test suites).
- Run quick checks (git status, file reads, small searches) in the foreground.
- Resolve intent and uncertainty before implementation. Explore first, ask only when still blocked.
- For non-trivial tasks, produce a small dependency graph with parallel waves before execution.
- Delegated-task reports stay concise: 1-line summary, files touched, verification status, blockers.

---

## Steps

1. **Ground intent.** Confirm whether the request is implementation, investigation, evaluation, or research. Do not start coding before that is clear.
2. **Gather context in parallel.** Use direct `Read`/`Grep`/`Glob` for quick lookups. Use `Task` (general-purpose, Haiku) for broader codebase exploration. Fire these in the same message when independent.
3. **Classify tasks by independence.** Mark each task as independent (can run in any wave) or dependent (waits for some prerequisite).
4. **Build a small task graph for non-trivial work.** Wave 1 = independent tasks. Wave 2 = depends only on wave 1. Etc. For each task, write a 1-line acceptance criterion.
5. **Route to model tiers:**
   - Simple lookups, type exports, doc tweaks, small fixes → Haiku.
   - Standard implementation, multi-file edits, focused refactors, complex multi-system analysis, architecture-changing refactors, hard debugging → **Codex `gpt-5.6-sol`** (`Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- '<task>' < /dev/null", run_in_background=true)`). Cost is not a constraint; Sol is the default for real implementation work regardless of complexity tier. Fall back to Claude `Task(general-purpose, model=sonnet|opus, ...)` only when the Codex CLI is unavailable/errors, or the task needs in-session tools Codex's sandbox cannot reach.
6. **Fire wave 1 simultaneously.** All independent tasks in the same message.
7. **Wait for dependencies to clear**, then fire wave 2. Repeat.
8. **Background long ops.** Builds, installs, full test suites use `Bash` with `run_in_background: true`. Track output with `TaskOutput`.
9. **Verify** when all waves complete:
   - Build/typecheck passes.
   - Affected tests pass.
   - Manual sanity check for implemented behavior, not just diagnostics.
   - No new errors introduced.

---

## Tool usage

- `Task(subagent_type="general-purpose", model="haiku", prompt=...)` for simple changes.
- `Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- '<task>' < /dev/null", run_in_background=true)` for standard and complex implementation work (default). The wrapper redirects stdin from /dev/null internally (a raw backgrounded `codex exec` without that redirect hangs indefinitely; verified 2026-07-13).
- `Task(subagent_type="general-purpose", model="sonnet"|"opus", prompt=...)` as the fallback for standard/complex work when Codex CLI is unavailable or the task needs in-session-only tools.
- `Bash(command=..., run_in_background=true)` for package installs, builds, test suites longer than ~30s.
- Foreground `Bash` and direct file tools for quick checks.

---

## Examples

### Good: three independent tasks fired together

```
Task(general-purpose, model=haiku, "Add missing type export for Config interface in src/types/config.ts")
Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- 'Implement the GET /api/users endpoint with input validation in src/api/users.ts' < /dev/null", run_in_background=true)
Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- 'Add integration tests for the auth middleware in tests/auth.test.ts' < /dev/null", run_in_background=true)
```

Independent tasks at appropriate tiers, all fired in one message. The trivial one stays on Haiku; the two substantive ones default to Sol.

### Good: background long op alongside foreground task

```
Bash("npm install && npm run build", run_in_background=true)
Task(general-purpose, model=haiku, "Update README.md with the new API endpoints")
```

The long build runs in background while the short doc update runs in the foreground.

### Bad: sequential execution of independent work

```
result1 = Task(general-purpose, "Add type export")   # wait
result2 = Task(general-purpose, "Implement endpoint")  # wait
result3 = Task(general-purpose, "Add tests")           # wait
```

These three are independent. Serializing them wastes wall-clock time.

### Bad: wrong tier

```
Task(general-purpose, model=opus, "Add a missing semicolon to line 42 of utils.ts")
```

Opus on a trivial fix burns tokens for no quality gain. Use Haiku.

---

## Stop conditions

- When invoked directly (not from `ralph`), apply lightweight verification only: build passes, tests pass, no new errors.
- For full persistence and architect verification, switch to `ralph`.
- If a task fails repeatedly across retries, surface the failure rather than retrying indefinitely.
- Escalate to the user when tasks have unclear dependencies or conflicting requirements.

---

## Final checklist

- [ ] Intent was grounded before implementation started.
- [ ] Independent tasks fired in parallel waves, not serialized.
- [ ] Each delegated task had an explicit model tier.
- [ ] Long ops ran in background, short ops in foreground.
- [ ] Build/typecheck passes after all waves complete.
- [ ] Affected tests pass.
- [ ] No new errors introduced.

---

## Relationship to other skills

```
ralph (persistence + verification loop)
  └── uses ultrawork as the parallel execution layer

autopilot (idea → plan, hands off to vibe for implementation)
vibe (plan → PR, uses parallel work patterns from ultrawork)
```

Ultrawork is a primitive. Ralph adds persistence and reviewer sign-off. Vibe/autopilot add the full lifecycle.

---
name: ralph
description: PRD-driven persistence loop that keeps working until every user story passes a reviewer, with handoff files so the next session can resume cleanly. Not for one-shot full pipelines (use /vibe) or pure QA cycling (use ultraqa).
user_invocable: true
argument-hint: "[--no-deslop] [--critic=architect|critic|codex] <task description>"
---

# Ralph Skill (/ralph)

## Purpose

A persistence loop. You write a PRD with user stories, you grind story-by-story until every one is `passes: true`, you get a reviewer sign-off, and only then do you stop. No "looks good", no "should work", no silent partial completion.

The original OMC ralph relied on a custom MCP runtime to survive across turns. This version uses plain Claude Code tools plus a `~/.claude/handoff/` directory so the next session can pick up exactly where the previous one stopped by reading the handoff file.

## Use when

- The task must actually be done with verification, not just attempted.
- User says "ralph", "don't stop", "must complete", "finish this", or "keep going until done".
- The work spans multiple turns and you need a survivable handoff.
- The task benefits from structured PRD-driven execution with reviewer sign-off.

## Do not use when

- The user wants a vague idea explored first. Use `autopilot` or `deep-interview`.
- The user wants to plan before committing. Use `plan` or the `/plan` command.
- One-shot fix with obvious scope. Just do it directly.
- The user only wants parallel implementation, no persistence. Use `ultrawork`.

---

## Files this skill owns

| File | Purpose |
|---|---|
| `.claude/ralph/prd.json` | User stories with acceptance criteria. Per-project. |
| `.claude/ralph/progress.txt` | Append-only learnings, files touched, decisions per iteration. |
| `~/.claude/handoff/ralph-<slug>.md` | Cross-session handoff so a fresh `claude --resume` (or new session) can pick up. |

Create `.claude/ralph/` if it does not exist. Slug the task name into kebab-case for the handoff filename.

---

## Phase 1: Bootstrap (first iteration only)

1. Read `.claude/ralph/prd.json`. If missing, create a scaffold:

```json
{
  "task": "<original task text>",
  "slug": "<kebab-case>",
  "stories": [
    {
      "id": "US-001",
      "title": "<short title>",
      "acceptanceCriteria": [
        "<concrete, testable criterion>",
        "<another>"
      ],
      "passes": false
    }
  ],
  "max_fix_loops": 3
}
```

2. **Refine the scaffold.** Auto-generated criteria like "Implementation is complete" are theater. Replace them with task-specific, verifiable criteria. Examples:
   - "Function `parseConfig` returns `null` on missing file"
   - "`npm test src/auth/` exits 0"
   - "File `docs/api/auth.md` exists and references the new `/login` endpoint"
3. Order stories by priority (foundations first, dependents last).
4. Write the refined PRD back.
5. Touch `.claude/ralph/progress.txt` if missing.
6. Write the initial handoff: see "Handoff format" below.

---

## Phase 2: Main loop

Each iteration:

1. **Pick next story.** Read `.claude/ralph/prd.json` and select the highest-priority story with `passes: false`.

2. **Implement the story.**
   - Default to Codex for the actual implementation: `Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- '<story + acceptance criteria>'")`. Cost is not a constraint; Sol is the fastest and most accurate option available. This is the primary path for standard and complex implementation work. If backgrounding this call (see below), append `< /dev/null` to the command.
   - Fall back to `Task` with Claude model tiers when the Codex CLI is unavailable/errors, or when the story needs in-session tools Codex's sandbox cannot reach (MCP connectors, browser automation, etc.):
     - Trivial lookup: `general-purpose` agent (Haiku default).
     - Standard implementation: `general-purpose` (Sonnet).
     - Complex multi-file refactor: `general-purpose` with explicit Opus routing if available.
   - For long ops (installs, builds, full test runs, or any backgrounded `codex exec`), use `Bash` with `run_in_background: true` and check back with `TaskOutput`. **Backgrounded raw `codex exec` needs a trailing `< /dev/null`, but the mandatory wrapper `codex-exec-bg.sh` already redirects stdin internally so no manual redirect is needed**: without it, the process inherits a stdin that never reaches EOF and hangs indefinitely waiting for "additional input from stdin" even though the prompt was already supplied as an argument (verified 2026-07-13: 6+ min hang without it, seconds with it).
   - If you discover a sub-task mid-implementation, add it as a new story in `prd.json`.

3. **Verify the story's acceptance criteria.** For each criterion, run the actual check (test, build, grep, file read) and confirm. If any criterion fails, keep working. Do not mark the story `passes: true`.

4. **Mark story complete.** Set `passes: true` in `prd.json`. Append to `progress.txt`:
   ```
   ## US-001 - <title> - <date>
   Files: src/auth/login.ts, src/auth/login.test.ts
   Implementation: <1-2 sentences>
   Learnings: <any pattern, gotcha, or codebase fact worth remembering>
   ```

5. **Update handoff file.** See "Handoff format" below. Always reflect current state, even partial progress.

6. **Check completion.** Are all stories `passes: true`? If not, loop to step 1. If yes, proceed to Phase 3.

---

## Phase 3: Reviewer sign-off

Pick the reviewer based on `--critic=...`:

- `--critic=architect` (default): use the `Task` tool with a general-purpose agent prompted as a senior architect reviewer.
- `--critic=critic`: use a general-purpose agent prompted as a harsh quality critic.
- `--critic=codex`: shell out to Codex via `Bash`:
  ```bash
  ~/.claude/scripts/codex-exec-bg.sh --skip-git-repo-check -- "<critic prompt>"
  ```
  The Codex prompt must include:
  1. The full list of acceptance criteria from `prd.json`.
  2. A directive to evaluate whether the implementation is **optimal** (not just correct: is there a simpler/faster/more maintainable path?).
  3. A directive to review related files (callers, callees, shared types), not only files directly modified.
  4. The list of files changed during the ralph session (read from `progress.txt`).

The reviewer must verify against the specific acceptance criteria in `prd.json`, not vague "does it look done".

**On approval, immediately proceed to Phase 4 in the same turn.** Do not pause to report the verdict. Reporting happens on rejection (Phase 5) or final exit (Phase 6).

---

## Phase 4: Mandatory cleanup pass

Unless the original prompt contained `--no-deslop`:

1. Invoke the `ai-slop-cleaner` skill via the `Skill` tool, scoped to the files changed during this ralph session (read from `progress.txt`).
2. Keep the scope bounded to those files. Do not broaden.
3. If the cleaner introduces follow-up edits, keep them inside that same scope.

Then re-verify:
- Run all relevant tests, build, lint for the session.
- Read the output. Confirm the post-cleanup regression run actually passes.
- If regression fails, roll back the cleanup edits or fix the regression, then rerun verification until it passes.

Only after this regression run passes (or `--no-deslop` was specified) is the work done.

---

## Phase 5: On rejection

If the reviewer rejects:

1. Fix every issue raised. Do not argue.
2. Re-verify acceptance criteria for any story the rejection impacted. If a story's criteria no longer hold, flip its `passes` back to `false` and loop back to Phase 2.
3. Re-run Phase 3 with the same reviewer.

Hard cap: 3 fix loops (configurable via `prd.json` `max_fix_loops`). Beyond that, stop and report the recurring issue to the user, write it to the handoff, and exit.

---

## Phase 6: Clean exit

When Phase 4 regression passes:

1. Update the handoff file with `status: done` and a summary of what was shipped.
2. Append a final entry to `progress.txt`.
3. Tell the user: "Ralph done. Stories: X/X passed. Files changed: <count>. Reviewer: <name>. Cleanup: <ran|skipped>. Handoff at `~/.claude/handoff/ralph-<slug>.md`."
4. Optionally suggest deleting `.claude/ralph/prd.json` if the task is fully finished.

---

## Handoff format

Path: `~/.claude/handoff/ralph-<slug>.md`

```markdown
---
mode: ralph
slug: <kebab-case>
status: active|done|blocked
updated: <ISO-8601>
session_hint: claude --resume
---

# Ralph handoff: <task title>

## Original task
<copy of the user request>

## PRD location
`.claude/ralph/prd.json`

## Progress
- Stories total: <N>
- Stories passed: <M>
- Current story: <ID or "-">
- Last iteration: <ISO date>

## Files touched (latest)
- <path>
- <path>

## Notes for next session
- <anything that would be lost without it: gotchas, partial state, pending sub-tasks>
- <if blocked: what's blocking, who/what to ask>

## Resume instructions
1. Read `.claude/ralph/prd.json` to see story state.
2. Read `.claude/ralph/progress.txt` for context from prior iterations.
3. Re-invoke `/ralph "<original task>"` (this skill picks up at the next failing story).
```

The handoff file is your survival mechanism. Update it every iteration. If a context compaction or session crash happens, the next session reads this file and knows exactly what to do.

---

## Execution policy

- Fire independent `Task` calls in the same message, never serialize independent work.
- Use `run_in_background: true` on installs, builds, full test suites.
- Always pass the `model` parameter explicitly when delegating to subagents.
- Deliver the full implementation. No scope reduction, no partial completion, no deleting tests to make them pass.
- Manual QA matters for implemented behavior, not just diagnostics.

---

## Stop conditions

- Stop and report when a fundamental blocker requires user input (missing credentials, unclear requirements, external service down). Write the blocker to the handoff first.
- Stop when the user says "stop", "cancel", or "abort". Update handoff with `status: blocked` and the reason.
- If the same fix loop recurs 3+ times, surface it to the user as a potential fundamental problem.
- Do not stop after Phase 3 approval. Phase 3 → Phase 4 → Phase 6 is a single chain inside one turn.

---

## Final checklist before claiming done

- [ ] Every story in `prd.json` has `passes: true`.
- [ ] Acceptance criteria are task-specific, not boilerplate.
- [ ] Fresh test run output shows passes.
- [ ] Fresh build output shows success.
- [ ] `progress.txt` records implementation details and learnings.
- [ ] Reviewer verification passed against the specific acceptance criteria.
- [ ] `ai-slop-cleaner` pass completed (or `--no-deslop` was set).
- [ ] Post-cleanup regression run passes.
- [ ] Handoff file at `~/.claude/handoff/ralph-<slug>.md` reflects final state.

---

## Examples

### Good: refined PRD criteria

```json
{
  "id": "US-002",
  "title": "Strip legacy --no-prd flag from prompt",
  "acceptanceCriteria": [
    "Legacy --no-prd text is removed from the working prompt before PRD bootstrap runs",
    "Ralph startup still creates or validates prd.json when legacy --no-prd text is present",
    "TypeScript compiles with no errors (npm run build)"
  ],
  "passes": false
}
```

### Bad: theater criteria

```json
"acceptanceCriteria": ["Implementation is complete", "Code compiles"]
```

These do not constrain anything. Replace them before grinding.

### Good: parallel delegation

Three independent tasks fired in one message. The default path shells out to Codex for the substantive work; the trivial one stays on Haiku since Sol would be overkill:

```
Task(general-purpose, model=haiku, "Add type export for UserConfig in src/types/user.ts")
Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- 'Implement caching layer in src/cache/api-cache.ts'")
Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- 'Refactor auth module in src/auth/ to support OAuth2'")
```

### Bad: claiming done without evidence

> "Implementation looks correct, tests should pass. Done."

No fresh test run, no story verification, no reviewer. This is exactly what ralph exists to prevent.

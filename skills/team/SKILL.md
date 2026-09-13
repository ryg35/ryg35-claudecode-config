---
name: team
description: Spawn N parallel subagents on a decomposed task list, optionally mixing Claude Task subagents with Codex CLI and Gemini CLI workers. Lightweight replacement for OMC team without the MCP runtime. Uses in-session Task subagents; for separate CLI worker processes read skills/team/references/omc-teams/SKILL.md.
user_invocable: true
argument-hint: "[N:executor|debugger|designer|writer|codex|gemini] [ralph] <task description>"
---
> 所在 (2026-09-13 統合): autopilot / deep-interview / codex-converge は `skills/plan/references/`、ultrawork / ultraqa は `skills/ralph/references/`、omc-teams / sciomc は `skills/team/references/` にある。名前で Skill 起動せず、その SKILL.md を Read して従う。


# Team Skill (/team)

## Purpose

Take one task, decompose it into N file-scoped or module-scoped subtasks, then run them in parallel through:

- Claude `Task` subagents (general-purpose at Haiku/Sonnet/Opus tiers), and
- optionally Codex CLI workers via `codex-exec-bg.sh`, and
- optionally Gemini CLI workers via `gemini -p`.

Then verify, fix if needed, and loop until done.

The original OMC team skill required a custom MCP runtime (`TeamCreate`, `TaskCreate`, `SendMessage`, etc.) that does not exist outside that plugin. This version uses plain Claude Code primitives: `Task` for Claude subagents, `Bash` for external CLI workers, files under `.claude/team/` for the task list.

## Use when

- Multi-file change that fans out cleanly into independent subtasks.
- User says `/team`, "team", "fan this out", or "in parallel".
- You want a mix of Claude + Codex + Gemini for different parts of the same task.
- You want the verify-and-fix loop on top of `ultrawork`-style parallelism.

## Do not use when

- One sequential task. Just delegate one `Task`.
- The task needs cross-session persistence and reviewer sign-off. Use `ralph` (which can wrap this skill).
- Vague-idea-to-PR. Use `autopilot` or `/vibe`.
- The user only wants an independent second opinion on a finished diff. Use `second-opinion`.

## Difference vs `second-opinion`

- `team` = parallel implementation across N subtasks.
- `second-opinion` = one independent reviewer (Codex) on a finished conclusion.

Both can coexist. Run `/team` to implement, then `/second-opinion` to cross-check the result.

---

## Arguments

```
/team [N:agent-type] [ralph] "<task description>"
```

- **N**: number of workers, 1-10. Optional. Defaults to auto-sizing based on how cleanly the task decomposes.
- **agent-type**: worker type for the `execute` stage:
  - `executor` (Claude `Task`, default), `debugger`, `designer`, `writer`, `test-engineer` : all routed through `general-purpose` with a stage-appropriate prompt.
  - `codex`: Codex CLI worker via `codex-exec-bg.sh`. Requires `codex` in `PATH`.
  - `gemini`: Gemini CLI worker via `gemini -p`. Requires `gemini` in `PATH`.
- **ralph**: optional. Wraps the team pipeline in `ralph`'s persistence loop. See "Team + Ralph composition" below.
- **task**: what to do.

### Examples

```
/team 5:executor "fix all TypeScript errors across src/"
/team 3:debugger "isolate the failing tests in tests/auth/"
/team 4:designer "rebuild the auth pages with the new design system"
/team "refactor the cache module with security review"
/team 2:codex "review the auth module for security issues and propose fixes"
/team ralph "build a complete REST API for user management"
```

---

## Pipeline

`team-plan → team-prd → team-exec → team-verify → team-fix (loop, bounded)`

### Stage 1: team-plan

1. Read the task. Optionally invoke `Task(general-purpose, model=haiku)` to explore the relevant subtree (file enumeration, dependency map).
2. Decompose into N subtasks. Each subtask:
   - File-scoped or module-scoped (to avoid write conflicts between workers).
   - Independent OR has clear dependency ordering.
   - Has a 1-line subject, a longer description, and 1-3 acceptance criteria.
3. Write the task list to `.claude/team/<slug>/tasks.json`:

```json
{
  "task": "<original task>",
  "slug": "<kebab-case>",
  "subtasks": [
    {
      "id": "T1",
      "subject": "Fix type errors in src/auth/",
      "description": "Run tsc --noEmit, fix every error in src/auth/login.ts, src/auth/session.ts, src/auth/types.ts.",
      "acceptanceCriteria": ["tsc --noEmit returns 0 for src/auth/"],
      "worker_type": "executor",
      "model": "sonnet",
      "blocked_by": [],
      "status": "pending",
      "owner": null
    }
  ],
  "max_fix_loops": 3,
  "fix_loops_used": 0
}
```

4. If you need a heavier planning pass, invoke the `plan` skill in consensus mode first, then use the resulting plan to decompose.

### Stage 2: team-prd (only if scope is ambiguous)

If acceptance criteria are unclear after stage 1, run one quick `Task(general-purpose, model=opus)` to crystallize them, or call `AskUserQuestion` to confirm scope. Otherwise skip this stage.

### Stage 3: team-exec

Run subtasks in parallel waves, respecting `blocked_by`.

**For each subtask, route by `worker_type`:**

- `executor` / `debugger` / `designer` / `writer` / `test-engineer` (implementation-flavored roles): default to Codex, since cost is not a constraint and Sol is the fastest/most accurate option for implementation work:
  ```
  Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- '<worker-preamble + task description + acceptance criteria + paths>' < /dev/null", run_in_background=true)
  ```
  Then collect output via `TaskOutput`. Fall back to Claude `Task(subagent_type="general-purpose", model="<sonnet|opus|haiku>", ...)` only when the Codex CLI is unavailable/errors, or the subtask needs in-session tools Codex's sandbox cannot reach.
- `codex` (explicit opt-in, same mechanism as above but named directly by the user):
  ```
  Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol --sandbox workspace-write -- '<full task prompt>' < /dev/null", run_in_background=true)
  ```
  Then collect output via `TaskOutput`.
- `gemini`:
  ```
  Bash("gemini -p '<full task prompt>'", run_in_background=true)
  ```
  Then collect output via `TaskOutput`.

**Worker preamble for Claude subagents:**

```
You are a worker on team "<slug>". Your subtask is T<N>.

Subtask: <subject>
Description: <description>
Acceptance criteria:
- <criterion 1>
- <criterion 2>

Rules:
- Work only on the files in your subtask scope.
- Do not run team / ultrawork / autopilot / ralph commands.
- Do not spawn further subagents.
- Use absolute file paths.
- Report what you changed, the verification you ran, and the result.
```

**Fire all independent workers in the same message.** When all parallel workers in the wave have reported, mark their statuses in `tasks.json`, then launch the next wave.

### Stage 4: team-verify

After all subtasks reach `completed` or `failed`:

1. Run `Task(general-purpose, model=sonnet)` as `verifier`. Prompt: "Verify subtasks T1-Tn against their acceptance criteria. For each, run the explicit check listed and report pass/fail with evidence."
2. For security-sensitive changes (auth, crypto, secrets) or changes touching 20+ files, additionally run:
   - `Task(general-purpose, model=opus)` as `code-reviewer`. Keep this on Claude/Opus deliberately, even though execution defaults to Sol: a reviewer sharing the implementer's model lineage under-catches its own blind spots (self-preference bias).
   - Optionally `codex-exec-bg.sh -m gpt-5.6-sol` as an independent critic (mirrors what `second-opinion` does, but scoped to the team output).

If everything passes, exit successfully.

If anything fails, transition to Stage 5.

### Stage 5: team-fix

1. Convert each failure into a fix subtask. Append to `tasks.json` with `worker_type: "debugger"` or `executor`, depending on defect type:
   - Type/build errors → `debugger`.
   - Logic bugs → `executor`.
2. Increment `fix_loops_used`.
3. If `fix_loops_used >= max_fix_loops`, stop and report. Do not loop forever.
4. Otherwise, return to Stage 3 with only the fix subtasks.

---

## Files this skill owns

| Path | Purpose |
|---|---|
| `.claude/team/<slug>/tasks.json` | Subtask list with status, owner, dependencies. |
| `.claude/team/<slug>/worker-outputs/T<N>.md` | Each worker's final report (optional, useful for debugging). |
| `.claude/team/<slug>/handoff.md` | Stage handoff notes (decisions, rejections, risks) when transitioning between stages. |

The handoff file matters most when a session compaction happens mid-pipeline. Always write decisions, rejected alternatives, and risks here before transitioning between stages.

---

## Stage handoff format

```markdown
## Handoff: <current-stage> → <next-stage>

- **Decided**: <key decisions made in this stage>
- **Rejected**: <alternatives considered and why>
- **Risks**: <risks for the next stage>
- **Files**: <key files created or modified>
- **Remaining**: <items left for the next stage>
```

Keep handoffs to 10-20 lines. Decisions and rationale, not full specs.

---

## Team + Ralph composition

When the user invokes `/team ralph "..."`, wrap the whole pipeline in `ralph`'s persistence loop:

1. Treat each subtask as a `ralph` user story (carry over its acceptance criteria).
2. Write `.claude/ralph/prd.json` from the team subtask list.
3. After `team-verify` passes, run `ralph`'s mandatory `ai-slop-cleaner` pass and reviewer sign-off.
4. The handoff file becomes `~/.claude/handoff/ralph-<slug>.md` (see the `ralph` skill).

This combination gives parallel implementation plus persistent cross-session resumability.

---

## Routing rules

1. The lead (this skill) picks worker types per subtask. The user's `N:agent-type` only sets the default for the `execute` stage.
2. Verification always uses at least Sonnet, even when the rest of the team is downgraded.
3. Codex CLI workers are good at: security review, structured refactors, optimal-path reviews. Use one if the user wants a second-AI opinion baked into the implementation.
4. Gemini CLI workers are good at: large-context tasks, UI work, design docs.
5. Always run `Task` subagents and CLI worker `Bash` calls **in the same message** for the same wave so they execute in parallel.

---

## Cancellation

If the user says "stop team", "cancel team", or "abort":

1. Stop launching new workers. In-flight `Task` subagents will finish their current step.
2. For background `Bash` workers (`codex`, `gemini`), call `TaskStop` on each.
3. Update `tasks.json` to mark in-flight tasks `cancelled`.
4. Write a final handoff: what completed, what was cancelled, what files were touched.

---

## Final checklist

- [ ] Task decomposed into file/module-scoped subtasks.
- [ ] Each subtask has explicit acceptance criteria.
- [ ] Independent workers fired in parallel waves (same message), dependent workers in subsequent waves.
- [ ] Verification stage ran against the actual acceptance criteria.
- [ ] Fix loop bounded by `max_fix_loops`.
- [ ] Handoff file written between stages so a fresh session can pick up.
- [ ] All background `Bash` workers either completed or explicitly killed.

---

## Gotchas

- **Worker prompts must be self-contained.** Each worker only sees the prompt you pass. Include all paths, all acceptance criteria, and the worker preamble.
- **Codex and Gemini CLI workers are one-shot.** They do not poll a task list and they do not coordinate. The lead reads their output and updates `tasks.json` itself.
- **File conflicts.** Two workers editing the same file at the same time is a race. Make subtask scopes mutually exclusive at the file level.
- **Background Bash output.** Capture it with `TaskOutput`, not by hoping it shows up.
- **Codex CLI workers hang without stdin redirection.** A backgrounded raw `codex exec` inherits a stdin that never reaches EOF and waits forever for "additional input from stdin". The mandatory wrapper `codex-exec-bg.sh` redirects stdin from /dev/null internally, so this is handled automatically; if you ever see a hang, verify the wrapper was actually used. Verified 2026-07-13 (6+ min hang raw, seconds with redirect).
- **Do not spawn this skill from inside a worker.** Workers are leaves, not new leads.

## 参照モード (references/ に統合したスキル)

| 読む先 | いつ |
|---|---|
| `references/omc-teams/SKILL.md` | OMC 流のチーム編成 (役割分担テンプレ) を使いたいとき |
| `references/sciomc/SKILL.md` | 調査だけを科学的手順 (仮説→実験→結論) で回し、要件化はしないとき |

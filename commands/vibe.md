---
description: Full autopilot development pipeline. One command to go from pull to PR. Usage - /vibe [task description]
---

# Vibe Coding - Full Autopilot Pipeline

Execute the complete development workflow from sync to ship with minimal human intervention.
Only pause at GATE points that require explicit user approval.

## Arguments

$ARGUMENTS: The task description (e.g., "Add user authentication", "Fix pagination bug")

Optional flags (prepend before task description):
- `from:<phase>` - Resume from a specific phase (e.g., `from:review Fix pagination bug`)
- `skip:<phases>` - Skip specific phases, comma-separated (e.g., `skip:docs,sync Fix pagination bug`)
- `dry-run` - Show the pipeline plan without executing

## Pipeline Overview

```
GATE 1: Sync       → fetch-pull + conflict-check
GATE 2: Plan       → reuse existing specs/<NNN>-<slug>/tasks.md (first) OR docs/plan/*.md (fallback) OR generate (last resort). User approval required.
AUTO 3: Implement   → tdd
AUTO 4: Review      → skills/code-review (6 Claude subagents + codex x2 in parallel, gates skipped in pipeline mode)
AUTO 5: Verify      → verify → build-fix (if needed) → smoke-test
AUTO 5.5: E2E       → e2e-runner (if UI/route changes detected)
AUTO 6: Deps        → dependency-check (if new packages added)
AUTO 7: Docs        → update-docs (docs + codemaps)
GATE 8: Ship        → changelog + commit-push + pr-create (user approval required)
```

- **GATE** = Pause and ask user for approval before proceeding
- **AUTO** = Execute automatically, only stop on unrecoverable errors

---

## Execution Instructions

### Phase 0: Initialize

Display the pipeline overview to the user:

```
VIBE PIPELINE: Starting
=======================
Task: [task description]

Phases:
  1. [GATE] Sync        - Fetch, pull, conflict check
  2. [GATE] Plan        - Reuse existing plan (preferred) or generate new
  3. [AUTO] Implement   - TDD: test → code → refactor
  4. [AUTO] Review      - skills/code-review: 6 subagents + codex x2
  5. [AUTO] Verify      - Build, types, lint, tests
  5.5 [AUTO] E2E        - Playwright journey tests (if UI/route changed)
  6. [AUTO] Deps        - Dependency audit (if applicable)
  7. [AUTO] Docs        - Update docs + codemaps
  8. [GATE] Ship        - Changelog, commit, push, PR

Starting Phase 1...
```

### Phase 1: Sync [GATE]

**Goal**: Ensure local branch is up-to-date and conflict-free.

1. Run `git status` to check current state
2. If there are uncommitted changes, ask user: stash or commit first?
3. Run `git fetch origin` to fetch remote updates
4. Check if behind remote. If so, run `git pull origin <branch>` to sync
5. Determine base branch (main or master) and store as `$BASE_BRANCH` for later phases
6. Run conflict-check against base branch (`$BASE_BRANCH`)
7. **If conflicts detected**: Show conflict report and ASK user how to proceed
8. **If clean**: Report status and proceed

```
Phase 1 COMPLETE: Sync
  Branch: feature/xxx
  Status: Clean, up-to-date
  Conflicts: None
```

**→ Compact context before next phase**

### Phase 2: Plan [GATE]

**Goal**: Resolve an approved implementation plan — **prefer an existing plan over generating a new one**.

This phase is **plan-first (opt-in generation)**. `/vibe` assumes the user has already run `/plan` and only falls back to generating a new plan when nothing usable exists. Rationale: the user's established workflow is plan-then-vibe; auto-generating a fresh plan every time wastes the prior thinking.

#### Step 2.1 — Discover existing plans

**Discovery order: `specs/` first, `docs/plan/` second, generate last.** A repo running SPEC-driven work keeps its work list in `specs/<NNN>-<slug>/tasks.md` (see Rule 6 in `~/.claude/rules/directory-conventions.md`). Globbing only `docs/plan/*.md` makes vibe ignore that work list and generate a duplicate plan, silently.

1. **Explicit path takes precedence.** If `$ARGUMENTS` contains a path matching `specs/*/tasks.md`, `specs/*/spec.md`, or `docs/plan/**.md` (or any `*.md` path that exists), treat it as the chosen source and jump to Step 2.3. A `specs/<NNN>-<slug>/` directory path counts too: its `tasks.md` is the source.
2. **Scan `specs/*/tasks.md` and `specs/*/spec.md` first.** If any SPEC set exists, it wins over everything in `docs/plan/`. Read its status (see 2a below), apply the same grouping and selection order as steps 3-4 below, and treat the paired `tasks.md` as the work list. If several SPEC sets qualify, present them via `AskUserQuestion` (highest `<NNN>` first). Then jump to Step 2.3.

2a. **Reading status from a SPEC set: frontmatter first, body line second.** Try `grep -m1 '^status:' spec.md`. SPEC sets written before the frontmatter convention have **no YAML frontmatter at all**; both sets that exist today (`chrome-extensions/repo-A/specs/001-side-preview-translation/`, `repo-B/specs/002-remote-mcp-and-cloudflare/`) start straight at `# spec.md ...`. For those, read the body line instead: `grep -m1 -E '^- (ステータス|状態):' spec.md`, and map its value onto the lifecycle (`確定` / `未着手` are pre-approval, treat as `backlog`; anything describing work underway is `in-progress`). If neither is present, treat the set as `backlog` and say so when presenting it, rather than skipping it silently. Never drop a SPEC set just because its status is unreadable: a skipped set makes vibe generate a duplicate plan, which is the exact failure this discovery order exists to prevent.
3. Otherwise, scan `docs/plan/*.md` (top-level only, excluding `docs/plan/done/` archives and `_template-*.md` files).
4. For each candidate, parse the frontmatter `status` field. Group as:
   - `active` (already approved, possibly mid-pipeline)
   - `backlog` (drafted but not yet approved)
   - other / no status (ignore)
5. **Selection order** (active wins over backlog; within each group, newest `mtime` wins):
   - If exactly one `active` plan → choose it.
   - Else if multiple `active` plans → present the list via `AskUserQuestion` and let the user pick.
   - Else if exactly one `backlog` plan → choose it.
   - Else if multiple `backlog` plans → present the list via `AskUserQuestion`.
   - Else (no candidates) → fall through to Step 2.2 (generate).

#### Step 2.2 — Generate plan (fallback only)

Only reached when Step 2.1 found nothing, neither a SPEC set under `specs/` nor a plan under `docs/plan/`.

1. Tell the user explicitly: `No existing plan found under docs/plan/. Generating a new one via planner. (Tip: run /plan first next time to keep vibe plan-first.)`
2. **Load project context**: Glob for `docs/**/*.md` and `.claude/project-context.json`. Read what exists (requirements, architecture, tech-stack, api-spec, schema, previous plans). Pass all discovered context to the planner agent.
3. Invoke the **planner** agent with the task description + project context.
4. The planner writes the result to `docs/plan/<verb-topic>.md` with `status: backlog` per the `/plan` skill conventions.

#### Step 2.3 — Present and approve

1. Read the chosen plan file and present:
   - Plan file path + current `status`
   - Requirements restatement
   - Implementation phases
   - Risk assessment
   - File list that will be modified
2. **WAIT for user confirmation** ("yes", "proceed", "go", or modifications).
3. Do NOT proceed until the user explicitly approves.
4. On approval:
   - If `status: backlog` → flip frontmatter to `status: active` before continuing.
   - If `status: active` → leave as-is (already approved previously).
   - Record the chosen plan path as `$PLAN_FILE` for Phase 3 / Phase 8.
   - **If the source is a SPEC set, `$PLAN_FILE` is `specs/<NNN>-<slug>/tasks.md`** (never `spec.md`, never `plan.md`). Phase 3 implements from `tasks.md`; `spec.md` supplies the FR / AS the tests must satisfy. Record the directory as `$SPEC_DIR` too.
   - The status flip lives in `spec.md` frontmatter for a SPEC set, in the plan file frontmatter otherwise.

```
Phase 2 COMPLETE: Plan approved
  Source: [spec: specs/<NNN>-<slug>/tasks.md (status: active) | existing: docs/plan/<name>.md (status: active) | generated: docs/plan/<name>.md]
  Phases: X implementation steps
  Files:  Y files to modify
  Risk:   LOW/MEDIUM/HIGH
```

**→ Compact context before next phase**

### Phase 3: Implement [AUTO]

**Goal**: Implement the feature using TDD methodology.

0. **Mark plan as in-progress**: If a plan file was approved in Phase 2, update its frontmatter from `status: active` to `status: in-progress` before invoking tdd-guide. Skip if no plan file exists.
1. Invoke the **tdd-guide** agent with the approved plan (`$PLAN_FILE`).
   - For a SPEC set, pass the whole `$SPEC_DIR`: `tasks.md` is the work list, and each task's `完了条件` plus the `FR-00N` / `AS-N` it traces to in `spec.md` are the RED/GREEN criteria. See the Input Source section of `~/.claude/agents/tdd-guide.md`.
2. For each implementation step:
   - Write failing tests (RED)
   - Implement minimal code (GREEN)
   - Refactor (IMPROVE)
   - Run tests to confirm passing
3. If tests fail after 3 attempts on the same issue:
   - **STOP and ask user for guidance**
4. Continue until all plan items are implemented

#### CRITICAL: Test Tampering Prohibited (applies to Phases 3, 4, 5)

Tests represent the specification. Passing tests by weakening them — not by fixing the production code — silently destroys the safety net. This is **strictly forbidden** in every AUTO phase.

**Allowed test edits**:
- RED phase: adding NEW failing tests that describe new required behavior
- Renaming test descriptions / `describe` labels (no assertion changes)
- Fixing a demonstrable bug in the test itself (typo in fixture, wrong import) — **must be flagged to the user in the phase report**

**Forbidden test edits in any AUTO phase**:
- Changing `expect(...)` / `assert(...)` values to match current (broken) output
- Commenting out or deleting assertions, `expect` blocks, or whole `it` / `test` cases
- Adding `test.skip` / `it.skip` / `xit` / `xdescribe` / `.only` / `test.fixme` to bypass failures
- Lowering coverage thresholds in `jest.config`, `vitest.config`, `package.json`, or equivalent
- Wrapping production calls in `try/catch` inside the test to swallow thrown errors
- Replacing real assertions with `expect(true).toBe(true)` or tautological checks
- Mocking the function under test to return the expected output

If tests cannot be made green by changing production code, **STOP and ask the user** — do not "fix" by touching tests.

```
Phase 3 COMPLETE: Implementation
  Tests written: X
  Tests passing: Y/X
  Coverage: Z%
  Files modified: N
```

**→ Compact context before next phase**

### Phase 4: Review [AUTO]

**Goal**: Quality and security review of everything Phase 3 implemented.

**MUST: read `~/.claude/skills/code-review/SKILL.md` and execute its Steps 0 to 8.**
Do not launch review agents from this file. The launch block used to live here
as a copy and drifted to 5 subagents while the real one had 6, so the reviewer
that checks comments and annotations never ran inside `/vibe`. One
implementation, no copies.

Parameters to pass in:
- `mode=pipeline` ... **both gates are skipped.** `/vibe` is a pipeline; the user
  gate is GATE 8 Ship. Do not call AskUserQuestion in Phase 4.
- target = local diff against `$BASE_BRANCH` from Phase 1
- fix scope = CRITICAL + HIGH auto-fixed (fixed policy for pipeline mode).
  MEDIUM only when the fix is obvious, LOW noted and skipped.
- `<entry-point>` for the skill's Step 8 logging = `vibe`

Two rules from this file bind inside the skill run:

- **Test tampering prohibition (Phase 3) applies to auto-fix.** Fixes target
  production code. Never edit, skip, or weaken a test to make a failure go away.
  A "flaky test" or "overly strict assertion" finding gets surfaced, not silenced.
- **Resilience Gate BLOCK stops the pipeline at the end of Phase 4.** Do not
  advance to Phase 5. Report it, require a manual fix, resume with
  `/vibe from:review`.

```
Phase 4 COMPLETE: Review
  Resilience Review:    [RAN | SKIPPED (trigger not met)]
  Findings:             X CRITICAL, Y HIGH, Z MEDIUM, W LOW
  Fixed:                N (CRITICAL + HIGH)
  Resilience Gate:      [PASS | WARN | BLOCK | N/A]
  Remaining:            Z (MEDIUM / LOW, noted)
```

**→ Compact context before next phase**

### Phase 5: Verify [AUTO]

**Goal**: Ensure everything builds and passes.

1. Run full verification:
   - Build check
   - Type check
   - Lint check
   - Full test suite
   - Console.log audit
2. If ANY check fails:
   - Invoke **build-error-resolver** agent to fix
   - Re-run verification
   - If still failing after 3 attempts: **STOP and ask user**
   - **Test tampering prohibition (Phase 3 rules) fully applies.** When test failures are encountered here, `build-error-resolver` must fix the production code — NOT edit tests, skip tests, or lower coverage thresholds. If a test genuinely contains a bug (typo, wrong fixture), flag it to the user before touching the test.
3. Run smoke test for additional confidence
4. Report verification status

```
Phase 5 COMPLETE: Verify
  Build:    OK
  Types:    OK
  Lint:     OK
  Tests:    X/Y passed, Z% coverage
  Smoke:    OK
```

#### Retry loop (added)

When Phase 5 Verify fails (build / type / lint / test / smoke), run the following bounded fix→re-verify loop. This is the same shape as the OMC Team Pipeline `team-fix → team-verify` loop, scoped to /vibe.

1. **Extract failure evidence**
   - Capture the failing assertion / test name / file:line / stderr from the verification run.
   - Snapshot the current diff: `git diff $BASE_BRANCH...HEAD > ~/.claude/handoff/vibe-retry-attempt-${ATTEMPT}.md` (write the diff, the failing output, and a one-line hypothesis into that file).

2. **Delegate the fix**
   - Default: `Task(subagent_type="executor")` with the failure evidence + diff snapshot path.
   - When the failure looks like a logic / runtime bug rather than a missing implementation, prefer `Task(subagent_type="debugger")`.
   - Pass the prior attempts' snapshots so the agent can see what was already tried (avoid repeating the same fix).

3. **Re-run Verify**
   - Run the same checks again (build → types → lint → tests → smoke), in the same order.
   - If PASS → exit the loop, continue to Phase 5.5.
   - If FAIL → increment attempt counter, go back to step 1.

4. **Bound the loop**
   - Max attempts = **3** by default. Configurable via `settings.json` key `omc.vibe.maxRetryAttempts`.
   - The attempt counter is persisted to `~/.claude/handoff/.vibe-retry-counter` (single integer, reset to `0` when a Verify run passes or when /vibe starts a new task).
   - Test tampering prohibition (Phase 3) fully applies inside the loop: fixes must target production code, not weaken or skip tests.

5. **Escalate on exhaustion**
   - After 3 failed attempts, **STOP**. Do not advance to Phase 5.5, Phase 6, Phase 7, or Phase 8 Ship.
   - Report to the user: `Phase 5 retry exhausted (3/3). Last error: <one-line summary>. Snapshots: ~/.claude/handoff/vibe-retry-attempt-{1,2,3}.md. Resume after manual fix with /vibe from:verify <task>.`

State lives in markdown handoff files (not memory). All snapshots persist until the next successful /vibe run for the same branch.

```
Phase 5 RETRY: attempt 2/3
  Last failure: src/auth/session.test.ts:47 expected 200, got 401
  Snapshot:     ~/.claude/handoff/vibe-retry-attempt-2.md
  Delegated to: executor
```

**→ Compact context before next phase**

### Phase 5.5: E2E [AUTO - conditional]

**Goal**: Update and run Playwright E2E tests for affected user flows — **only when the project already has E2E infrastructure**.

**Trigger**: This phase runs only when BOTH of the following are true:

1. **Existing E2E infrastructure** — at least one of these exists in the repo:
   - `playwright.config.ts` / `playwright.config.js` / `playwright.config.mjs`
   - `tests/e2e/` directory (non-empty)
   - `e2e/` directory (non-empty)
2. **UI/route change in diff** — `git diff $BASE_BRANCH...HEAD --name-only` includes any of `app/`, `pages/`, `src/app/`, `src/pages/`, `components/`, `src/components/`, `routes/`, `router/`, `playwright.config.*`, `tests/e2e/`, `e2e/`

```bash
# Condition 1: has existing E2E infra
HAS_E2E=$( { ls playwright.config.* 2>/dev/null; find tests/e2e e2e -maxdepth 1 -type f 2>/dev/null; } | head -n1 )

# Condition 2: UI/route changed
UI_CHANGED=$( git diff $BASE_BRANCH...HEAD --name-only | grep -E '^(src/)?(app|pages|components|routes|router)/|playwright.config|(tests/)?e2e/' | head -n1 )
```

Skip rules:
- `HAS_E2E` empty → `Phase 5.5 SKIPPED: no existing E2E setup (run /e2e to bootstrap)`
- `UI_CHANGED` empty → `Phase 5.5 SKIPPED: no UI/route changes`
- Either empty → SKIP, proceed to Phase 6

**Do NOT bootstrap Playwright in this phase.** Bootstrapping is the user's explicit choice, done via `/e2e` or `/project-init`. /vibe should never create E2E infra on its own.

**Execution** (only when both conditions are met):

1. Derive affected user flows from the plan (Phase 2) + changed route/component paths.
2. Launch `Agent(subagent_type="e2e-runner")` with:
   - Base branch diff (`git diff $BASE_BRANCH...HEAD`)
   - List of changed UI/route files
   - The approved plan from Phase 2
   - Instruction: "The project already has Playwright set up. Update or add specs under the existing `tests/e2e/` (or `e2e/`) directory for the affected flows using the existing config and Page Object Model conventions. Run only the affected spec files. Do not create `playwright.config.*` — it already exists."
3. The agent must:
   - Use the existing `playwright.config.*` — do not overwrite.
   - Create/update spec files following the repo's existing convention.
   - Run only the new/updated specs (`npx playwright test <paths>`), not the full suite (the full suite runs in CI).
   - Report per-spec pass/fail, flaky detection, and artifact paths.
4. On failure:
   - ≤2 flaky failures: re-run with `--retries=1`. If still failing, **STOP and ask user**.
   - Stale selector due to intentional UI change: update the spec (not product code) and re-run once.
   - Max 3 auto-fix attempts, then **STOP**.
5. Never run against production — enforce `process.env.NODE_ENV !== 'production'` in spec setup.

```
Phase 5.5 COMPLETE: E2E
  E2E Infra:     <path to playwright.config.*>
  Trigger:       <list of matched paths>
  Specs:         X new / Y updated
  Result:        A passed / B failed / C flaky
  Artifacts:     playwright-report/index.html
```

**→ Compact context before next phase**

### Phase 6: Deps [AUTO - conditional]

**Goal**: Check dependency health if new packages were added.

1. Check if `package.json` was modified:
   ```bash
   git diff HEAD --name-only | grep -q "package.json"
   ```
2. If yes: run dependency-check
3. If CRITICAL vulnerabilities found: **STOP and ask user**
4. If no changes to dependencies: skip this phase

```
Phase 6 COMPLETE: Deps
  Status: [SKIPPED / HEALTHY / X warnings]
```

**→ Compact context before next phase**

### Phase 7: Docs [AUTO]

**Goal**: Keep documentation in sync with code changes.

1. Launch the **doc-updater** agent once for `update-docs`. It covers docs and codemaps in a single pass
2. Only update docs that are affected by the changes
3. Don't create new docs unless the project already has a docs structure

```
Phase 7 COMPLETE: Docs
  Files updated: X
  Codemaps: refreshed
```

**→ Compact context before next phase**

### Phase 8: Ship [GATE]

**Goal**: Commit, push, and create PR with user approval.

1. Generate changelog entry (preview mode)
2. Show summary of everything done:

```
VIBE PIPELINE: Ready to Ship
=============================
Task: [task description]

Changes Summary:
  Files modified:    X
  Tests added:       Y
  Coverage:          Z%
  Security issues:   0
  Build status:      PASS
  Resilience Review: [RAN (Gate: PASS|WARN) | SKIPPED]

Changelog entry:
  [preview of changelog]

Commit message (proposed):
  feat: [description]

Target: origin/<branch> → PR against main
```

If Resilience Gate was `WARN`, explicitly list the HIGH findings in this summary and require the user to acknowledge them (include `[resilience-warn]` token in the prompt) before proceeding.
If Resilience Gate was `BLOCK`, the pipeline should NOT have reached here — Phase 4 would have halted. If it did reach here somehow, abort Phase 8 and return to Phase 4 for manual fix.

3. **ASK user**: "Ship it? (yes / edit message / abort)"
4. On approval:
   - Update CHANGELOG.md
   - **Archive the plan** (MANDATORY when a plan file was used):
     - Identify the plan file referenced in Phase 2 (typically `docs/plan/<name>.md`)
     - Update its frontmatter: `status: done` + `completed: YYYY-MM-DD` (today's date)
     - `mkdir -p docs/plan/done`
     - Move: `git mv docs/plan/<name>.md docs/plan/done/<name>.md`
     - If the plan body diverged from the original approach, append a short `## Completion Notes` section describing what changed
     - **If the source was a SPEC set**: flip `status: done` + `completed: YYYY-MM-DD` in `spec.md` frontmatter and leave `specs/<NNN>-<slug>/` exactly where it is. Do NOT `git mv` it into `docs/plan/done/`; the directory name is what pairs the spec with its branch.
     - If no plan file exists (e.g., `/vibe` was run without `/plan`), skip this archive step
   - Stage all changes (including the moved plan file)
   - Commit with approved message
   - Push to remote
   - Create PR via gh CLI
5. Report final PR URL

```
Phase 8 COMPLETE: Shipped!
  Commit: abc1234
  Branch: feature/xxx
  PR: https://github.com/org/repo/pull/123
```

---

## Error Handling

At any point, if an unrecoverable error occurs:

1. Show what phase failed and why
2. Show what was completed successfully
3. Suggest how to resume: `/vibe from:<next-phase> [task]`
4. Do NOT attempt to force past errors

```
VIBE PIPELINE: STOPPED at Phase 5
===================================
Error: Build failed - missing type for UserResponse

Completed: Sync ✓ Plan ✓ Implement ✓ Review ✓
Failed:    Verify ✗
Remaining: Deps, Docs, Ship

To resume after manual fix:
  /vibe from:verify [task description]
```

## Max Retry Policy

- Build/test failures: max 3 auto-fix attempts, then STOP
- Same error recurring: STOP after 2nd occurrence
- Agent timeout: STOP and report

## Context Management

- Run `/compact` (or strategic-compact equivalent) between each major phase
- This is CRITICAL to prevent context overflow during the full pipeline
- Each phase should start with a clean, focused context

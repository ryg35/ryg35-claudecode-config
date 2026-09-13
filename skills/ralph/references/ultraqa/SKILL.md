---
name: ultraqa
description: Autonomous QA cycling. Run a quality check (tests, build, lint, typecheck, or a custom predicate), diagnose failures with an architect-tier subagent, fix, repeat until the goal passes or you hit a stop condition. For PRD-driven multi-story persistence use ralph.
user_invocable: true
argument-hint: "[--tests|--build|--lint|--typecheck|--custom <pattern>] [--interactive]"
---

# UltraQA Skill (/ultraqa)

## Purpose

A focused quality-gate loop. You name the gate (tests, build, lint, typecheck, or a custom success predicate), this skill cycles run → diagnose → fix → repeat until the gate passes, the cycle cap is hit, or the same failure repeats so often that something is structurally wrong.

It is a sub-loop, not a competing top-level workflow. Use it under `ralph` or `team` for the verification/fix lane, or standalone after a code change to drive QA back to green.

## Use when

- After implementing a change, tests/build/lint/typecheck are failing and you want to iterate on them.
- User says "ultraqa", "qa cycle", "run until green", "fix until tests pass".
- The target behavior is known; the open question is whether an explicit quality predicate passes.

## Do not use when

- You don't yet know what the code should do. Use `plan` or `deep-interview` first.
- You need a full implementation loop with persistent PRD. Use `ralph`.
- You need a single one-shot fix attempt. Just delegate one `Task` directly.
- The test suite is fundamentally wrong (asserting the wrong thing). Fix tests deliberately, not by looping.

---

## Goal parsing

Parse the goal from arguments:

| Invocation | Goal | What to check |
|---|---|---|
| `/ultraqa --tests` | tests | Project's test command exits 0 |
| `/ultraqa --build` | build | Project's build command exits 0 |
| `/ultraqa --lint` | lint | No lint errors |
| `/ultraqa --typecheck` | typecheck | No type errors |
| `/ultraqa --custom "<pattern>"` | custom | A custom predicate (success regex in output, file present, exit code, etc.) |
| `/ultraqa --interactive` | interactive | Drive a running service / CLI interactively to verify behavior |

If no flag is given, treat the argument as a custom goal and infer the right command from project conventions (see CLAUDE.md, package.json scripts, Makefile, etc.).

---

## Cycle workflow

Cap at **5 cycles** by default.

### Each cycle

1. **RUN.** Execute the goal's command via `Bash`. For long runs, use `run_in_background: true` and `TaskOutput`. For interactive mode, drive the service via the appropriate tooling (Playwright, curl, expect-style scripts, etc.).
2. **CHECK.** Did the gate pass?
   - Yes → exit success. Report "ULTRAQA COMPLETE: Goal met after N cycles."
   - No → proceed to step 3.
3. **DIAGNOSE.** Spawn an architect-tier subagent:
   ```
   Task(subagent_type="general-purpose", model="opus", prompt="
   DIAGNOSE FAILURE:
   Goal: <goal type and predicate>
   Command: <command run>
   Output (truncated to relevant section): <stdout + stderr>
   Files in scope: <list>
   Provide: (1) root cause hypothesis, (2) specific files/lines to change, (3) the exact fix.
   ")
   ```
4. **FIX.** Apply the diagnosis:
   ```
   Task(subagent_type="general-purpose", model="sonnet", prompt="
   FIX:
   Issue: <architect diagnosis>
   Files: <affected files>
   Apply the fix precisely as recommended. Do not refactor adjacent code. Do not change behavior unrelated to the fix.
   ")
   ```
5. **REPEAT.** Increment cycle counter and go back to step 1.

---

## Exit conditions

| Condition | Action |
|---|---|
| Goal met | Exit success with cycle count and the green output. |
| Cycle 5 reached | Exit with diagnosis: "ULTRAQA STOPPED: Max cycles. Last diagnosis: ..." Show the user what blocks closing the gap. |
| Same failure 3x | Exit early: "ULTRAQA STOPPED: Same failure detected 3 times. Root cause hypothesis: ..." Loop is not making progress, something structural is wrong. |
| Environment error | Exit with the environment fault (missing dependency, port in use, missing binary). Do not try to autofix the environment. |
| User cancellation | Stop, report current cycle and last output. |

---

## Observability

Print one line per phase, per cycle. Example:

```
[ULTRAQA Cycle 1/5] Running tests via `npm test`...
[ULTRAQA Cycle 1/5] FAILED - 3 tests failing in src/auth/__tests__/login.test.ts
[ULTRAQA Cycle 1/5] Architect diagnosing...
[ULTRAQA Cycle 1/5] Diagnosis: missing mock for fetchSession in test setup
[ULTRAQA Cycle 1/5] Applying fix to tests/setup.ts
[ULTRAQA Cycle 2/5] Running tests via `npm test`...
[ULTRAQA Cycle 2/5] PASSED - 47/47 tests
[ULTRAQA COMPLETE] Goal met after 2 cycles
```

The user must always know which cycle they're on, what just ran, and what just failed.

---

## State

Keep state lightweight in memory for the duration of the loop:

```json
{
  "goal_type": "tests | build | lint | typecheck | custom | interactive",
  "goal_pattern": "<pattern if custom>",
  "cycle": 2,
  "max_cycles": 5,
  "failures": [
    "Cycle 1: 3 tests failing in src/auth/__tests__/login.test.ts (missing fetchSession mock)",
    "Cycle 2: 3 tests failing in src/auth/__tests__/login.test.ts (same failure)"
  ],
  "started_at": "<ISO>"
}
```

Use this to detect the "same failure 3x" stop condition: hash or fingerprint each failure (test names + first error line) and count repeats.

You do not need to persist this to disk for short loops. If you must survive across a session boundary, write the state to `.claude/ultraqa/state.json` and inspect it on resume.

---

## Important rules

1. **Diagnosis and fix are sequential.** A bad diagnosis with a wasted fix is worse than a delayed correct fix. Wait for the architect result before applying any change.
2. **Track every failure.** Detect when the same failure repeats. Three repeats = stop, do not loop forever.
3. **Bound your fix scope.** Each cycle fixes the failure the architect identified. No drive-by refactors, no scope creep.
4. **Clear output every cycle.** The user must be able to read the loop's log and know what happened.
5. **Clean up.** On exit, remove `.claude/ultraqa/state.json` if you created it.

---

## Relationship to other skills

| | ralph | ultraqa | team-verify |
|---|---|---|---|
| Owns acceptance criteria | yes (prd.json stories) | no (just the gate) | no (sub-stage of `team`) |
| Persistence across sessions | yes (handoff) | optional | within `team` lifecycle |
| Reviewer sign-off | yes (architect/critic/codex) | no | yes (verifier + reviewers) |
| Verify-fix loop | inside | the whole skill | inside |

If `ralph` is running, ultraqa is the verify/fix sub-loop. If `team` is running, ultraqa can drive `team-verify` → `team-fix`. Standalone, ultraqa is just "drive the gate back to green."

---

## Final checklist

- [ ] Goal predicate is explicit (which command, what success means).
- [ ] Each cycle's diagnosis is logged so the user can audit the path.
- [ ] Fix scope did not exceed the diagnosis.
- [ ] Loop exited on goal-met, max-cycles, same-failure-3x, or env-error. Not "I think it's done".
- [ ] State file (if any) was cleaned up on exit.

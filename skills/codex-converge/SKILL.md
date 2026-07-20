---
name: codex-converge
description: "Iterate Codex 3-way review (standard / adversarial / spec-diff) on a docs-only artifact until P1 findings stay at zero for two consecutive rounds. Use when the user says 'harden this plan', 'Codexで叩いて固めて', wants an ADR/RFC/plan reviewed to convergence before commit, or invokes /codex-converge. Complements /ralplan (Claude consensus) with an independent-reviewer loop."
user_invocable: true
argument-hint: "<target-path-or-glob> [--max-rounds N] [--severity P0|P1|P2] [--no-adversarial] [--no-spec-diff] [--auto]"
---

# Codex Converge Skill (/codex-converge)

## Purpose

Magnify a single artifact until an **independent reviewer** (Codex) stops finding P1+ defects.

This is **not** code review against a diff. This is **document magnification**: take one file (`docs/plan/*.md`, `docs/decisions/*.md`, `docs/api/*.md`, an RFC draft, anything), run Codex 3 ways in parallel, reflect the findings, and repeat until convergence.

Solves the problem where a single-pass Codex review misses defects that only surface after the easy ones are fixed.

## Use when

- A `docs/plan/*.md` is about to be merged and you want zero P1 surprises in implementation
- An ADR / RFC / spec document is load-bearing and benefits from adversarial reading
- You finished `/ralplan` (Claude internal consensus) and want an external reviewer pass
- A previous Codex review surfaced findings: you want to verify the fixes actually closed them, not just moved them

## Do not use when

- The artifact is code (use `/vibe` Phase 4 or `/review-prs`: they handle diff-based review with 7 Claude subagents + 3 Codex)
- The artifact is trivial (single-line fix, typo, formatting): one Codex pass is enough
- You haven't written the artifact yet: write a draft first, then converge

---

## Termination (the load-bearing decision)

Convergence stops on **any** of:

1. **CONVERGED**: P1 findings == 0 for **two consecutive rounds**.
   Two rounds, not one. Single-round zero misses flaky reviewer state where round N+1 surfaces a defect round N missed (observed in PR-B invite-gate plan: R11 was clean, R12 still flagged a P2).

2. **MAX-ROUNDS**: `--max-rounds` reached (default **15**).
   Output the current state with R-by-R P1 count table. User decides whether to ship or escalate.

3. **STUCK**: the **same** P1 finding (matched by file:line + first 80 chars of message) survives **3 consecutive rounds** despite reflection attempts.
   Escalate to the user with the finding + the 3 reflection attempts. Do not loop forever.

4. **USER STOP**: at the end of any round, `AskUserQuestion` offers "stop now" alongside "continue". (Skipped when `--auto` is set.)

`--severity` defaults to `P1`. `--severity P0` only counts CRITICAL findings (faster convergence, lower bar). `--severity P2` includes minor improvements (slower, higher bar).

---

## Flags

- `--max-rounds N`: round cap (default 15)
- `--severity P0|P1|P2`: minimum severity tracked for convergence (default P1)
- `--no-adversarial`: skip the adversarial review (2 reviewers instead of 3)
- `--no-spec-diff`: skip spec-diff review (use when target is not a plan with explicit acceptance criteria)
- `--auto`: skip per-round user confirmation. Still respects MAX-ROUNDS, STUCK, CONVERGED termination.

---

## Pipeline

### Phase 0: Pre-flight

1. Resolve target paths:
   - Single file (`docs/plan/xxx.md`) → that file
   - Glob (`docs/plan/*.md`) → fail loudly with "this skill operates on one file at a time, pick one"
2. Read the target file. Confirm it exists, is non-empty, and is a docs artifact (`.md`).
3. Determine which reviewers run:
   - **standard**: always on
   - **adversarial**: on unless `--no-adversarial`
   - **spec-diff**: on if target has acceptance criteria section (`grep -E '^## (Acceptance Criteria|Test|Scope)' <target>`); off otherwise. Override with `--no-spec-diff`.
4. Initialize round counter R=1 and convergence table.

### Phase 1: Round N

For each round:

1. **Snapshot** the target file content (used as input to all 3 reviewers in parallel)

2. **Launch reviewers** as background Bash processes (Codex 3 in parallel):

   ```bash
   BRANCH_SLUG=$(git branch --show-current 2>/dev/null | tr / -)
   TARGET_SLUG=$(basename "$TARGET" .md)
   R=<current-round>
   PID=$$

   STD_OUT=/tmp/codex-converge-${TARGET_SLUG}-r${R}-standard-${PID}.md
   ADV_OUT=/tmp/codex-converge-${TARGET_SLUG}-r${R}-adversarial-${PID}.md
   SPEC_OUT=/tmp/codex-converge-${TARGET_SLUG}-r${R}-spec-diff-${PID}.md

   # 1. Standard (background): review the target file as a self-contained document
   Bash(
     command="~/.claude/scripts/codex-exec-bg.sh review --ephemeral -o $STD_OUT 'Read $TARGET and review it as a self-contained document. Severity: P0 = blocking defect, P1 = must-fix before merge, P2 = should-fix, P3 = nice-to-have. For each finding, output: severity, file:line range, one-line headline, paragraph explanation. End with a one-line verdict: NO-ACTIONABLE-DEFECT or DEFECTS-FOUND. Do not invent findings to fill quota.'",
     run_in_background=true
   )

   # 2. Adversarial (background): only if --no-adversarial is NOT set
   Bash(
     command="~/.claude/scripts/codex-exec-bg.sh review --ephemeral -o $ADV_OUT 'Adversarial review of $TARGET. Read the document as a hostile reviewer: failure modes the author did not consider, racing conditions, security gaps, scope creep, contradiction between sections, hand-wavy claims without verification. Same severity scheme as standard review. Be specific (file:line + concrete attack/failure scenario).'",
     run_in_background=true
   )

   # 3. Spec-diff (background): only if target has acceptance-criteria-like sections
   Bash(
     command="~/.claude/scripts/codex-exec-bg.sh review --ephemeral -o $SPEC_OUT 'Spec-diff review of $TARGET. For each acceptance criterion / test case / phase deliverable in the document, check: (a) is it testable (can a reviewer write a yes/no check)? (b) is it scoped (does its definition contradict another section)? (c) is anything in ## Out of Scope leaking into implementation steps? Output MISSING-FROM-IMPL / AMBIGUOUS / OUT-OF-SCOPE-VIOLATION findings with same severity scheme. Verdict: SPEC-COHERENT or SPEC-DEFECTS.'",
     run_in_background=true
   )
   ```

3. **Wait for all 3 to complete**, then `Read` each output file.

4. **Parse findings**:
   - Extract severity (P0/P1/P2/P3) from each finding
   - Build a canonical key: `<file>:<line>:<first-80-chars-of-headline>` (used for STUCK detection across rounds)
   - Tag each finding with its source reviewer

5. **Count P1+** (or `--severity` floor) across all 3 reviewer outputs. Record in convergence table:

   | R | standard P1 | adversarial P1 | spec-diff P1 | total P1 | notes |
   |---|---|---|---|---|---|

6. **STUCK check**: any finding key whose round-counter is now 3? → escalate to user (Phase 3 STUCK).

7. **CONVERGED check**: total P1 == 0 in this round AND in previous round? → exit to Phase 4 CONVERGED.

8. **Reflect**: open the target file and apply the findings:
   - **P0** → fix immediately, no question
   - **P1** → fix; if the fix changes scope (e.g. adds a new section, modifies acceptance criteria), note "scope-affecting" in the convergence table
   - **P2** → fix if straightforward (< 5 lines), otherwise leave for next round (P2 doesn't count toward convergence by default)
   - **P3** → skip unless `--severity P2` is set
   - **OUT-OF-SCOPE-VIOLATION** (spec-diff) → STOP and escalate to user, do not silently expand scope

9. **User gate** (skipped when `--auto`): `AskUserQuestion`:
   - "Continue to round R+1" (default)
   - "Stop now and output convergence table"
   - "Stop and show the file diff so far"

10. **Increment R**, go to Phase 1.

### Phase 2: MAX-ROUNDS

Reached `--max-rounds`. Output:
- Final convergence table
- Remaining P1 findings (full text)
- File diff: original vs current
- A one-paragraph "what to do next" (usually: bump --max-rounds, narrow severity, or accept the remaining findings as known-residual)

### Phase 3: STUCK

Same P1 finding survived 3 reflection attempts. Output:
- The persistent finding (verbatim across 3 rounds, showing they really are the same)
- The reflection attempts (what was changed each round)
- Ask the user: "(a) override and continue, (b) accept as known limitation and exit, (c) abort"

### Phase 4: CONVERGED

P1 == 0 for two consecutive rounds. Output:
- Convergence table (R, severity counts per reviewer, scope-affecting marks)
- A 3-line summary suitable for the PR body: "Codex N rounds, P1=0 last 2 rounds, [scope changes / no scope changes]"
- File path of the converged target (ready to commit)

Do **not** auto-commit. The user runs `/commit-push` separately.

---

## Output artifacts

Every run leaves:

| Artifact | Location | Purpose |
|---|---|---|
| Per-round Codex outputs | `/tmp/codex-converge-<slug>-r<N>-{standard,adversarial,spec-diff}-<pid>.md` | Audit trail, debug |
| Convergence table | Printed to chat at end | PR body / commit message material |
| Updated target file | In-place edit on `<target>` | The artifact you converged |

`/tmp` files are ephemeral by OS policy. If you want to keep them, copy to `docs/.codex-converge-runs/<date>/` manually.

---

## Integration with /ralplan

When invoked from `/ralplan --with-codex`:

- `/ralplan` runs its Claude-internal Planner → Architect → Critic loop first (max 5 iter)
- After Critic APPROVE, `/ralplan` invokes `Skill("codex-converge")` with the plan file path
- `codex-converge` runs with `--auto` (no per-round user gate, since ralplan already gated approval at the Critic step)
- On CONVERGED → `/ralplan` continues to its ADR section + approval gate
- On STUCK or MAX-ROUNDS → `/ralplan` surfaces the convergence table to the user before its approval gate

Manual override: `/ralplan --with-codex --codex-max-rounds 20` passes through to codex-converge.

---

## Examples

### Single plan converge

```
/codex-converge docs/plan/feat-login-invite-gate.md
```

Default flags: max-rounds=15, severity=P1, all 3 reviewers. Per-round user gate ON.

### Headless converge (no user prompts)

```
/codex-converge docs/plan/feat-login-invite-gate.md --auto
```

Useful when chained from `/ralplan` or run overnight.

### Strict (P2 floor)

```
/codex-converge docs/decisions/0042-auth-rewrite.md --severity P2 --max-rounds 25
```

Used for ADRs where you want zero P2 before committing.

### Lightweight (P0 only, no adversarial)

```
/codex-converge docs/api/api-spec.md --severity P0 --no-adversarial --max-rounds 8
```

Fast pass for routine docs where you only want CRITICAL defects caught.

---

## Stop conditions (summary)

- CONVERGED (P1 = 0 × 2 consecutive rounds) → exit success
- MAX-ROUNDS → exit with remaining findings
- STUCK (same P1 × 3 rounds) → escalate
- USER STOP → exit at user's choice
- target file path invalid → exit immediately with error
- Codex CLI missing or auth failure → exit immediately, print install/auth instructions

---

## Final checklist

- [ ] target is a single file, not a glob (or globs are reduced to one file via interactive prompt)
- [ ] convergence table is printed at end (R, per-reviewer P1 count, total, notes)
- [ ] persistent findings (STUCK) include all 3 round excerpts so the user can verify
- [ ] OUT-OF-SCOPE-VIOLATION from spec-diff always escalates, never silently expands
- [ ] target file is edited in place (no temp copies left behind in repo)
- [ ] `/tmp/codex-converge-*` files are left for audit, not deleted
- [ ] no auto-commit, no auto-push

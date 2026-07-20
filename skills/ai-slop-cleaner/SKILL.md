---
name: ai-slop-cleaner
description: "Clean AI-generated code slop with a regression-safe, deletion-first workflow. Preserves behavior, locks it with tests first, then removes duplication, dead code, needless wrappers, and boundary leaks. Optional reviewer-only mode (--review) keeps writer and reviewer passes separate."
user_invocable: true
argument-hint: "[--review] <target files or directories>"
---

# AI Slop Cleaner (/ai-slop-cleaner)

## Purpose

Clean AI-generated code that works but feels bloated, repetitive, weakly tested, or over-abstracted, without drifting scope or changing intended behavior. Deletion-first. Behavior-locked.

The original code might pass tests but still be slop: duplicate helpers, pass-through wrappers, dead branches, weak regression coverage, generic visual defaults. This skill is the bounded cleanup workflow for that case.

## Use when

- User says "deslop", "anti-slop", or "AI slop".
- The request is to clean up or refactor code that feels noisy, repetitive, or over-abstract.
- A previous implementation pass (often from another AI session) left duplicate logic, dead code, wrapper layers, boundary leaks, or weak regression coverage.
- User wants a reviewer-only anti-slop pass via `--review`.
- Goal is simplification, not a new feature.

## Do not use when

- The task is mainly new feature work or a product change. Use the appropriate execution skill.
- User wants a broad redesign, not an incremental cleanup pass.
- The request is a generic refactor with no simplification or anti-slop intent.
- Behavior is too unclear to protect with tests or a concrete verification plan. Stop and clarify first.

## Relationship to `simplify`

Both are cleanup passes. Use `simplify` for the user's existing `/simplify` command (small / focused). Use `ai-slop-cleaner` for the bounded post-implementation cleanup that ralph wires in by default, especially when slop is visible (duplicate helpers, dead branches, defaulted UI, weak tests).

---

## Execution posture

- Preserve behavior unless the user explicitly asks for behavior changes.
- Lock behavior with focused regression tests first whenever practical.
- Write a cleanup plan before editing code.
- Prefer deletion over addition.
- Reuse existing utilities and patterns before introducing new ones.
- Avoid new dependencies unless the user explicitly requests them.
- Keep diffs small, reversible, and smell-focused.
- Stay concise and evidence-dense: inspect, edit, verify, report.
- Treat new user instructions as local scope updates without dropping earlier non-conflicting constraints.

## Scoped file-list usage

This skill can be bounded to an explicit file list when the caller knows the safe cleanup surface.

- Good fit: `/ai-slop-cleaner skills/ralph/SKILL.md skills/ai-slop-cleaner/SKILL.md`
- Good fit: a ralph session handing off only the files changed in that session.
- Preserve the regression-safe workflow even when the scope is a short file list.
- Do not silently expand a changed-file scope into broader cleanup work unless the user explicitly asks.

## Ralph integration

`ralph` invokes this skill as a bounded post-review cleanup pass:

- The cleaner runs in standard mode (not `--review`).
- The cleanup scope is the ralph session's changed files only.
- After the cleanup pass, ralph re-runs regression verification before completion.
- `--review` is the reviewer-only follow-up, not the default ralph integration path.

---

## Review mode (`--review`)

`--review` is a reviewer-only pass after cleanup work is drafted. It exists to keep writer and reviewer separate for high-impact cleanup.

- **Writer pass:** make the cleanup changes with behavior locked by tests.
- **Reviewer pass:** inspect the cleanup plan, changed files, and verification evidence.
- The same pass must not both write and self-approve high-impact cleanup.

In review mode:

1. Do **not** start by editing files.
2. Review the cleanup plan, changed files, and regression coverage.
3. Check for:
   - Leftover dead code or unused exports.
   - Duplicate logic that should have been consolidated.
   - Needless wrappers or abstractions that still blur boundaries.
   - Missing tests or weak verification for preserved behavior.
   - Cleanup that appears to have changed behavior without intent.
4. Produce a reviewer verdict with required follow-ups.
5. Hand needed changes back to a separate writer pass.

---

## Workflow

### 1. Protect current behavior first

- Identify what must stay the same.
- Add or run the narrowest regression tests needed before editing.
- If tests cannot come first, record the verification plan explicitly before touching code.

### 2. Write a cleanup plan before code

- Bound the pass to the requested files or feature area.
- List the concrete smells to remove.
- Order the work from safest deletion to riskier consolidation.

### 3. Classify the slop before editing

| Smell | What it looks like |
|---|---|
| Duplication | Repeated logic, copy-paste branches, redundant helpers. |
| Dead code | Unused code, unreachable branches, stale flags, debug leftovers. |
| Needless abstraction | Pass-through wrappers, speculative indirection, single-use helper layers. |
| Boundary violations | Hidden coupling, misplaced responsibilities, wrong-layer imports or side effects. |
| Missing tests | Behavior not locked, weak regression coverage, edge-case gaps. |
| UI/design defaults | Generic visual patterns that make an AI-built interface feel unreviewed. |

### UI/design reviewer checklist

Use these as review prompts, not absolute bans. Keep intentional brand, accessibility, density, or design-system choices when they have a clear rationale.

- **Japanese readability:** flag body text around 11-12px; Japanese body copy generally needs 14px+ unless a validated dense-data exception applies.
- **Shadow restraint:** question box shadows on every surface, logo, background, card, or icon. Keep shadows only where they clarify elevation or interaction.
- **Content hierarchy:** remove repetitive eyebrow/title/description/extra `<p>` stuffing when the title already carries the message. Avoid generic emoji badges unless they are part of product voice.
- **Palette rationale:** challenge default AI blue/purple palettes (Tailwind-like `#3B82F6`) when no brand or system rationale exists.
- **Layout rhythm:** avoid overly perfect 3- or 4-column uniform grids when the product context benefits from rhythm, emphasis, asymmetry, or varied card weights.
- **Gradient restraint:** tone down extreme gradients unless the brand deliberately owns that visual language.

### 4. Run one smell-focused pass at a time

- **Pass 1:** Dead code deletion.
- **Pass 2:** Duplicate removal.
- **Pass 3:** Naming and error-handling cleanup.
- **Pass 4:** Test reinforcement.

Re-run targeted verification after each pass. Do not bundle unrelated refactors into the same edit set.

### 5. Run the quality gates

- Keep regression tests green.
- Run the relevant lint, typecheck, and unit/integration tests for the touched area.
- Run existing static or security checks when available.
- If a gate fails, fix the issue or back out the risky cleanup. Do not force it through.

### 6. Close with an evidence-dense report

Always report:

- **Changed files.**
- **Simplifications** (what was deleted, what was consolidated).
- **Behavior lock / verification run** (which tests / commands you ran, with output).
- **Remaining risks** (anything not cleaned, anything that needs human review).

---

## Usage

- `/ai-slop-cleaner <target>`: standard cleanup pass.
- `/ai-slop-cleaner <target> --review`: reviewer-only follow-up.
- `/ai-slop-cleaner <file-a> <file-b> <file-c>`: explicit file list.
- From ralph: cleaner runs on the ralph session's changed files only, then ralph re-runs regression verification.

---

## Good fits

- "deslop this module: too many wrappers, duplicate helpers, dead code"
- "cleanup the AI slop in src/auth and tighten boundaries without changing behavior"

## Bad fits

- "refactor auth to support SSO". that's a feature build, not cleanup.
- "clean up formatting" : use prettier/eslint, not this skill.

---

## Final checklist

- [ ] Behavior locked by tests (or explicit verification plan) before any edit.
- [ ] Cleanup plan written before code changes.
- [ ] Each pass focused on one smell category.
- [ ] Quality gates re-run after each pass.
- [ ] No new dependencies introduced unless explicitly requested.
- [ ] Final report includes changed files, simplifications, verification run, remaining risks.

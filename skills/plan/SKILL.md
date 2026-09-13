---
name: plan
description: "Planning skill with three modes: direct (single-pass plan), consensus (Planner / Architect / Critic loop with RALPLAN-DR deliberation), and review (Critic-only evaluation of an existing plan). Complements the simpler /plan command when the task warrants multi-perspective validation."
user_invocable: true
argument-hint: "[--direct|--consensus|--review] [--interactive] [--deliberate] <task description>"
---
> 所在 (2026-09-13 統合): autopilot / deep-interview / codex-converge は `skills/plan/references/`、ultrawork / ultraqa は `skills/ralph/references/`、omc-teams / sciomc は `skills/team/references/` にある。名前で Skill 起動せず、その SKILL.md を Read して従う。


# Plan Skill (/plan)

## Purpose

Produce a plan you would actually trust to hand to an executor. Three modes:

| Mode | When | Output |
|---|---|---|
| `--direct` (default for detailed requests) | The request is already specific. | One plan file. |
| `--consensus` (alias: "ralplan") | The decision is load-bearing or contested. | Plan after Planner → Architect → Critic iterate to agreement, with an ADR. |
| `--review` | An existing plan needs a quality gate. | Verdict: APPROVE / ITERATE / REJECT with specific feedback. |

`--consensus` adds **RALPLAN-DR** structured deliberation: explicit principles, decision drivers, viable options with pros/cons, and (in `--deliberate` mode) a pre-mortem plus an expanded test plan covering unit / integration / e2e / observability.

## Relationship to other planning tools

| Tool | When |
|---|---|
| `/plan` command (single-pass planner agent) | Default for "make me a plan". Faster, lighter. |
| `plan` skill `--direct` | Same as `/plan`. Use the command unless you specifically want the skill flow. |
| `plan` skill `--consensus` | Load-bearing decisions: architecture, framework choice, schema, public API breakage. |
| `plan` skill `--review` | "I have a plan, tell me if it holds up." |
| `autopilot` | "I have a vague idea, walk me from idea to approved plan." Includes a deep-interview + prior-art pass that this skill skips. |
| `deep-interview` | "I have one vague sentence, drive out ambiguity by Socratic Q&A." |
| `second-opinion` | "I already concluded, give me an external reviewer diff." Not the same as a plan review. |

If the user only said "plan this", default to the `/plan` command, which is the standard single-pass planner. Use this skill when the user explicitly asks for consensus, ralplan, review, or deliberation.

## Use when

- The user says "plan this with consensus", "ralplan", "deliberate plan", "review this plan".
- The decision will be hard to reverse (auth/security, schema migration, public API, destructive change).
- Multiple viable options exist and the user wants them weighed explicitly.

## Do not use when

- The task is a small focused fix with obvious scope. Just do it.
- The user wants autonomous end-to-end execution. Use `ralph` or `vibe`.
- The user wants a quick single-pass plan. Use the `/plan` command directly.

---

## Mode selection

- If args include `--review` or "review this plan" → review mode.
- Else if args include `--consensus` or "ralplan" → consensus mode.
- Else if args include `--direct` → direct mode.
- Else, classify the request:
  - Detailed (specific files, clear acceptance criteria) → direct.
  - Vague or broad → recommend `autopilot` or `/plan` command instead, then continue with direct mode if the user insists.

---

## Direct mode

1. **Quick analysis.** `Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol ...")` for a brief requirements review when the request touches multiple subsystems. Fall back to `Task(general-purpose, model=opus)` if the Codex CLI is unavailable.
2. **Create plan.** Use the `/plan` command's template structure (`docs/plan/<verb-topic>.md` with `_template-feature.md` / `_template-fix.md` / `_template-investigate.md`). See `~/.claude/templates/plan/` for masters.
3. **Frontmatter:** `status: backlog` + `branch: <derived>`. Follow `~/.claude/skills/directory-conventions/SKILL.md`.
4. Stop. Mark `pending approval`. Do not auto-execute.

---

## Consensus mode (`--consensus` / "ralplan")

**Boundary:** Planning module. Inspect context, draft / update plan artifacts only. Mark every artifact `pending approval` unless the user has explicitly approved execution this turn. Do not edit source files, run mutating shell commands, commit, push, open PRs, or invoke execution skills before approval.

**Deliberate trigger:** `--deliberate` flag, or the request explicitly signals high risk (auth/security, data migration, destructive/irreversible changes, production incident, compliance/PII, public API breakage).

### Steps

1. **Planner** creates the initial plan and a **RALPLAN-DR summary**:
   - **Principles** (3-5).
   - **Decision Drivers** (top 3).
   - **Viable Options** (>= 2) with bounded pros/cons each.
   - If only one viable option remains, an explicit **invalidation rationale** for the rejected alternatives.
   - In `--deliberate`: a **pre-mortem** (3 failure scenarios) and an **expanded test plan** (unit / integration / e2e / observability).

   Delegate: `Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol -- '<planner prompt + RALPLAN-DR requirements>'")`. Cost is not a constraint for this pass; Sol is the default because it is the strongest available model for plan construction. Fall back to `Task(general-purpose, model=opus, ...)` if the Codex CLI is unavailable.

2. **User feedback** *(only with `--interactive`)*: Present the draft plan plus the Principles / Drivers / Options summary via `AskUserQuestion`. Options:
   - Proceed to review.
   - Request changes.
   - Skip review (jump to step 6).

   Without `--interactive`, skip this step and proceed automatically.

3. **Architect review.** `Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol -- '<architect prompt>'")`. Fall back to `Task(general-purpose, model=opus, ...)` if the Codex CLI is unavailable.
   - Must include: the strongest steelman antithesis against the favored option, at least one real tradeoff tension, a synthesis path when possible.
   - In `--deliberate`, must explicitly flag principle violations.
   - **Wait for this to complete before step 4.** Do not parallelize steps 3 and 4.

4. **Critic review.** `Task(critic, model=opus, prompt=<critic prompt>)`. **Always Claude Opus, never Sol**, even though Planner/Architect default to Sol: the Critic is the independent check on work Sol just produced, and same-model (or same-vendor-lineage) self-review under-catches the errors that model's own blind spots produce. Keeping Critic on a different model lineage than Planner/Architect is the point, not an inconsistency.
   - Must verify: principle-option consistency, fair alternative exploration, risk mitigation clarity, testable acceptance criteria, concrete verification steps.
   - Must reject shallow alternatives, driver contradictions, vague risks, or weak verification.
   - In `--deliberate`, must reject missing or weak pre-mortem and missing or weak expanded test plan.

5. **Re-review loop (max 5 iterations).** If Critic returns anything other than APPROVE:
   a. Collect Architect + Critic feedback.
   b. Pass to Planner to produce a revised plan.
   c. Return to step 3.
   d. Return to step 4.
   e. Repeat until APPROVE or 5 iterations are reached.
   f. If max reached, present the best version with a note that consensus was not reached.

6. **Apply improvements.** Merge accepted suggestions into the plan file. Add an **ADR** section: Decision / Drivers / Alternatives considered / Why chosen / Consequences / Follow-ups. Write a brief changelog at the end recording what was applied.

6.5. **Codex convergence (only with `--with-codex`).** Read `references/codex-converge/SKILL.md` and follow it against the plan file in `--auto` mode (Claude consensus has already gated approval at step 4 Critic APPROVE; per-round user gates would duplicate that). Forward `--codex-max-rounds N` if supplied. Termination: P1 = 0 for two consecutive rounds, or max-rounds, or STUCK escalation. On STUCK / MAX-ROUNDS, surface the convergence table before continuing to step 7. Without `--with-codex`, skip this step entirely.

7. **Approval gate.** Mark `pending approval`.
   - With `--interactive`, present options via `AskUserQuestion`:
     - Approve and hand off to `team` for parallel execution (recommended for large tasks).
     - Approve and hand off to `ralph` for sequential execution with verification.
     - Approve, but compact context first (recommended when context is heavily used).
     - Request changes.
     - Reject.
   - Without `--interactive`, output the final plan marked `pending approval` and stop.

8. **On approval** *(only with `--interactive`)*:
   - "Approve via team" → invoke `Skill("team")` with the plan path as context.
   - "Approve via ralph" → invoke `Skill("ralph")` with the plan path as context.
   - "Approve after compact" → invoke `Skill("strategic-compact")` first, then `Skill("ralph")`.
   - Never implement directly inside the planner.

### Provider overrides

Codex (`gpt-5.6-sol`) is the **default** for Planner and Architect (see steps 1 and 3). Critic stays on Claude Opus by default (see step 4 rationale).

- `--architect claude` → force the Architect pass back to `Task(general-purpose, model=opus, prompt=<architect prompt>)` instead of Codex.
- `--critic codex` → opt the Critic pass into Codex too (`Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol -- '<critic prompt>'")`), sacrificing model-lineage independence for speed. Only use this when the plan is low-risk and a fast turnaround matters more than an independent check.
- `--planner claude` → force the Planner pass back to Claude Opus.

If the Codex CLI is missing or errors, note the fallback and continue with the Claude default for that pass.

### Codex convergence (`--with-codex`)

After step 6 (Apply improvements + ADR), opt-in to an independent Codex review loop:

- Trigger: `--with-codex` flag explicitly. Off by default; Claude consensus alone is enough for most plans.
- Mechanism: Read `references/codex-converge/SKILL.md` and follow it runs Codex 3 ways (standard + adversarial + spec-diff) in parallel against the plan file, reflects findings, repeats. Terminates on P1 = 0 for two consecutive rounds.
- Pass-through: `--codex-max-rounds N` (default 15), `--severity P0|P1|P2` (default P1).
- When to use: load-bearing decisions (auth/security, schema migration, public API, destructive change), or when you want an external-reviewer signal before commit.

---

## Review mode (`--review`)

1. Read the plan file (`docs/plan/<name>.md` or path supplied in args).
2. Run a single Critic pass: `Task(general-purpose, model=opus, prompt=<critic-of-existing-plan prompt>)`.
3. Return verdict: **APPROVED**, **REVISE** (with specific feedback), or **REJECT** (replanning required).
4. Do not modify the plan automatically. Hand verdict back to the user.

---

## Plan output format

Every plan, regardless of mode, includes:

- Requirements Summary.
- Acceptance Criteria (testable, concrete).
- Implementation Steps (with file references).
- Risks and Mitigations.
- Verification Steps.

Consensus and ralplan additionally include:

- **RALPLAN-DR summary** (Principles / Decision Drivers / Options).
- **ADR** (Decision / Drivers / Alternatives considered / Why chosen / Consequences / Follow-ups).

`--deliberate` additionally includes:

- **Pre-mortem** (3 failure scenarios).
- **Expanded test plan** (unit / integration / e2e / observability).

Save plans to `docs/plan/<verb-topic>.md` (kebab-case) per `~/.claude/skills/directory-conventions/SKILL.md`. Frontmatter is `status` and `branch` only. Consensus plans can also live there with the ADR section embedded.

---

## Tool usage

- `AskUserQuestion` for preference questions (scope, priority, timeline, risk tolerance) when `--interactive` is set.
- Plain text only for questions that need a specific value (port number, file name, free-form clarification).
- `Task(general-purpose, model=haiku)` to explore the codebase before asking the user about it. Answer your own codebase questions first.
- `Bash("~/.claude/scripts/codex-exec-bg.sh -m gpt-5.6-sol ...")` for planner and architect passes (default). `Task(critic, model=opus)` for the critic pass (default, kept independent of Sol).
- `Task(general-purpose, model=opus)` as the fallback for planner/architect if Codex CLI is unavailable, or when `--architect claude` / `--planner claude` is passed.
- **Consensus mode agent calls are sequential.** Always wait for the Architect result before issuing the Critic call.
- Never invoke an execution skill before explicit approval is captured.

---

## Stop conditions

- Stop interviewing once requirements are clear enough to plan. Do not over-interview.
- Consensus mode stops after 5 iterations without APPROVE. Present the best version with a note.
- Without `--interactive`, consensus mode outputs the final plan marked `pending approval` and stops.
- If the user says "just do it" or "skip planning" without naming an execution path, output the current plan as `pending approval` and ask for explicit execution approval via `AskUserQuestion`. Do not auto-invoke `ralph` / `team`.
- Escalate to the user when there are irreconcilable trade-offs that require a business decision.

---

## Final checklist

- [ ] Plan has testable acceptance criteria (90%+ concrete).
- [ ] Plan references specific files/lines where applicable (80%+ claims).
- [ ] All risks have mitigations identified.
- [ ] No vague terms without metrics ("fast" → "p99 < 200ms").
- [ ] Plan saved to `docs/plan/` per directory conventions.
- [ ] In consensus mode: RALPLAN-DR summary includes 3-5 principles, top 3 drivers, >= 2 viable options (or explicit invalidation rationale).
- [ ] In consensus mode final output: ADR section included.
- [ ] In `--deliberate`: pre-mortem (3 scenarios) and expanded test plan included.
- [ ] In `--interactive`: user explicitly approved before any execution.
- [ ] Without `--interactive`: plan output marked `pending approval` only, no auto-execution.

---

## Examples

### Good: adaptive interview that explores first

```
Planner (you): [Task(general-purpose, model=haiku, "find authentication implementation in this repo")]
Planner: [receives: "Auth is in src/auth/ using JWT with passport.js, with refresh tokens in src/auth/refresh.ts"]
Planner: "I see this repo uses JWT with passport.js. For the new feature, should we extend the existing auth or add a separate flow?"
```

Answer your own codebase question first, then ask an informed preference question.

### Good: one focused question at a time

```
Q1: "What is the main goal?"
A1: "Improve performance."
Q2: "Latency or throughput?"
A2: "Latency."
Q3: "p50 or p99?"
```

Each question builds on the previous answer.

### Bad: asking the user something you could look up

```
Planner: "Where is authentication implemented in your codebase?"
User: "Uh, somewhere in src/auth I think?"
```

Run an explore pass first.

### Bad: batching questions

```
"What is the scope? And the timeline? And who is the audience?"
```

Three questions at once produce shallow answers.

## 参照モード (references/ に統合したスキル)

| 読む先 | いつ |
|---|---|
| `references/autopilot/SKILL.md` | 1〜2文の曖昧なアイデアを、要件・先行事例・実装計画まで一気に通したいとき |
| `references/deep-interview/SKILL.md` | 曖昧さを1問ずつ潰すソクラテス式インタビューが要るとき |
| `references/codex-converge/SKILL.md` | docs のみの成果物を Codex 3本レビューで P1=0 が2連続するまで叩くとき |

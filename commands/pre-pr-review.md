---
description: Multi-agent parallel review on local diff before PR creation. Equivalent to review-prs Step 2 on local branch changes.
argument-hint: [--base=main] [--focus=comments|tests|errors|types|code|simplify|resilience]
---

# Pre-PR Review — Multi-Agent Review on Local Diff

Run a `review-prs` Step 2 equivalent multi-agent parallel review against the current branch's changes before creating a PR.

**Input**: $ARGUMENTS

---

## MANDATORY RULES

- **Step 2 subagent launches are MUST. Omission or self-substitution is prohibited.**
- Subagents are launched via the Agent tool's `subagent_type` parameter. The main agent must never perform review work itself.
- **Step 2 Codex review is also MUST. Codex is invoked directly via `~/.claude/scripts/codex-exec-bg.sh` (NOT via subagent, NOT via raw `codex exec` — the pre-tool-enforcer hook blocks raw calls).**
- **During full review, all 6 Claude subagents must be launched in parallel, and 2 Codex reviews run as background Bash processes.** When `--focus` is specified, follow the mapping table.
- **Resilience review (sre-engineer + chaos-engineer + error-detective) runs only when: (a) `--focus=resilience` is explicitly specified, OR (b) auto-trigger conditions in Step 1.5 are met AND the user consents at the warning prompt.** Default full review does NOT include the resilience 3-pack (cost control).
- **Only report findings with Confidence >= 80.** Do not increase noise with low-confidence findings.

---

## Step 0: Determine Base Branch and Collect Diff

### Base Branch Resolution

| Condition | Base Branch |
|---|---|
| `--base=<branch>` specified | The specified branch |
| Not specified + `main` exists | `main` |
| Not specified + `master` exists | `master` |
| Neither exists | Ask the user |

### Collect Diff

```bash
# Current branch name
git branch --show-current

# Changed files compared to base
git diff <base>...HEAD --name-only

# Full diff compared to base
git diff <base>...HEAD
```

If zero changed files → stop with "No changes to review."

---

## Step 1: Collect Project Guidance

To improve review accuracy, collect project-specific conventions before review:
- `CLAUDE.md` — Project instructions
- Lint configuration (`.eslintrc*`, `biome.json`, etc.)
- TypeScript configuration (`tsconfig.json`)
- Repository-specific coding conventions

Include these in the review agent prompt context.

---

## Step 1.5: Resilience Trigger Evaluation

Determine whether the resilience 3-pack (sre-engineer + chaos-engineer + error-detective) should run.

### Auto-Trigger Conditions

Set `RESILIENCE_TRIGGERED=true` if **any** of the following are true in the diff:

| Condition | Rationale |
|---|---|
| Any file matches `migrations/**`, `**/migrations/**`, `supabase/migrations/**`, `prisma/migrations/**` | Schema changes have production-wide blast radius |
| Any file matches `infra/**`, `terraform/**`, `k8s/**`, `kubernetes/**`, `helm/**`, `docker-compose*.yml`, `Dockerfile` | Infrastructure changes affect runtime reliability |
| New files added under `**/api/**`, `**/app/api/**`, `supabase/functions/**`, `**/edge-functions/**` | New endpoints introduce new failure surfaces |
| `package.json` diff includes runtime dependency additions for DB/queue/cache/auth packages (keywords: `prisma`, `drizzle`, `supabase`, `redis`, `bullmq`, `kafka`, `rabbitmq`, `mongodb`, `postgres`, `auth`, `next-auth`, `clerk`) | Runtime dependency changes alter failure modes |
| PR branch name matches `hotfix/*`, `incident/*`, `postmortem/*` | Remediation work deserves resilience verification |
| Total changed lines >= 500 | Large changes amplify blast radius |
| Git commit footer or branch description contains `production-impact` or `resilience-required` tag | Explicit author signal |

### Trigger Behavior

- **If `--focus=resilience` is explicitly passed**: Run resilience 3-pack unconditionally (skip the prompt).
- **If `RESILIENCE_TRIGGERED=true` (auto-detect)**: Print the warning below and ask the user `[yes/no/skip]`. Default is `no` after 1 response cycle.
- **If `RESILIENCE_TRIGGERED=false`**: Do not run the resilience 3-pack. Continue with the normal review flow.

### Warning Prompt Template

```
Resilience review recommended: <list matched trigger conditions, max 3 bullets>
Run resilience 3-pack (sre-engineer + chaos-engineer + error-detective)? [yes/no/skip]
  yes  - run the 3-pack in parallel with the standard review (adds ~3 agents)
  no   - skip this time (default)
  skip - skip AND suppress the warning for this session
```

---

## Step 2: Review (MUST: Subagent + Codex Parallel Launch)

**When `--focus` is specified**: Launch only the agents for the specified aspect (see mapping below).
**When `--focus` is not specified**: Execute a full review launching all agents below.

### Full Review: 6 Claude Subagents + 2 Codex Direct Reviews

**All of the following must be launched simultaneously. Omission or self-substitution is prohibited.**

Each agent's prompt must include:
- The full diff from base branch (`git diff <base>...HEAD`)
- List of changed files
- Project guidance collected in Step 1
- Explanation that this is a pre-PR local review (no GitHub PR exists yet)

##### Phase A: Launch Codex reviews as background Bash processes

**Before launching Claude subagents, start 2 Codex reviews in background Bash.**
This avoids the subagent permission inheritance problem entirely.

**MANDATORY: invoke Codex through `~/.claude/scripts/codex-exec-bg.sh`, never a raw `codex exec`.**
The pre-tool-enforcer hook blocks raw `codex exec` Bash calls (they would not register in
`/tmp/claude-codex-jobs/` and would be invisible in the statusline). The wrapper takes the
same arguments you would pass after `codex exec`.

```bash
# 1. Standard review (background) — the `review` subcommand takes --base but NO prompt
Bash(command="cd <repo> && ~/.claude/scripts/codex-exec-bg.sh review --base <base-branch> --full-auto --ephemeral -o /tmp/codex-review-standard-prepr.md", run_in_background=true)

# 2. Adversarial review (background) — plain exec prompt form (see constraint below)
Bash(command="cd <repo> && ~/.claude/scripts/codex-exec-bg.sh --sandbox read-only --ephemeral -o /tmp/codex-review-adversarial-prepr.md 'Adversarial code review. Run: git diff <base-branch>...HEAD in this repo and critically examine design decisions, trade-offs, failure modes, and security concerns. Report findings with severity CRITICAL/HIGH/MEDIUM/LOW and file:line references.'", run_in_background=true)
```

**CLI constraint (verified on codex-cli 0.144.1, 2026-07-17):**
`codex exec review` REJECTS combining `--base <branch>` with a `[PROMPT]` argument
(`error: the argument '--base <BRANCH>' cannot be used with '[PROMPT]'`), even though the
usage string lists both. Therefore:
- Standard review = `review --base <branch>` with no prompt.
- Adversarial (or any custom-instruction) review = plain exec prompt that tells Codex to
  run `git diff <base>...HEAD` itself. Do NOT put a prompt on `review --base`.

**Key flags:**
- `--base <base-branch>`: review diff against the base branch (review subcommand only, incompatible with a prompt)
- `--full-auto`: bypass Codex internal approval prompts (non-interactive mode)
- `--ephemeral`: do not persist session files to disk
- `-o <file>`: alias of `--output-last-message`; writes the final review message to a file (Read it later)

##### Phase B: Launch 6 Claude subagents in parallel (simultaneously with Phase A)

1. `Agent(subagent_type="code-reviewer")` — Code review of changed files
2. `Agent(subagent_type="security-reviewer")` — Security review of changed files
3. `Agent(subagent_type="silent-failure-hunter")` — Detection of silent errors and swallowed exceptions
4. `Agent(subagent_type="typescript-reviewer")` — TypeScript type safety, async correctness, and Node security (only when TS/JS files are present)
5. `Agent(subagent_type="code-simplifier")` — Code simplification and readability improvement suggestions
6. `Agent(subagent_type="code-reviewer")` — Comment, TODO, and FIXME analysis (instruct in prompt to "specialize in comment and annotation analysis")

##### Phase B2: Launch Resilience 3-pack (conditional — only when Step 1.5 decided to run it)

**Run only if `--focus=resilience` OR the user accepted the Step 1.5 warning prompt with `yes`.**

Launch the following 3 agents in parallel together with Phase B (same single message, so all 9 Claude agents execute concurrently):

7. `Agent(subagent_type="sre-engineer")` — SLO / error-budget impact analysis, observability gaps (missing metrics, logs, traces), toil introduction
8. `Agent(subagent_type="chaos-engineer")` — Failure mode enumeration, blast-radius assessment, rollback feasibility, feature-flag / kill-switch coverage
9. `Agent(subagent_type="error-detective")` — Correlation with known error patterns, new failure-surface detection, past-incident similarity

Each resilience-agent prompt MUST include:
- The full diff (`git diff <base>...HEAD`)
- The list of trigger conditions that fired in Step 1.5 (or "explicit --focus=resilience")
- A directive to return findings in the `CRITICAL / HIGH / MEDIUM / LOW` severity schema so they merge cleanly with Phase B output

##### Phase C: Collect Codex results

After all Claude subagents complete, read the Codex output files:
```
Read("/tmp/codex-review-standard-prepr.md")
Read("/tmp/codex-review-adversarial-prepr.md")
```

If a file is empty or missing, the Codex review failed — log a warning but do not block the pipeline.
Integrate the Codex findings into the merged result alongside Claude subagent findings.

### Agent Mapping When --focus Is Specified

| --focus | Agents to Launch |
|---------|-----------------|
| `code` | code-reviewer, security-reviewer, Codex x2 (via `codex-exec-bg.sh`, see Phase A) |
| `comments` | code-reviewer (specialized in comment analysis) |
| `tests` | code-reviewer (specialized in test coverage analysis) |
| `errors` | silent-failure-hunter |
| `types` | typescript-reviewer |
| `simplify` | code-simplifier |
| `resilience` | sre-engineer, chaos-engineer, error-detective (the 3-pack ONLY — no code-reviewer/Codex) |

### Result Integration

Collect results from all agents and merge using the following rules:

**Confidence Rule**: Only report findings with confidence >= 80.
- **Critical**: Bugs, security vulnerabilities, data loss risks
- **Important**: Insufficient tests, quality issues, style violations
- **Advisory**: Suggestions only (displayed only when explicitly requested via `--focus`)

Merge duplicate findings and annotate each with its source (code-reviewer / security-reviewer / silent-failure-hunter / typescript-reviewer / code-simplifier / codex:review / codex:adversarial-review / sre-engineer / chaos-engineer / error-detective).

When the resilience 3-pack ran, compute a **Resilience Gate**:
- **PASS**: no CRITICAL and no HIGH resilience findings
- **WARN**: HIGH findings exist but no CRITICAL; PR can proceed with noted risk
- **BLOCK**: any CRITICAL resilience finding → `Ready for PR` becomes NO regardless of other reviewers

---

## Step 3: Report

```
Pre-PR Review: <branch-name> -> <base-branch>
Changed Files: <file-count>
Resilience Review: <RAN | SKIPPED (trigger not met) | SKIPPED (user declined)>

Issues: <critical-count> critical, <high-count> high, <medium-count> medium, <low-count> low

CRITICAL:
  <findings or "None">

HIGH:
  <findings or "None">

MEDIUM:
  <findings or "None">

LOW:
  <findings or "None">

--- Resilience Review (only when it ran) ---

SLO Impact (sre-engineer):
  <findings or "None">

Failure Modes (chaos-engineer):
  <findings or "None">

Error Pattern Correlation (error-detective):
  <findings or "None">

Resilience Gate: [PASS | WARN | BLOCK]
  PASS  - no CRITICAL and no HIGH resilience findings
  WARN  - HIGH present, no CRITICAL; manual review advised
  BLOCK - CRITICAL present; Ready for PR is forced to NO

--------------------------------------------

Ready for PR: [YES / NO]
  NO if:
    - any CRITICAL or HIGH issue from any reviewer, OR
    - Resilience Gate == BLOCK
```

---

## Step 4: Fix Proposal (Optional)

If CRITICAL / HIGH findings exist, ask the user:

> <N> CRITICAL/HIGH issues found. Would you like to auto-fix?
> - `yes` — Execute automatic fixes
> - `no` — End with report only

If `yes`:
1. Fix the flagged issues
2. Run `Skill("verify")` for validation
3. On validation failure → `Skill("build-fix")` → re-verify (max 3 attempts)
4. Display fix result summary

---

## Edge Cases

- **No diff**: Stop with "No changes to review."
- **Unknown base branch**: Ask the user
- **Large diff (50+ files)**: Warn about scope. Prioritize: source changes → tests → config/docs
- **No TS/JS files**: Skip typescript-reviewer (this is the only permitted skip)
- **Codex unavailable**: Warn and continue with 6 Claude subagents only
- **Resilience trigger fires but user declines**: Record `Resilience Review: SKIPPED (user declined)` in the report; continue with the standard 6-subagent review
- **`--focus=resilience` on a trivial diff (e.g. doc-only)**: Run the 3-pack anyway (explicit flag wins), but note in the report header that the flag was explicit
- **One resilience agent fails**: Continue with the remaining 2 and note the failure in the source attribution; do NOT invalidate the whole Resilience Gate (degrade to WARN minimum)

---

## Step 5: Log the Review Run (MUST)

After Step 3 report (and Step 4 fix loop if executed), append this run to the review log so future sessions can answer "did I review this branch already?".

```bash
# branch name from Step 0
BRANCH="$(git branch --show-current)"
~/.claude/bin/log-review.sh pre-pr-review "branch:${BRANCH}"
```

If CRITICAL/HIGH findings remained unfixed (user declined Step 4 auto-fix), pass a note:

```bash
~/.claude/bin/log-review.sh pre-pr-review "branch:${BRANCH}" "unfixed: <count> CRITICAL, <count> HIGH"
```

To inspect history later: `/review-status grep branch:${BRANCH}` or `/review-status` for the last 20.

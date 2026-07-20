---
description: Open PRs to sequential review & fix pipeline. Wraps existing commands/agents. Usage - /review-prs [options]
---

# Review PRs - Sequential PR Review & Fix Pipeline

Fetch open PRs in ascending order by number, and review, fix, and push each one sequentially.
Each phase is executed by an existing command (Skill) or subagent (Agent).

## MANDATORY RULES

- **Subagent launches in Steps 1.5, 2, 4, 5 are MUST (mandatory). They must never be skipped.**
- Subagents are launched via the Agent tool's `subagent_type` parameter. The main agent must never perform these tasks itself.
- **Step 2 Codex review is also MUST. Skipping is prohibited. Codex is invoked directly via `~/.claude/scripts/codex-exec-bg.sh` (NOT via subagent, NOT via raw `codex exec` — the pre-tool-enforcer hook blocks raw calls).**
- **During Step 2 full review, all 6 Claude subagents must be launched in parallel, and 2 Codex reviews run as background Bash processes.** When `--focus` is specified, follow the mapping table.
- **Resilience review (sre-engineer + chaos-engineer + error-detective) runs only when: (a) `--focus=resilience` is explicitly specified, OR (b) auto-trigger conditions in Step 1.7 are met AND the user consents at the warning prompt.** Default full review does NOT include the resilience 3-pack (cost control).
- Commands invoked via the Skill tool (verify, build-fix, fetch-pull, commit-push) are also MUST. Skipping is prohibited.
- Wait for each step to complete before proceeding to the next (steps with dependencies must run sequentially).
- **Only report findings with Confidence >= 80.** Do not increase noise with low-confidence findings.

## Arguments

$ARGUMENTS:
- (empty) - Target all open PRs
- `--limit N` - Only the first N PRs
- `--label X` - Filter by label
- `--author X` - Filter by author
- `--dry-run` - Display list only
- `--focus=comments|tests|errors|types|code|simplify|resilience` - Review focused on a specific aspect (full review when omitted)

---

## Phase 0: Fetch PR List

1. Fetch with `gh pr list --state open --json number,title,headRefName,baseRefName --limit 100`
2. Sort by PR number in ascending order
3. Apply $ARGUMENTS filters
4. Display list and confirm with the user (`--dry-run` ends here)

---

## For Each PR (ascending by number):

### Step 1: Checkout

```bash
gh pr checkout <PR number>
```

### Step 1.5: Collect Project Guidance

To improve review accuracy, collect project-specific conventions before PR review:
- `CLAUDE.md` — Project instructions
- Lint configuration (`.eslintrc*`, `biome.json`, etc.)
- TypeScript configuration (`tsconfig.json`)
- Repository-specific coding conventions

Include these in the review agent's prompt context.

### Step 1.7: Resilience Trigger Evaluation

Determine whether the resilience 3-pack (sre-engineer + chaos-engineer + error-detective) should run for this PR.

#### Auto-Trigger Conditions

Set `RESILIENCE_TRIGGERED=true` if **any** of the following are true for this PR:

| Condition | Rationale |
|---|---|
| Any changed file matches `migrations/**`, `**/migrations/**`, `supabase/migrations/**`, `prisma/migrations/**` | Schema changes have production-wide blast radius |
| Any changed file matches `infra/**`, `terraform/**`, `k8s/**`, `kubernetes/**`, `helm/**`, `docker-compose*.yml`, `Dockerfile` | Infrastructure changes affect runtime reliability |
| New files added under `**/api/**`, `**/app/api/**`, `supabase/functions/**`, `**/edge-functions/**` | New endpoints introduce new failure surfaces |
| `package.json` diff includes runtime dependency additions for DB/queue/cache/auth packages (keywords: `prisma`, `drizzle`, `supabase`, `redis`, `bullmq`, `kafka`, `rabbitmq`, `mongodb`, `postgres`, `auth`, `next-auth`, `clerk`) | Runtime dependency changes alter failure modes |
| PR head branch matches `hotfix/*`, `incident/*`, `postmortem/*` | Remediation work deserves resilience verification |
| PR has a label `production-impact`, `resilience-required`, or `high-risk` | Explicit reviewer signal |
| PR diff total changed lines >= 500 | Large changes amplify blast radius |

#### Trigger Behavior

- **If `--focus=resilience` is explicitly passed**: Run resilience 3-pack unconditionally (skip the prompt).
- **If `RESILIENCE_TRIGGERED=true` (auto-detect)**: Print the warning below and ask the user `[yes/no/skip]`. Default is `no` after 1 response cycle.
  - `skip` sets a session-wide flag that suppresses the prompt for the remainder of this `/review-prs` run.
- **If `RESILIENCE_TRIGGERED=false`**: Do not run the resilience 3-pack. Continue with the normal review flow.

#### Warning Prompt Template

```
PR #<number>: Resilience review recommended
Triggers matched: <list matched trigger conditions, max 3 bullets>
Run resilience 3-pack (sre-engineer + chaos-engineer + error-detective)? [yes/no/skip]
  yes  - run the 3-pack in parallel with the standard review (adds ~3 agents)
  no   - skip for this PR only (default)
  skip - skip for this PR AND suppress the warning for the rest of this /review-prs run
```

### Step 2: Review (MUST: Subagent + Codex parallel launch)

**When `--focus` is specified**: Launch only the agents for the specified aspect (see mapping below).
**When `--focus` is not specified**: Execute a full review launching all agents below.

Before launching, fetch the changed file list and diff to include in the prompt:
```bash
gh pr diff <PR number> --name-only
gh pr diff <PR number>
```

#### Full Review: 6 Claude Subagents + 2 Codex Direct Reviews

**All of the following must be launched simultaneously. Omission or self-substitution is prohibited.**

##### Phase A: Launch Codex reviews as background Bash processes

**Before launching Claude subagents, start 2 Codex reviews in background Bash.**
This avoids the subagent permission inheritance problem entirely.

**MANDATORY: invoke Codex through `~/.claude/scripts/codex-exec-bg.sh`, never a raw `codex exec`.**
The pre-tool-enforcer hook blocks raw `codex exec` Bash calls (they would not register in
`/tmp/claude-codex-jobs/` and would be invisible in the statusline). The wrapper takes the
same arguments you would pass after `codex exec`.

```bash
# 1. Standard review (background) — the `review` subcommand takes --base but NO prompt
Bash(command="cd <repo> && ~/.claude/scripts/codex-exec-bg.sh review --base <base-branch> --full-auto --ephemeral -o /tmp/codex-review-standard-<PR number>.md", run_in_background=true)

# 2. Adversarial review (background) — plain exec prompt form (see constraint below)
Bash(command="cd <repo> && ~/.claude/scripts/codex-exec-bg.sh --sandbox read-only --ephemeral -o /tmp/codex-review-adversarial-<PR number>.md 'Adversarial code review. Run: git diff <base-branch>...HEAD in this repo and critically examine design decisions, trade-offs, failure modes, and security concerns. Report findings with severity CRITICAL/HIGH/MEDIUM/LOW and file:line references.'", run_in_background=true)
```

**CLI constraint (verified on codex-cli 0.144.1, 2026-07-17):**
`codex exec review` REJECTS combining `--base <branch>` with a `[PROMPT]` argument
(`error: the argument '--base <BRANCH>' cannot be used with '[PROMPT]'`), even though the
usage string lists both. Therefore:
- Standard review = `review --base <branch>` with no prompt.
- Adversarial (or any custom-instruction) review = plain exec prompt that tells Codex to
  run `git diff <base>...HEAD` itself. Do NOT put a prompt on `review --base`.

**Key flags:**
- `--base <base-branch>`: review diff against the PR's base branch (review subcommand only, incompatible with a prompt)
- `--full-auto`: bypass Codex internal approval prompts (non-interactive mode)
- `--ephemeral`: do not persist session files to disk
- `-o <file>`: alias of `--output-last-message`; writes the final review message to a file (Read it later)

##### Phase B: Launch 6 Claude subagents in parallel (simultaneously with Phase A)

1. `Agent(subagent_type="code-reviewer")` — Code review of changed files in the PR
2. `Agent(subagent_type="security-reviewer")` — Security review of changed files in the PR
3. `Agent(subagent_type="silent-failure-hunter")` — Detection of silent errors and swallowed exceptions
4. `Agent(subagent_type="typescript-reviewer")` — TypeScript type safety, async correctness, and Node security (only when TS/JS files are present)
5. `Agent(subagent_type="code-simplifier")` — Code simplification and readability improvement suggestions
6. `Agent(subagent_type="code-reviewer")` — Comment, TODO, and FIXME analysis (instruct in prompt to "specialize in comment and annotation analysis")

##### Phase B2: Launch Resilience 3-pack (conditional — only when Step 1.7 decided to run it)

**Run only if `--focus=resilience` OR the user accepted the Step 1.7 warning prompt with `yes` for this PR.**

Launch the following 3 agents in parallel together with Phase B (same single message, so all 9 Claude agents execute concurrently):

7. `Agent(subagent_type="sre-engineer")` — SLO / error-budget impact analysis, observability gaps (missing metrics, logs, traces), toil introduction
8. `Agent(subagent_type="chaos-engineer")` — Failure mode enumeration, blast-radius assessment, rollback feasibility, feature-flag / kill-switch coverage
9. `Agent(subagent_type="error-detective")` — Correlation with known error patterns, new failure-surface detection, past-incident similarity

Each resilience-agent prompt MUST include:
- The full PR diff (`gh pr diff <PR number>`)
- The list of trigger conditions that fired in Step 1.7 (or "explicit --focus=resilience")
- A directive to return findings in the `CRITICAL / HIGH / MEDIUM / LOW` severity schema so they merge cleanly with Phase B output

##### Phase C: Collect Codex results

After all Claude subagents complete, read the Codex output files:
```
Read("/tmp/codex-review-standard-<PR number>.md")
Read("/tmp/codex-review-adversarial-<PR number>.md")
```

If a file is empty or missing, the Codex review failed — log a warning but do not block the pipeline.
Integrate the Codex findings into the merged result alongside Claude subagent findings.

#### Agent Mapping When --focus Is Specified

| --focus | Agents to Launch |
|---------|-----------------|
| `code` | code-reviewer, security-reviewer, Codex x2 (via `codex-exec-bg.sh`, see Phase A) |
| `comments` | code-reviewer (specialized in comment analysis) |
| `tests` | code-reviewer (specialized in test coverage analysis) |
| `errors` | silent-failure-hunter |
| `types` | typescript-reviewer |
| `simplify` | code-simplifier |
| `resilience` | sre-engineer, chaos-engineer, error-detective (the 3-pack ONLY — no code-reviewer/Codex) |

#### Result Integration

Collect results from all agents and merge using the following rules:

**Confidence Rule**: Only report findings with confidence >= 80.
- **Critical**: Bugs, security vulnerabilities, data loss risks
- **Important**: Insufficient tests, quality issues, style violations
- **Advisory**: Suggestions only (displayed only when explicitly requested via `--focus`)

Merge duplicate findings and annotate each with its source (code-reviewer / security-reviewer / silent-failure-hunter / typescript-reviewer / code-simplifier / codex:review / codex:adversarial-review / sre-engineer / chaos-engineer / error-detective).

When the resilience 3-pack ran, compute a **Resilience Gate**:
- **PASS**: no CRITICAL and no HIGH resilience findings
- **WARN**: HIGH findings exist but no CRITICAL; PR fixes proceed with the noted risk
- **BLOCK**: any CRITICAL resilience finding → Step 3 Fix MUST address the resilience CRITICALs before Step 4 Verify, and Step 7 Ship requires explicit user confirmation

### Step 3: Fix

For all findings from Step 2 (CRITICAL / HIGH / MEDIUM), fix the files changed in the PR.
LOW findings are recorded only and may be skipped.
If Resilience Gate == BLOCK, resilience CRITICAL findings MUST be fixed in this step (or an explicit decision recorded with the user).

### Step 4: Verify (MUST: Skill execution)

**Execute the following sequentially via the Skill tool. Skipping is prohibited.**

1. Execute `Skill("verify")`
2. If FAIL → Execute `Skill("build-fix")` → Run `Skill("verify")` again
3. After 3 failures, confirm with user (Skip / Retry / Abort)

### Step 5: Docs (MUST: Subagent parallel launch)

**Launch the following 2 simultaneously via the Agent tool. Omission or self-substitution is prohibited.**

1. `Agent(subagent_type="doc-updater")` — Processing equivalent to `/update-docs`
2. `Agent(subagent_type="doc-updater")` — Processing equivalent to `/update-codemaps`

### Step 6: Sync (MUST: Skill execution)

Execute `Skill("fetch-pull")`. Confirm with user on conflicts.

### Step 7: Ship (MUST: Skill execution)

Execute `Skill("commit-push")`.
Commit message: `refactor: apply review fixes for PR #<number>`
May be skipped if there are no changes (this is the only permitted skip).

### Step 8: CI/CD Verification (MUST: Required before proceeding to next PR)

**After push, do not proceed to the next PR until all CI/CD checks pass. Skipping is prohibited.**

1. Wait for CI/CD completion with `gh pr checks <PR number> --watch`
2. If all checks PASS → Proceed to Step 9
3. If any check FAILs:
   - Display details of the failed check
   - Attempt fix with `Skill("build-fix")`
   - Run `Skill("commit-push")` again → `gh pr checks <PR number> --watch`
   - After 3 failures, confirm with user (Skip / Retry / Abort)

### Step 9: Log the Review Run (MUST)

Append this PR's review run to the review log so future sessions can answer "did I already review PR #N?".

```bash
~/.claude/bin/log-review.sh review-prs "PR#<number>"
```

If CRITICAL/HIGH findings remained unfixed at Step 3 (user declined or limit hit), include a note:

```bash
~/.claude/bin/log-review.sh review-prs "PR#<number>" "unfixed: <count> CRITICAL, <count> HIGH"
```

To inspect history later: `/review-status grep PR#<number>` or `/review-status` for the last 20.

### Step 10: Move to Next PR

Return to the default branch and proceed to the next PR. Display final report when all are complete.

---

## On Error

Skip / Retry / Abort can be selected per PR.
Pipeline stops after 2 consecutive PR failures, confirm with user.

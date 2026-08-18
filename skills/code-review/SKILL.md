---
name: code-review
description: 単一のレビュー実行経路。ローカル差分 / PR番号 / ブランチを対象に、Claude subagent 6体 + Codex 2本を並列で走らせ、指摘を集約し、最後に2段階のゲート（どこまで直すか / どう出すか）で必ずユーザに訊く。入口は /pre-pr-review, /review-prs, /vibe Phase 4 の3つと、このskillの直接呼び出しだけ。ここを経由しないレビューは、並列起動の一部が欠けたコピーになる。
user_invocable: true
argument-hint: "[pr-number | pr-url | branch | blank for local diff] [--base=main] [--focus=code|comments|tests|errors|types|simplify|resilience]"
---

# Code Review (unified)

The one review path. Three commands and one pipeline phase used to carry their
own copy of the parallel-launch block, and the copies had already drifted:
`/vibe` was launching 5 subagents where the others launched 6, so the comment
and TODO reviewer never ran inside the pipeline. One implementation, no copies.
That is the whole point of this file.

**When you start this skill, announce it in one line: `code-review skill: <target>`.**
An unannounced run is a run nobody can tell apart from ad-hoc reviewing.

## Invocation modes

| Mode | Who calls it | Gate 1 | Gate 2 |
|---|---|---|---|
| `interactive` (default) | `/pre-pr-review`, `/review-prs`, direct skill invocation | ASK (always) | ASK (conditional, see Step 7) |
| `pipeline` | `/vibe` Phase 4 | SKIPPED, fix CRITICAL + HIGH | SKIPPED, `/vibe` GATE 8 ships |

Callers pass `mode=` and optional `preset-fix=` / `preset-ship=`.

**A preset is a default, never a skip.** In `interactive` mode you MUST call
AskUserQuestion even when a preset was passed. The preset only decides which
option is listed first and carries the `(既定)` marker. Skipping the ask because
"the preset already answered it" is the exact failure this skill exists to
prevent: the user asked for a question at the end of every review, every time.

Do not invoke `/pre-pr-review` or `/review-prs` from inside this skill. Those
are the wrappers that call you. Calling back = infinite loop.

---

## Step 0: Resolve the target

| Input | Target |
|---|---|
| blank | local diff, `git diff <base>...HEAD` |
| number (`42`) or URL (`github.com/.../pull/42`) | PR mode, `gh pr checkout 42` then `gh pr diff 42` |
| branch name | `gh pr list --head <branch>`; PR mode if found, otherwise local diff of that branch |
| `--all-open-prs` | every open PR from `gh pr list --state open --json number,title,headRefName,baseRefName --limit 100`, ascending by number, one full pass of this skill each |

Base branch: `--base=<branch>` wins, else `main`, else `master`, else ask.

```bash
git branch --show-current
git diff <base>...HEAD --name-only
git diff <base>...HEAD
```

Zero changed files: stop with `No changes to review.` Do not launch agents on an
empty diff.

Record `TARGET_LABEL` now (`PR#42` or `branch:feat-x`). Step 8 logs it.

## Step 1: Collect project guidance

Read before launching, and paste into every agent prompt:

- `CLAUDE.md` (project instructions)
- lint config (`.eslintrc*`, `biome.json`, ...)
- `tsconfig.json`
- repo-specific conventions

Agents without project conventions report style violations that are not
violations. Every time.

## Step 1.5: Resilience trigger

Decide whether the resilience 3-pack (sre-engineer + chaos-engineer +
error-detective) joins the launch. Set `RESILIENCE_TRIGGERED=true` if **any**
row matches the diff:

| Condition | Rationale |
|---|---|
| file matches `migrations/**`, `**/migrations/**`, `supabase/migrations/**`, `prisma/migrations/**` | Schema changes have production-wide blast radius |
| file matches `infra/**`, `terraform/**`, `k8s/**`, `kubernetes/**`, `helm/**`, `docker-compose*.yml`, `Dockerfile` | Infrastructure changes affect runtime reliability |
| new file under `**/api/**`, `**/app/api/**`, `supabase/functions/**`, `**/edge-functions/**` | New endpoints introduce new failure surfaces |
| `package.json` adds a runtime dep matching `prisma`, `drizzle`, `supabase`, `redis`, `bullmq`, `kafka`, `rabbitmq`, `mongodb`, `postgres`, `auth`, `next-auth`, `clerk` | Runtime dependency changes alter failure modes |
| branch matches `hotfix/*`, `incident/*`, `postmortem/*` | Remediation work deserves resilience verification |
| PR label `production-impact`, `resilience-required`, or `high-risk` | Explicit reviewer signal |
| total changed lines >= 500 | Large changes amplify blast radius |
| task description, branch description, or commit trailer contains `production-impact` / `resilience-required` | Explicit author signal |

Behavior by mode:

- `--focus=resilience` passed: run the 3-pack unconditionally, no prompt.
- `interactive` + `RESILIENCE_TRIGGERED=true`: print the matched conditions
  (max 3 bullets) and ask `[yes/no/skip]`. Default `no`. `skip` suppresses the
  prompt for the rest of this run (matters for `--all-open-prs`).
- `pipeline` + `RESILIENCE_TRIGGERED=true`: run the 3-pack automatically, no
  prompt. `/vibe` Phase 4 is an AUTO phase; its user gate is GATE 8.
- `RESILIENCE_TRIGGERED=false`: skip the 3-pack. Cost control, not an oversight.

## Step 2: Parallel review (MANDATORY, no self-substitution)

**You MUST launch every agent below. Reviewing the diff yourself instead of
launching an agent is prohibited, including when the diff looks small.** The
main agent aggregates; it does not review.

### Phase A: 2 Codex reviews as background Bash

Start these first, so they run while the Claude subagents work.

**Always go through `~/.claude/scripts/codex-exec-bg.sh`. A raw `codex exec` is
blocked by the pre-tool-enforcer hook** (it would not register in
`/tmp/claude-codex-jobs/` and would be invisible in the statusline).

```bash
# Unique suffix, otherwise parallel runs and worktrees collide in /tmp
SLUG=$(git branch --show-current | tr / -)
STD_OUT=/tmp/codex-review-standard-${SLUG}-$$.md
ADV_OUT=/tmp/codex-review-adversarial-${SLUG}-$$.md

# 1. Standard review: `review --base` takes NO prompt
Bash(command="~/.claude/scripts/codex-exec-bg.sh review --base <base> --full-auto --ephemeral -o $STD_OUT", run_in_background=true)

# 2. Adversarial review: plain exec prompt, base branch named in the prompt text
Bash(command="~/.claude/scripts/codex-exec-bg.sh --sandbox read-only --ephemeral -o $ADV_OUT 'Adversarial code review. Run: git diff <base>...HEAD in this repo and critically examine design decisions, trade-offs, failure modes, and security concerns. Report findings with severity CRITICAL/HIGH/MEDIUM/LOW and file:line references.'", run_in_background=true)
```

**CLI constraint (verified on codex-cli 0.144.1, 2026-07-17):** `codex exec
review` rejects `--base <BRANCH>` together with `[PROMPT]`
(`error: the argument '--base <BRANCH>' cannot be used with '[PROMPT]'`), even
though the usage string lists both. So: standard review = `--base` alone,
adversarial review = prompt alone.

Flags: `--full-auto` bypasses Codex approval prompts, `--ephemeral` keeps no
session files, `-o <file>` writes the final message for Phase C to read.
Do not swallow stderr with `2>/dev/null`. `exit 2` from codex means a bad flag
combination, and you want to see it.

### Phase B: 6 Claude subagents, one single message

Launch all six in the **same message** as each other. Serial launch pays the
full latency of each agent.

1. `Agent(subagent_type="code-reviewer")` ... code quality of changed files
2. `Agent(subagent_type="security-reviewer")` ... security of changed files
3. `Agent(subagent_type="silent-failure-hunter")` ... silent errors, swallowed exceptions
4. `Agent(subagent_type="typescript-reviewer")` ... type safety, async correctness, Node security (skip only when the diff has zero TS/JS files)
5. `Agent(subagent_type="code-simplifier")` ... simplification and readability
6. `Agent(subagent_type="code-reviewer")` ... comment / TODO / FIXME analysis (the prompt MUST say "specialize in comment and annotation analysis", otherwise this is a duplicate of #1)

Agent 6 is the one `/vibe` was missing for months. Do not drop it again.

Every prompt carries: the full diff, the changed-file list, the Step 1 project
guidance, and whether this is a local pre-PR review or a review of an existing
GitHub PR.

### Phase B2: resilience 3-pack (only when Step 1.5 said yes)

Launch these in the **same single message as Phase B**, so all 9 Claude agents
run concurrently.

7. `Agent(subagent_type="sre-engineer")` ... SLO / error-budget impact, observability gaps (missing metrics, logs, traces), toil
8. `Agent(subagent_type="chaos-engineer")` ... failure modes, blast radius, rollback feasibility, feature-flag / kill-switch coverage
9. `Agent(subagent_type="error-detective")` ... known error-pattern correlation, new failure surfaces, past-incident similarity

Each of the three prompts MUST include the full diff, the trigger conditions
that fired in Step 1.5 (or "explicit --focus=resilience"), and a directive to
return `CRITICAL / HIGH / MEDIUM / LOW` severities so the output merges with
Phase B.

### Phase C: collect Codex

```
Read($STD_OUT)
Read($ADV_OUT)
```

Empty or missing file = that Codex review failed. Warn, record it in the source
attribution, do not block. A dead job silently treated as "no findings" is the
worst outcome here.

### `--focus` mapping

| `--focus` | Launch |
|---|---|
| (none) | full review: Phase A + Phase B (+ B2 if triggered) |
| `code` | code-reviewer, security-reviewer, Codex x2 |
| `comments` | code-reviewer (comment analysis) |
| `tests` | code-reviewer (test coverage analysis) |
| `errors` | silent-failure-hunter |
| `types` | typescript-reviewer |
| `simplify` | code-simplifier |
| `resilience` | sre-engineer, chaos-engineer, error-detective only, no code-reviewer, no Codex |

## Step 3: Aggregate

Merge duplicates. Tag every finding with its source: `code-reviewer` /
`security-reviewer` / `silent-failure-hunter` / `typescript-reviewer` /
`code-simplifier` / `codex:review` / `codex:adversarial-review` /
`sre-engineer` / `chaos-engineer` / `error-detective`.

**Report only findings with Confidence >= 80.** Low-confidence findings are
noise, and noise is what makes people stop reading reviews.

| Severity | Meaning |
|---|---|
| CRITICAL | Security hole or data loss risk |
| HIGH | Bug or logic error likely to bite |
| MEDIUM | Quality issue or missing practice |
| LOW | Style nit |

**Number every finding sequentially (`#1`, `#2`, ...) across all severities.**
Gate 1 option D lets the user pick by number, and unnumbered findings make that
option unusable.

Resilience Gate, only when Phase B2 ran:

- **PASS**: no CRITICAL and no HIGH resilience finding
- **WARN**: HIGH but no CRITICAL, proceed with the risk named in the report
- **BLOCK**: any CRITICAL resilience finding. In `interactive` mode, Gate 1
  option A (report only) requires explicit user re-confirmation. In `pipeline`
  mode, STOP at the end of review and tell the user to re-run `/vibe from:review`.

Report shape:

```
Code Review: <target>  (<branch> -> <base>)
Changed files: <n>   Resilience: <RAN | SKIPPED (trigger not met) | SKIPPED (user declined)>
Findings: <c> CRITICAL, <h> HIGH, <m> MEDIUM, <l> LOW

CRITICAL
  #1 <file:line> <one line> [source: security-reviewer, codex:adversarial-review]
HIGH
  #2 ...
MEDIUM
  ...
LOW
  ...

Resilience Gate: [PASS | WARN | BLOCK | N/A]
```

Zero findings: report it, **skip both gates**, jump to Step 8. There is nothing
to decide, and a gate with nothing behind it teaches the user to click through
gates without reading.

## Step 4: GATE 1 (MANDATORY in interactive mode)

Build the brief per `~/.claude/skills/ask-brief/SKILL.md`, then call
AskUserQuestion. One question, header `修正範囲`.

Question: `指摘が <n> 件。どこまで直しますか？`

| Option | label | description |
|---|---|---|
| A | `指摘だけ` | 修正しない。レポートを出して終わり。あとで自分で直す、または別セッションでやる |
| B | `C/H を直す` | CRITICAL と HIGH だけ直す。壊れるものと危ないものを潰し、好みの話は残す |
| C | `C/H/M を直す` | CRITICAL / HIGH / MEDIUM を直す。LOW（スタイルの指摘）だけ残る |
| D | `番号を選ぶ` | 直す指摘の番号を指定する。選んだあと `#3,#7` のように答えてもらう |

Preset handling: `preset-fix=none` puts A first with `(既定)`,
`preset-fix=critical-high` puts B first with `(既定)`. The order changes, the
ask does not disappear.

If the user picks D, ask for the numbers, then treat exactly those findings as
the fix set. If they name a number that does not exist, say so and re-ask once.

## Step 5: Fix

Apply only what Gate 1 selected. Nothing else. A review that quietly also
refactors adjacent code is a review the user cannot verify.

**Test tampering is prohibited.** Fixes target production code. Never edit,
skip, or weaken a test to make a failure go away. If a reviewer flags a flaky
test or an over-strict assertion, surface it to the user as a finding and leave
the test alone.

If a fix introduces a new failure, revert that one fix and report it rather
than stacking a second fix on top.

## Step 6: Verify (only when Step 5 changed something)

1. `Skill("verify")`
2. FAIL: `Skill("build-fix")`, then `Skill("verify")` again
3. After 3 failed attempts, STOP and ask the user (Skip / Retry / Abort). Do not
   loop a fourth time.

Report the fresh pass/fail output. "Should pass now" is not verification.

## Step 7: GATE 2 (MANDATORY when it fires)

**Firing condition:** Step 5 changed files, OR the target is a PR.
If Gate 1 was A (report only) AND the target is not a PR, **do not ask**. There
is nothing to ship, and a ritual gate is a gate that gets skipped for real
later.

AskUserQuestion takes at most 4 options, so filter by context instead of
listing every possibility. Header `出し方`.

**Target is a PR:**

| label | description |
|---|---|
| `PRにpush` | 修正をコミットして、この PR のブランチに push する（`Skill("commit-push")`。メッセージは `refactor: apply review fixes for PR #<n>`） |
| `GitHubに投稿` | 指摘を PR レビューとして GitHub に出す（`gh pr review <n> --approve` / `--request-changes` / `--comment`。CRITICAL か HIGH が残っていれば approve は選ばない） |
| `コミットのみ` | ローカルでコミットするだけ。push はしない。自分で確認してから出したいとき |
| `何もしない` | 作業ツリーはこのまま。手で続きをやる |

**Target is a local diff:**

| label | description |
|---|---|
| `PRを作る` | 新規ブランチを切って PR を作る（`/pr-create` を呼ぶ） |
| `既存PRにpush` | このブランチの既存 PR にコミットして push する（`gh pr list --head <branch>` で PR が見つかったときだけ出す） |
| `コミットのみ` | コミットするだけ。push も PR もしない |
| `何もしない` | 作業ツリーはこのまま |

Preset handling matches Gate 1: `preset-ship=<option>` reorders and marks
`(既定)`, it never removes the ask.

`gh pr review` posts publicly to GitHub under the user's name. Print the exact
body you are about to send in the chat first, so the user sees what goes out.

## Step 8: Log the run (MANDATORY)

Always, including report-only runs and zero-finding runs. Otherwise
`/review-status` cannot answer "did I already review this?" and the next
session re-runs 8 agents on the same diff.

```bash
~/.claude/bin/log-review.sh <entry-point> "<TARGET_LABEL>" "<optional note>"
```

`<entry-point>` is what triggered this run: `pre-pr-review` / `review-prs` /
`vibe` for the three commands, and `code-review` when the skill was invoked
directly. `code-review` is no longer a command, but it stays a valid log name:
every line written before the merge used it, so keeping it means
`~/.claude/memory/review-log.jsonl` stays greppable end to end and
`jq -r .skill | sort | uniq -c` keeps working across the whole history.

Unfixed CRITICAL / HIGH go in the note:

```bash
~/.claude/bin/log-review.sh pre-pr-review "branch:${BRANCH}" "unfixed: 2 CRITICAL, 3 HIGH"
```

## Edge cases

- **No diff**: `No changes to review.` Stop before Phase A.
- **Unknown base branch**: ask, do not guess.
- **50+ changed files**: warn about scope, prioritize source, then tests, then config and docs.
- **No TS/JS in the diff**: skip typescript-reviewer. This is the only permitted agent skip.
- **Codex unavailable**: warn, continue with the 6 Claude subagents, note it in the report.
- **One resilience agent fails**: continue with the other 2, note the failure, degrade the Resilience Gate to WARN minimum. Do not silently report PASS.
- **No `gh` CLI in PR mode**: fall back to local diff review, drop the GitHub option from Gate 2, tell the user why.
- **Diverged branches**: tell the user to sync with the base branch first, and give them the exact command. Do not run history-rewriting commands yourself.
- **Draft PR**: `gh pr review --comment` only. Never approve or request-changes on a draft.
- **`--all-open-prs`**: run Steps 0 to 8 per PR, ascending. Stop and ask after 2 consecutive PR failures.

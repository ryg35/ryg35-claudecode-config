---
name: code-review
description: Unified review path for local diffs, PRs, branches and vibe Phase 4. Choose the opposite reviewer lineage from the actual implementer per rules/model-roles.md, aggregate scoped findings, then apply the interactive fix and ship gates.
user_invocable: true
argument-hint: "[pr-number | pr-url | branch | blank for local diff] [--base=main] [--focus=code|data|security|errors|types|simplify|comments|tests|logic|ops|resilience]"
---

# Code Review (unified)

The one review path. Three commands and one pipeline phase used to carry their
own copy of the parallel-launch block, and the copies had already drifted.
One implementation, no copies. That is the whole point of this file.

Reviewers come from a catalog of narrowly scoped roles, launched per diff
(Step 1.6). Wall time used to be set by broad Claude reviewers that read the
whole repository (tool_uses vs duration r=0.91); a narrow scope and a narrow
reading range are what make a review fast. There is no cap on finding count:
CRITICAL/HIGH are reported in full, MEDIUM/LOW as one line each.

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

## Step 0.5: Resolve the development flow

Read `rules/model-roles.md`. Reuse the feature/bug classification from `/vibe` Phase 2 or classify now: existing wrong behavior is a bug; everything else, including refactors and docs, is a feature. Announce the flow and confirm who implemented the diff before selecting reviewers.

- Record the actual implementer, not just the planned flow. Codex implementation selects Claude catalog reviewers (Phase B/B2); Claude implementation selects the three Codex reviewers (Phase A/C). Human-written PRs select both lineages from the existing catalog.
- Feature defaults: Codex implements, Claude reviews. Bug defaults: Claude implements, Codex reviews. Below, "feature review" and "bug review" mean these reviewer routes, adjusted to actual authorship.
- Stop only when implementer and reviewer would be the same lineage. The single exception is when Codex is unavailable AND the user explicitly approved Claude taking the review step: use a separate Claude context that did not implement, and disclose it in the PR body. A flow mismatch alone does not require a stop.
- Resolve models and explicit overrides through `rules/model-roles.md`.
- Codex unavailable (limit, login failure, crash): stop and ask. Tool-access requirements (MCP, browser connectors) are not unavailability: Claude implements and Codex reviews; announce it. Only the step taken over changes hands.

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

## Step 1.6: Route (pick reviewers from the catalog)

| Reviewer | Kind | Scope | Launch when |
|---|---|---|---|
| `codex:data-security` | Codex, `prompts/codex-data-security.md` | db (schema, migration, index, RDB/ES/search index consistency, backfill order, transaction, RLS) + security (untrusted input, external data re-validation, authorization / tenant boundary, web vulnerabilities: XSS, injection, path traversal, SSRF, CSRF, open redirect, cookie attributes, CORS, JWT, weak crypto, eval). Primary owner of secrets, production writes and PII in generated outputs | Claude or human implementation |
| `codex:correctness` | Codex, `prompts/codex-correctness.md` | normal-path correctness (inverted conditions, swapped variables, behavior vs caller / function-name expectation, React stale closures / hook deps) + types / async / perf (floating promises, `forEach(async)`, await in loops, N+1, harmful `any` / `as`) + failure path (failure counted as success, partial failure, edge cases, races, swallowed errors, bad fallbacks) | Claude or human implementation |
| `codex:tests-domain` | Codex, `prompts/codex-tests-domain.md` | feature and regression coverage, format vs correctness assertions, domain logic vs spec, config / flags taking effect, resilience (error paths, retries, timeouts, silent failures), simplification (dead code, duplication, comment noise) | Claude or human implementation |
| `review-simplify` | Claude (worker tier) | WHY-less comments, length (file 400 / function 50), duplication with existing code, dead code | Codex or human implementation |
| `review-domain-logic` | Claude (judgment tier) | domain logic vs real data, docs, specs | Codex or human implementation: the diff changes an implementation file (definition below). Skip only when every changed file is docs (plain `*.md`, `docs/**`), non-rule config, or style (`*.css`, formatting-only) |
| `review-security-ops` | Claude (judgment tier) | primary owner of flags / env / config actually taking effect (and the write target they select), PII in outputs | Codex or human implementation: see the trigger list below |
| `review-tests` | Claude (worker tier) | missing tests, format-only assertions | Codex or human implementation: an implementation file changed, OR a test file (globs below) was added or modified. Skip only when the diff is docs / style alone |

For Claude implementations, launch all three Codex reviewers with the relevant scopes, including resilience input. For Codex implementations, launch the existing review-* catalog in Phase B and B2 when triggered. Human-written PRs run both. Apply Step 0.5 actual-author routing throughout. Tiers and effort live in `rules/model-roles.md`.

**Implementation file**: any source file (`*.ts`, `*.tsx`, `*.js`, `*.py`, `*.go`, `*.rs`, `*.rb`, `*.sh`, `*.sql`, ...), plus `SKILL.md`, `agents/*.md`, `commands/*.md`, `prompts/*.md`, prompt templates, any `*.md` with YAML frontmatter, and YAML / JSON that carries business rules (price tables, classification maps). These are never "docs only".

**Test file globs** (glob match only; a bare substring `test` / `spec` misfires on `latest.ts` and `contest/`): `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, `**/test_*.py`, `**/*_test.py`, `**/*_test.go`, `tests/**`, `test/**`, `spec/**`.

**review-security-ops trigger**: launch when the diff contains any of
- Python: `argparse`, `import click` / `@click.`, `typer`, `sys.argv`, `os.environ`, `os.getenv`, `BaseSettings`
- JS / TS: `commander`, `yargs`, `process.env`, `import.meta.env`, `Deno.env`, `Bun.env`
- Go: `os.Getenv`, `flag.`, `cobra`, `viper`
- Rust: `std::env`, `clap`
- Ruby: `ENV[`
- shell: `getopts`, `${VAR:-default}` / `${VAR:=default}` style defaults
- a changed output file path

or touches any of these files: `.env*`, `config/**`, `*.yml`, `*.yaml`, `*.toml`, config-value `*.json`, `next.config.*`, `vite.config.*`, `*.tf`, `Procfile`, `Makefile`, `*.plist`, deploy `*.sh`, `Dockerfile`, `vercel.json`, `wrangler.toml`, `fly.toml`, `.github/workflows/**`.

Announce the decision in one line before Step 2, naming every skipped reviewer
with its reason:

```
Codex implementer: launch routed review-* agents; skip Codex reviewers.
Claude implementer: launch codex:data-security, codex:correctness and codex:tests-domain; skip Claude reviewers.
Human implementer: launch both catalog lineages.
Name each conditional scope selected or skipped and its reason.
```

Unsure whether a conditional row matches: launch it. A skipped reviewer that
was needed is a miss; an extra narrow reviewer costs seconds.

## Step 2: Parallel review (MANDATORY, no self-substitution)

**You MUST launch every reviewer Step 1.6 selected. Reviewing the diff yourself
instead of launching a reviewer is prohibited, including when the diff looks
small.** The main agent aggregates; it does not review.

### Phase A: 3 Codex reviews as background Bash (Claude or human implementer)

Run these for Claude or human implementations per Step 0.5. Claude implementations use no Claude reviewers.

**Always go through `~/.claude/scripts/codex-exec-bg.sh`. A raw `codex exec` is
blocked by the pre-tool-enforcer hook** (it would not register in
`/tmp/claude-codex-jobs/` and would be invisible in the statusline).

The prompt bodies live in `~/.claude/skills/code-review/prompts/`. Substitute
`<BASE>` with `sed`; do not paraphrase or shorten the prompt.

```bash
# Unique suffix, otherwise parallel runs and worktrees collide in /tmp
SLUG=$(git branch --show-current | tr / -)
BASE=<base>
DS_OUT=/tmp/codex-review-data-security-${SLUG}-$$.md
CR_OUT=/tmp/codex-review-correctness-${SLUG}-$$.md
TD_OUT=/tmp/codex-review-tests-domain-${SLUG}-$$.md

Bash(command="~/.claude/scripts/codex-exec-bg.sh -c model_reasoning_effort=high --sandbox read-only --ephemeral -o $DS_OUT \"$(sed "s|<BASE>|$BASE|g" ~/.claude/skills/code-review/prompts/codex-data-security.md)\"", run_in_background=true)
Bash(command="~/.claude/scripts/codex-exec-bg.sh -c model_reasoning_effort=high --sandbox read-only --ephemeral -o $CR_OUT \"$(sed "s|<BASE>|$BASE|g" ~/.claude/skills/code-review/prompts/codex-correctness.md)\"", run_in_background=true)
Bash(command="~/.claude/scripts/codex-exec-bg.sh -c model_reasoning_effort=high --sandbox read-only --ephemeral -o $TD_OUT \"$(sed "s|<BASE>|$BASE|g" ~/.claude/skills/code-review/prompts/codex-tests-domain.md)\"", run_in_background=true)
```

`-c model_reasoning_effort=high` uses the listed reviewer level; keep it until measurement justifies a change; the
`~/.codex/config.toml` default (medium) stays as is.

Each prompt tells Codex to stay in scope, not to read `~/.claude/`,
`~/.codex/skills/`, `~/.codex/AGENTS.md` or any orchestration file, not to load
skills, and to tag every finding with its own name only. Burn: Codex read this SKILL.md and tagged
its findings `[source: code-reviewer]`, which broke per-reviewer counts.

**CLI constraints:**
- `codex exec review --base` (the old standard review) is retired: it rejects
  `[PROMPT]` together with `--base` (codex-cli 0.144.1), so it could not carry a
  scope or a source tag.
- codex-cli 0.154.0, 2026-09-24: `--full-auto` is gone (`unexpected argument
  '--full-auto'`, exit 2). Never add it back. `--sandbox read-only` is valid.

Flags: `--ephemeral` keeps no session files, `-o <file>` writes the final
message for Phase C to read. Do not swallow stderr with `2>/dev/null`: the
wrapper prints `codex-job-id=<id> meta=<path>` on stderr (Phase C needs it),
and exits with codex's own code, so `exit 2` means a bad flag.

### Phase B: selected review-* agents (Codex or human implementer)

Launch every `review-*` agent Step 1.6 selected in the **same message** as
each other. Serial launch pays the full latency of each agent.

- `Agent(subagent_type="review-simplify")` ... always
- `Agent(subagent_type="review-domain-logic")` ... when routed
- `Agent(subagent_type="review-security-ops")` ... when routed
- `Agent(subagent_type="review-tests")` ... when routed

Every prompt carries: the full diff, the changed-file list, the Step 1 project
guidance, and whether this is a local pre-PR review or a review of an existing
GitHub PR. Do not widen an agent's scope in the prompt; the scope is in its
definition.

The broad reviewers (code-reviewer, security-reviewer, silent-failure-hunter,
typescript-reviewer, code-simplifier, the comment-specialized code-reviewer)
remain retired from this path by user decision. Their ground is split across
the catalog; their wide reading range set wall time. Their definitions remain
for other uses. Feature-flow Claude review uses the existing review-* catalog,
not reintroduced broad reviewers.

### Phase B2: resilience 3-pack (Claude review route, when Step 1.5 said yes)

Launch these in the **same single message as Phase B**, so every Claude agent
runs concurrently.

1. `Agent(subagent_type="sre-engineer")` ... SLO / error-budget impact, observability gaps (missing metrics, logs, traces), toil
2. `Agent(subagent_type="chaos-engineer")` ... failure modes, blast radius, rollback feasibility, feature-flag / kill-switch coverage
3. `Agent(subagent_type="error-detective")` ... known error-pattern correlation, new failure surfaces, past-incident similarity

Each of the three prompts MUST include the full diff, the trigger conditions
that fired in Step 1.5 (or "explicit --focus=resilience"), and a directive to
return `CRITICAL / HIGH / MEDIUM / LOW` severities so the output merges with
Phase B, and to end every finding with its own tag only: `[source: sre-engineer]`,
`[source: chaos-engineer]`, `[source: error-detective]`.

### Phase C: collect Codex (Codex review route)

Load `codex-jobs` first. For EACH selected job (all three in a full Codex review), run all three checks before
reading its findings. The `<meta>` path is the `codex-job-id=... meta=<path>`
line in that Bash task's output.

```bash
LC_ALL=C sed -n 's/^status=//p' <meta>   # must be "done"
ps -p <pid-from-meta> >/dev/null && echo alive   # "running" + dead pid = killed
test -s $DS_OUT || echo "EMPTY"          # same for $CR_OUT and $TD_OUT
```

```
Read($DS_OUT)
Read($CR_OUT)
Read($TD_OUT)
```

A Codex review FAILED if any one holds: status is `error` or `killed`, status
is `running` but the pid is dead, or the `-o` file is missing or empty. A
background task that says exit 0 does not override any of these. Report a
failure as "codex:data-security / codex:correctness / codex:tests-domain FAILED (status=<x>)" with the
tail of `<meta>`'s `.jsonl`, in the summary and the source attribution. Never
write "no findings" for a failed review. Stop and ask before continuing.

**Codex failure (MANDATORY).** Stop and ask the user to wait/retry. Do not launch an automatic fallback or restore the retired broad reviewers. A replacement must preserve independence from the actual implementer; stop if it would use the same lineage. The single exception is when Codex is unavailable AND the user explicitly approved Claude taking the review step: use a separate Claude context that did not implement, and disclose it in the PR body. 

Burn 2026-09-24: every (now retired) standard review died instantly on a removed flag
(`status=error`), and the failure read as a clean run.

### `--focus` mapping

| `--focus` | Launch |
|---|---|
| (none) | full review by actual implementer: Codex = Phase B (+ B2 if triggered); Claude = Phase A + C; human = both |
| `code` | alias kept for compatibility: the full review, Step 1.6 routing as usual |
| `data` | codex:data-security |
| `security` | codex:data-security, review-security-ops |
| `errors` | codex:correctness |
| `types` | alias kept for compatibility: codex:correctness (types / async / perf belong to codex:correctness) |
| `simplify` / `comments` | review-simplify |
| `tests` | review-tests |
| `logic` | review-domain-logic |
| `ops` | review-security-ops |
| `resilience` | Codex implementer: sre-engineer, chaos-engineer, error-detective; Claude implementer: codex:tests-domain; human: both |

`--focus` narrows scope but never changes reviewer lineage: for Codex implementations, use only the existing review-* catalog; for Claude implementations, send selected scopes to the Codex reviewers, including resilience; for human implementations, use both. Map tests, domain, ops, resilience and simplify/comments scopes to codex:tests-domain on the Codex route. PII in generated outputs belongs to codex:data-security. Launch only reviewers from the actual-author route in Step 0.5. The table above lists scope owners before this flow filter. A value not in this table: stop and print the valid values. Do not guess.

## Step 3: Aggregate

Every finding keeps the source tag its reviewer wrote: `codex:data-security` /
`codex:correctness` / `codex:tests-domain` / `review-simplify` /
`review-domain-logic` / `review-security-ops` / `review-tests` /
`sre-engineer` / `chaos-engineer` / `error-detective`.
**Never rewrite or reassign a tag during aggregation.**

Merge duplicates into one finding and list every source on it. The tag format
is fixed as `[source: a, b]` so later re-measurement can count findings per
reviewer with a grep.

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

Resilience Gate, when Phase B2 ran or Codex reviewed triggered resilience scopes:

- **PASS**: no CRITICAL and no HIGH resilience finding
- **WARN**: HIGH but no CRITICAL, proceed with the risk named in the report
- **BLOCK**: any CRITICAL resilience finding. In `interactive` mode, Gate 1
  option A (report only) requires explicit user re-confirmation. In `pipeline`
  mode, STOP at the end of review and tell the user to re-run `/vibe from:review`.

Report shape:

```
Code Review: <target>  (<branch> -> <base>)
Changed files: <n>   Resilience: <RAN | SKIPPED (trigger not met) | SKIPPED (user declined)>
起動: <Step 1.6 line> / 見送り: <...>
Codex: <SKIPPED (Codex implementer) | OK | FAILED (<name>), stopped for user decision | user-approved swap: <agent>>
Findings: <c> CRITICAL, <h> HIGH, <m> MEDIUM, <l> LOW

CRITICAL
  #1 <file:line> <one line> [source: codex:data-security, review-security-ops]
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

Apply only what Gate 1 selected. Route fixes to the actual original implementer per Step 0.5: Codex uses `--sandbox workspace-write`; Claude uses its assigned implementation role. Re-review changed fixes using the opposite lineage before completion. Nothing else. A review that quietly also
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
session re-runs every reviewer on the same diff.

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
- **Reviewer skips**: only the Step 1.6 routing (or `--focus`) may skip a reviewer, and every skip is named in the routing line.
- **Codex unavailable or FAILED**: STOP and ask per Step 0.5 and Phase C. Print the `Codex:` header line; never silently swap or report an uncovered scope as reviewed.
- **One resilience agent fails**: continue with the other 2, note the failure, degrade the Resilience Gate to WARN minimum. Do not silently report PASS.
- **No `gh` CLI in PR mode**: fall back to local diff review, drop the GitHub option from Gate 2, tell the user why.
- **Diverged branches**: tell the user to sync with the base branch first, and give them the exact command. Do not run history-rewriting commands yourself.
- **Draft PR**: `gh pr review --comment` only. Never approve or request-changes on a draft.
- **`--all-open-prs`**: run Steps 0 to 8 per PR, ascending. Stop and ask after 2 consecutive PR failures.

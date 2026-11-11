# Model Roles (single source of truth)

This file is the ONLY place that names a model id or a per-agent effort. Everything else names a role ("Claude", "Codex", "reviewer tier") and points here.

When a new model ships: edit the `models` block below, then run

```bash
python3 ~/.claude/scripts/sync-model-roles.py
```

It rewrites `model:` / `effort:` in `~/.claude/agents/*.md` from this file. `--check` exits 1 on any drift or on a model id written outside the allowed files; run it before claiming a model change is done.

<!-- model-roles:data -->
```yaml
models:
  claude: claude-opus-5-5
  claude_light: claude-sonnet-5-5
  codex: gpt-6.1-sol
  codex_alt: gpt-6-astra

main_session:
  model: claude
  effort: medium

tiers:
  reviewer:
    model: claude
    effort: high
    agents: [code-reviewer, critic, database-reviewer, security-reviewer, silent-failure-hunter, typescript-reviewer, verifier]
  judgment:
    model: claude
    effort: medium
    agents: [architect, error-detective, executor, planner, review-domain-logic, review-security-ops, tdd-guide, tracer]
  light:
    model: claude_light
    effort: low
    agents: [light-worker]
  worker:
    model: claude
    effort: low
    agents: [build-error-resolver, chaos-engineer, ci-gen, code-explorer, code-simplifier, designer, doc-updater, document-specialist, e2e-runner, harness-optimizer, project-doc-gen, repo-scaffolder, review-simplify, review-tests, scientist, sre-engineer]

flows:
  feature:
    design: claude
    implement: codex
    review: claude
  bug:
    design: codex
    implement: claude
    review: codex
```

## Development flows (MANDATORY)

Classify the work BEFORE starting it, and announce the flow in one line: "Flow: feature (design Claude -> implementation Codex -> review Claude)" or "Flow: bug (design Codex -> implementation Claude -> review Codex)".

- **Bug** = existing behavior is wrong (a GitHub Issue with the `bug` label, a failing test, a user-reported defect). Everything else is a **feature**, refactors and docs included.
- The reviewer is the lineage that did NOT actually implement. Feature defaults: Codex implements, Claude reviews. Bug defaults: Claude implements, Codex reviews. If tool access requires Claude implementation, Codex reviews. Human-written PRs use both Claude and Codex reviewers from the existing catalog. Stop only when implementer and reviewer would be the same lineage. The single exception is when Codex is unavailable AND the user explicitly approved Claude taking the review step: use a separate Claude context that did not implement, and disclose it in the PR body. Never review in the implementing context.
- Codex runs only through `~/.claude/scripts/codex-exec-bg.sh` (see `agents.md`); it reads its model from `~/.codex/config.toml`. Do not pass `-m`, except `codex_alt` when the user names Astra in the conversation; then pass its pinned id with `-m`.
- **Codex edits files and runs tests; Claude commits.** Codex's sandbox protects `.git` (a worktree's git dir sits outside it entirely), so `git commit` from Codex fails. Claude reruns the tests, checks the diff, then commits.
- **Codex unavailable** (usage limit, not logged in, crash): STOP at the Codex step and ask the user: wait, or let Claude take that step. Never swap roles silently. Only the step taken over changes hands; when Claude takes the review step, it is a separate Claude subagent that did not implement. Say so in the PR body. A swapped role that nobody was told about is the failure this rule exists to stop.

- Tasks needing tools Codex's sandbox cannot reach (MCP, browser automation, etc.) are not Codex unavailability. Claude implements and Codex reviews; announce the actual implementer and routing.
- Light mechanical work and lookups use `Task(subagent_type="light-worker")`, in parallel for independent tasks.
- Generated agent frontmatter uses pinned ids, never aliases: alias mapping is runtime-dependent.
- Reviewer effort stays at the listed level until a measurement justifies raising it.

Burn 2026-09-19: Astra consumed excessive time and quota. Keep the default Codex role unless the user names Astra in the conversation.

## Rules for every other file

- Never write a model id (`claude-*-N-N`, `gpt-N...`) or a version name ("Opus 5.5", "Sol") outside this file, `~/.codex/config.toml`, `settings.json`, and the generated agent frontmatter. Write the role instead.
- Burn logs that quote a measured model stay as history; they are exempt from `--check` only on lines whose text after list markers and whitespace starts with `Burn` or `Measured`, followed by a date-ish token or colon, and contains no `-m `.

Why: on every model release the old ids sat in 45 files, and each switch meant hand-editing them all. Decided by the user 2026-10-29 (「モデルの運用方法だけ1ファイルにまとめて、新しいモデルが出るたびにそこを修正」).

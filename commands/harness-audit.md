---
description: Audit local harness configuration (commands/agents/skills/hooks/settings) and return a prioritized scorecard.
---

# Harness Audit

Evaluate `~/.claude/` harness configuration across 7 categories and produce a reproducible scorecard with top remediation actions. Runs entirely through the `harness-optimizer` subagent — no external script required.

## Usage

`/harness-audit [scope] [--format text|json] [--root path]`

- `scope` (optional): `repo` (default) | `hooks` | `skills` | `commands` | `agents`
- `--format` (optional): `text` (default) or `json`
- `--root` (optional): audit a directory other than `~/.claude/`

## Execution

Launch the `harness-optimizer` agent with the brief below. The agent performs every check with `Read`, `Grep`, `Glob`, and `Bash(ls/find)` against the target root — no product-code edits.

### Agent Brief

> Target root: `<root>` (defaults to `~/.claude/`).
> Scope: `<scope>`.
>
> For the requested scope, score each applicable category on a 0–10 scale using the checks below. Gather evidence with `Read`/`Grep`/`Glob`. Never invent checks outside this rubric. Deduct points only for concrete, file-referenceable issues.
>
> After scoring, output in the requested format (see "Output Contract" below).

### Scoring Rubric (version 2026-04-21)

Each category scores 0–10; `repo` scope sums all seven (max 70). Scoped audits return only the matching category.

| # | Category | Signals checked |
|---|---|---|
| 1 | Tool Coverage | `commands/*.md` count, `agents/*.md` count, presence of core commands (`verify`, `code-review`, `pr-create`, `commit-push`, `plan`, `tdd`) |
| 2 | Context Efficiency | broken references (grep for slash-commands / agent names that no longer exist), overlap/duplicates, commands >400 lines, commands calling nonexistent scripts |
| 3 | Quality Gates | presence of `verify`, `code-review`, `pre-pr-review`, `review-prs`, `e2e`, `smoke-test`, `test-coverage`, `security-review` |
| 4 | Memory Persistence | `MEMORY.md` exists at root, `memory/` directory exists, index size <= 200 lines, entries follow the required frontmatter |
| 5 | Eval Coverage | `skills/eval-harness/` present, `empirical-prompt-tuning` skill present, any `tests/` or `evals/` directory under root |
| 6 | Security Guardrails | `rules/security.md` present, `security-review` skill/command present, `settings.json` `permissions.deny` includes risky commands (e.g. `curl`, `rm -rf`), hook entries in `settings.json` |
| 7 | Cost Efficiency | `rules/performance.md` present with model routing, no duplicate commands (grep for near-identical descriptions), agent `model:` frontmatter set where appropriate |

### Deduction Guide

- Missing required file/entry: −3 to −5 per category (cap at 0)
- Broken reference (command/agent cited but file absent): −2 per occurrence, max −6
- Duplicate/near-duplicate command: −1 per pair, max −4
- Oversized config (command >400 lines, MEMORY.md >200 lines): −1 per occurrence, max −3

## Output Contract

### text format

```
Harness Audit (<scope>): <overall>/<max>
- Tool Coverage: <n>/10 — <1-line finding>
- Context Efficiency: <n>/10 — <1-line finding>
- Quality Gates: <n>/10 — <1-line finding>
- Memory Persistence: <n>/10 — <1-line finding>
- Eval Coverage: <n>/10 — <1-line finding>
- Security Guardrails: <n>/10 — <1-line finding>
- Cost Efficiency: <n>/10 — <1-line finding>

Top 3 Actions:
1) [<Category>] <concrete action> (<exact file path>)
2) [<Category>] <concrete action> (<exact file path>)
3) [<Category>] <concrete action> (<exact file path>)

Suggested skills to apply next: <skill names or "none">
```

### json format

```json
{
  "scope": "<scope>",
  "root": "<absolute path>",
  "rubric_version": "2026-04-21",
  "overall_score": 0,
  "max_score": 70,
  "categories": [
    {
      "name": "Tool Coverage",
      "score": 0,
      "max": 10,
      "findings": ["<finding 1>", "<finding 2>"],
      "failed_checks": [{ "check": "<id>", "path": "<file>" }]
    }
  ],
  "top_actions": [
    { "category": "<name>", "action": "<text>", "path": "<file>" }
  ],
  "suggested_skills": []
}
```

## Rules

- Scope `repo` audits all 7 categories. Scoped audits (`hooks`/`skills`/`commands`/`agents`) return only the matching category plus `overall_score` equal to that single category's score.
- Every failed check **must** cite an exact file path relative to the audited root.
- Scores are reproducible — re-running on the same filesystem must yield the same numbers.
- The agent may propose fixes but **must not** modify any file during the audit.

## Arguments

`$ARGUMENTS`:
- `repo|hooks|skills|commands|agents` (optional scope)
- `--format text|json` (optional)
- `--root <path>` (optional)

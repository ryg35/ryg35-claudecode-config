---
description: Review every open PR in ascending order, fix CRITICAL/HIGH by default, then ask how to ship each one.
argument-hint: [--limit N] [--label X] [--author X] [--dry-run] [--focus=...]
---

# /review-prs

Thin wrapper. The flow lives in one place: `~/.claude/skills/code-review/SKILL.md`.

**Read that file and execute it end to end, once per PR.** No reviewing here.

**Input**: $ARGUMENTS (`--limit` / `--label` / `--author` filter the PR list, `--dry-run` lists and stops)

Parameters to pass in:
- `mode=interactive`, target = `--all-open-prs`
- `preset-fix=critical-high`, so Gate 1 lists C/H を直す first with `(既定)`
- `<entry-point>` for Step 8 logging = `review-prs`

The preset is a default, not a skip. Both gates are asked for every PR.
After each PR ships, wait for `gh pr checks <n> --watch` before the next one.

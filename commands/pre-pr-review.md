---
description: Multi-agent parallel review of the local diff before opening a PR. Defaults to report-only, but still asks.
argument-hint: [--base=main] [--focus=code|data|security|errors|types|simplify|comments|tests|logic|ops|resilience]
---

# /pre-pr-review

Thin wrapper. The flow lives in one place: `~/.claude/skills/code-review/SKILL.md`.

**Read that file and execute it end to end.** Do not review the diff here.

**Input**: $ARGUMENTS

Parameters to pass in:
- `mode=interactive`, target = local diff (never a PR number)
- `preset-fix=none`, so Gate 1 lists 指摘だけ first with `(既定)`
- `<entry-point>` for Step 8 logging = `pre-pr-review`

The preset is a default, not a skip. Gate 1 is still asked. Gate 2 stays silent
when the user takes the default and no PR exists yet.

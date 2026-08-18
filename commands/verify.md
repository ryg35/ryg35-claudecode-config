---
description: Delegate to the verifier agent for a fresh-evidence PASS/FAIL verdict on build, types, lint, and tests.
argument-hint: [quick | full | pre-commit | pre-pr]
---

# /verify

Thin wrapper. The verification contract lives in `~/.claude/agents/verifier.md`
(read-only, fresh output only, PASS/FAIL/INCOMPLETE). Do not run the checks here.

Call `Agent(subagent_type="verifier")` with the scope taken from $ARGUMENTS:

- `quick` ... build and type check only
- `full` (default) ... build, types, lint, tests, plus a grep for console.log
  and for secrets across changed files, plus `git status` for uncommitted work
- `pre-commit` ... same set as `full`
- `pre-pr` ... `full`, and in the same message also launch `silent-failure-hunter`
  and, when TS/JS files changed, `typescript-reviewer`

Report the verdict as issued. A check that was not run is INCOMPLETE, never OK.

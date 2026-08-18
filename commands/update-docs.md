---
description: Delegate to the doc-updater agent to sync docs and codemaps from source of truth (package.json, .env.example, routes, imports/exports). Pass --skip-codemaps for docs only.
argument-hint: "[--skip-codemaps]"
---

# Update Documentation

Thin wrapper. The full workflow lives in the `doc-updater` agent
(`~/.claude/agents/doc-updater.md`). Read it and execute it.

**Input**: $ARGUMENTS

## Docs (always)

1. `package.json` scripts to a scripts reference table
2. `.env.example` to documented env vars (purpose and format)
3. `docs/CONTRIB.md`: dev workflow, available scripts, environment setup, testing
4. `docs/RUNBOOK.md`: deploy, monitoring and alerts, common failures, rollback
5. List docs untouched for 90+ days for manual review, do not delete them

Source of truth is `package.json` and `.env.example`. Never hand-write what can be generated.

## Codemaps (skipped when `--skip-codemaps` is passed)

6. Scan sources for imports, exports, dependencies
7. Regenerate token-lean codemaps: `docs/codemaps/architecture.md`, `backend.md`, `frontend.md`, `data.md`
8. Add a freshness timestamp to each, write the diff to `.reports/codemap-diff.txt`
9. If a codemap changed more than 30%, ask the user before writing

High-level structure only, not implementation details.

Finish with a diff summary.

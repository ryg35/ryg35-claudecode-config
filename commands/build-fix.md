---
description: Delegate to the build-error-resolver agent to fix build and type errors with minimal diffs until the build is green.
---

# /build-fix

Thin wrapper. The fix workflow lives in `~/.claude/agents/build-error-resolver.md`
(every error collected first, minimal diff each, build re-run after each fix).

Call `Agent(subagent_type="build-error-resolver")` and hand it these escalation
rules, which the agent definition does not carry:

- TypeScript type errors: use the `typescript-reviewer` agent to find the root
  cause before patching types, so the fix is not a cosmetic cast.
- Library or framework errors: look up current docs with the
  `documentation-lookup` skill (Context7) instead of guessing an API.
- Same error surviving 3 attempts: stop and switch to the
  `agent-introspection-debugging` skill. Still stuck after that, ask the user.

Report the agent's summary: errors fixed, errors left, new errors introduced.

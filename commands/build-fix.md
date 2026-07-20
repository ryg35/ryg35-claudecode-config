---
description: Iteratively run the build, group TypeScript/build errors by file, and fix them until the build is green.
---

# Build and Fix

Incrementally fix TypeScript and build errors:

1. Run build: npm run build or pnpm build

2. Parse error output:
   - Group by file
   - Sort by severity

2.5. **TypeScript Deep Analysis** (for TS type errors):
   - Use the `typescript-reviewer` agent to identify the root cause of errors
   - Understand the type design issue before fixing, rather than applying superficial type fixes

3. For each error:
   - Show error context (5 lines before/after)
   - Explain the issue
   - Propose fix
   - Apply fix
   - Re-run build
   - For library-related errors, refer to the latest documentation using the `documentation-lookup` skill (Context7)
   - Verify error resolved

4. Stop if:
   - Fix introduces new errors
   - Same error persists after 3 attempts → enter self-debugging mode using the `agent-introspection-debugging` skill. If still unresolved, ask the user for guidance
   - User requests pause

5. Show summary:
   - Errors fixed
   - Errors remaining
   - New errors introduced

Fix one error at a time for safety!

---
description: Delegate to the doc-updater agent to regenerate token-lean codemaps under docs/codemaps/.
---

# Update Codemaps

This command delegates to the `doc-updater` agent (`~/.claude/agents/doc-updater.md`). The steps below are the agent's expected workflow.

Analyze the codebase structure and update architecture documentation:

1. Scan all source files for imports, exports, and dependencies
2. Generate token-lean codemaps in the following format:
   - docs/codemaps/architecture.md - Overall architecture
   - docs/codemaps/backend.md - Backend structure  
   - docs/codemaps/frontend.md - Frontend structure
   - docs/codemaps/data.md - Data models and schemas

3. Calculate diff percentage from previous version
4. If changes > 30%, request user approval before updating
5. Add freshness timestamp to each codemap
6. Save reports to .reports/codemap-diff.txt

Use TypeScript/Node.js for analysis. Focus on high-level structure, not implementation details.

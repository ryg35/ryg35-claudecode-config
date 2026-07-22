# Performance Optimization

## Model Selection Strategy (Claude 5 era, updated 2026-07-22)

Role split decided by user (Fable quota is tight; see `~/.claude/rules/model-delegation.md`):

**Fable (main session)** ... judgment only:
- User dialogue, decisions, synthesis of subagent results
- Orchestration (routing work, launching agents in parallel)
- NEVER worker tasks that a subagent can do

**Sonnet 5 + effort xhigh** ... default worker:
- All implementation, exploration, planning drafts, docs, tests
- Worker agents in `~/.claude/agents/` are pinned to `model: claude-sonnet-5` + `effort: xhigh`

**Opus & Codex** ... reviewer tier:
- code-reviewer / security-reviewer / critic / verifier / database-reviewer / typescript-reviewer / silent-failure-hunter run on Opus
- Codex (`codex-exec-bg.sh`) for independent second opinions and executor-role default per `~/.claude/rules/agents.md`

**Haiku** ... trivial mechanical tasks only (rename sweeps, format-only passes)

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring
- Feature implementation spanning multiple files
- Debugging complex interactions

Lower context sensitivity tasks:
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## Ultrathink + Plan Mode

For complex tasks requiring deep reasoning:
1. Use `ultrathink` for enhanced thinking
2. Enable **Plan Mode** for structured approach
3. "Rev the engine" with multiple critique rounds
4. Use split role sub-agents for diverse analysis

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
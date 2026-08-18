# Performance Optimization

## Model Selection Strategy (Claude 5 era, updated 2026-08-14)

Role split decided by user (Fable quota is tight; see `~/.claude/rules/model-delegation.md`).
The dominant latency lever is effort, not model (sonnet xhigh measured median:
12.7 min/unit). For tiers that need more intelligence, raise the model and
drop effort one step (opus high).

**Fable (main session)** ... judgment only:
- User dialogue, decisions, synthesis of subagent results
- Orchestration (routing work, launching agents in parallel)
- NEVER worker tasks that a subagent can do

**Opus 5 + effort high** ... judgment-core workers:
- tdd-guide / planner / architect / tracer / executor / error-detective
- The tier where design judgment, causal reasoning, and implementation quality
  decide the outcome. Smarter than sonnet xhigh and faster than xhigh.

**Opus 5 + effort xhigh** ... reviewer tier (quality gate; slow is fine):
- code-reviewer / security-reviewer / critic / verifier / database-reviewer / typescript-reviewer / silent-failure-hunter
- Codex (`codex-exec-bg.sh`) for independent second opinions and executor-role default per `~/.claude/rules/agents.md`

**Sonnet 5 + effort high** ... all remaining workers:
- docs / scaffolding / exploration / CI generation: speed matters more than
  reasoning depth

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
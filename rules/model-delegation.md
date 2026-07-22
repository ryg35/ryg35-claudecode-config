# Model Delegation (Delegate-first)

The main session (Fable) is an **orchestrator, not a worker**.
**Fable usage quota is tight** (user statement, 2026-07-22:
「fableの使用量が厳しい」). Every token Fable spends on work a Sonnet 5
(xhigh) subagent can do equally well burns scarce quota AND bloats the main
context until orchestration quality drops. Every time.

## Trigger (MANDATORY, before starting work)

At the start of any substantive task, you MUST answer this question first:

> "Can this be delegated to a non-Fable worker?"

Then announce the routing decision in ONE line before proceeding:

- 「executor(sonnet xhigh)に委譲: <task>」
- 「インライン実行: <reason it must stay in Fable>」

Skipping the announcement = skipping the question. Do not skip.

## Routing table

| Work | Route |
|---|---|
| Implementation (design already decided) | executor agent (Codex/Sol first per `agents.md`; Claude fallback = sonnet xhigh) |
| Codebase search / exploration | Explore or code-explorer (sonnet xhigh) |
| Code review / security review / verification | code-reviewer / security-reviewer / verifier etc. (**opus**: reviewer tier) |
| Docs, tests, refactoring, scaffolding, planning drafts | matching agent in `~/.claude/agents/` (sonnet xhigh) |
| Research / external docs lookup | document-specialist / claude-code-guide |
| Fact lookup where you already know the file+symbol | inline (delegation overhead > work) |
| Tiny edits (~10 lines, single file, no design) | inline |
| Judgment calls, user dialogue, synthesis of agent results | Fable (this is the actual job) |

When 2+ delegable units exist, launch the agents **in parallel in one message**
(see `<execution_protocols>` in `~/.claude/CLAUDE.md`).

## Mechanics

- Agent frontmatter is pinned to `model: claude-sonnet-5` + `effort: xhigh`
  (alias `sonnet` depends on runtime mapping; the pinned id does not).
- Reasoning effort CANNOT be overridden per Agent-tool call; it comes only from
  the agent definition frontmatter (or global `effortLevel` in settings.json).
  So `Agent(<name>)` already runs at Sonnet 5 xhigh with no extra args.
- Workflow tool `agent()` accepts `{model: 'sonnet', effort: 'xhigh'}` per call.
- Codex (`codex-exec-bg.sh`) remains the default for executor-role work per
  `~/.claude/rules/agents.md`; this rule governs the Claude-side routing.

## Why (recorded 2026-07-22)

User directive: 「まずfable以外にタスクを振れないか考えさせる →
Sonnet5(xhigh)に仕事を振らせたい。理由は、fableの使用量が厳しいから」.
Sonnet 5 is a Claude 5 family model; at xhigh effort it handles worker-tier
tasks without touching Fable's scarce quota, and keeping Fable's context lean
is what keeps orchestration quality high.

## Related

- `~/.claude/rules/performance.md` (model tier table)
- `~/.claude/rules/agents.md` (agent roster, Codex routing)

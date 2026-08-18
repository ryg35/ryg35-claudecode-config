# Model Delegation (Delegate-first)

The main session (Fable) is an **orchestrator, not a worker**.
**Fable usage quota is tight.** Every token Fable spends on work a subagent
(Opus/Sonnet worker) can do equally well burns scarce quota AND bloats the main
context until orchestration quality drops. Every time.

## Trigger (MANDATORY, before starting work)

At the start of any substantive task, you MUST answer this question first:

> "Can this be delegated to a non-Fable worker?"

Then announce the routing decision in ONE line before proceeding. The
announcement MUST state the parallelism degree:

- 「委譲: N並列 (A / B / C)」 ... N>=2, all independent units in ONE message
- 「委譲: 1並列 (<task>) ... 直列理由: <後続が前の成果物に依存する等>」
- 「インライン実行: <reason it must stay in Fable>」

Skipping the announcement = skipping the question. Do not skip.
Announcing 1並列 without a 直列理由 = skipping the decomposition. Do not skip.

## Decompose-then-dispatch (MANDATORY)

Before delegating, decompose the task into units and classify each edge as
"depends on" or "independent". One line is enough (e.g. 「A→B→C, Dは独立」).
Then:

1. Every unit with no unmet dependency is launched **in the same message**
   (multiple Agent calls in one response). Sequential launch of independent
   units is a rule violation, not a style choice.
2. Units with dependencies wait, and get launched the moment their inputs
   arrive, again batched with whatever else is ready.

"Launch in the same message" covers EVERY worker start, not just Agent tool
calls: a Codex-routed executor (`Bash` + `codex-exec-bg.sh`,
`run_in_background: true`) is batched into the same message alongside Agent
calls as one dispatch wave. The announcement fires once per dispatch wave;
follow-up waves inside the same task (e.g. review after implement) re-declare
in one line, nothing more.

**Out of scope (no violation, no justification burden beyond the 1-line
直列理由):** inherently serial work. Chains where each step consumes the
previous step's output (implement → review → fix), single-unit tasks with
nothing to split, and interactive work that needs the user between steps.
The rule forces parallelism only where independence actually exists; it
never demands artificial splitting of serial work.

Measured burn (2026-08-11): across 12 sessions / 13 subagent calls, parallel
launches = 0, serial rate = 100%, even for provably independent pairs
(Explore + document-specialist launched 6 minutes apart). Workers run at
xhigh (median 12.7 min/unit); serial dispatch exposes that full cost every
time. Parallel dispatch is the ONLY thing that hides it.

## Pick up completions immediately (MANDATORY)

A background agent's completion notification only arrives when the main
session next acts. Launch-and-idle leaves finished work unread (measured:
5.4 min of real work took 18.6 min wall because the completion sat unread
for 13 min). After launching background agents, if you have no other work
to continue with, arm a fallback wakeup (ScheduleWakeup, 1200s+) instead of
ending the turn silently, and synthesize results the moment a notification
arrives. Do not launch a worker and then let its result rot.

## Routing table

| Work | Route |
|---|---|
| Implementation (design already decided) | executor agent (Codex/Sol first per `agents.md`; Claude fallback = **opus high**) |
| Judgment-heavy workers (tdd-guide / planner / architect / tracer / error-detective) | **opus high** |
| Codebase search / exploration | Explore or code-explorer (sonnet high) |
| Code review / security review / verification | code-reviewer / security-reviewer / verifier etc. (**opus xhigh**: reviewer tier) |
| Docs, tests, refactoring, scaffolding, planning drafts | matching agent in `~/.claude/agents/` (sonnet high) |
| Research / external docs lookup | document-specialist / claude-code-guide |
| Fact lookup where you already know the file+symbol | inline (delegation overhead > work) |
| Tiny edits (~10 lines, single file, no design) | inline |
| Judgment calls, user dialogue, synthesis of agent results | Fable (this is the actual job) |

When 2+ delegable units exist, launch the agents **in parallel in one message**
(see `<execution_protocols>` in `~/.claude/CLAUDE.md`).

## Mechanics

- Agent frontmatter uses pinned ids (`claude-opus-5` / `claude-sonnet-5`;
  aliases depend on runtime mapping, pinned ids do not). Tiers as of 2026-08-14:
  - 6 judgment-core workers (tdd-guide / planner / architect / tracer /
    executor / error-detective) = `claude-opus-5` + `effort: high`
    (smarter than sonnet xhigh AND faster than xhigh)
  - 7 reviewers = `claude-opus-5` + `effort: xhigh` (quality gate; slow is fine)
  - all remaining workers = `claude-sonnet-5` + `effort: high` (docs /
    scaffolding / exploration need speed, not reasoning depth)
- Reasoning effort CANNOT be overridden per Agent-tool call; it comes only from
  the agent definition frontmatter (or global `effortLevel` in settings.json).
  So `Agent(<name>)` already runs at its pinned tier with no extra args.
- Workflow tool `agent()` accepts `{model: 'sonnet', effort: 'xhigh'}` per call.
- Codex (`codex-exec-bg.sh`) remains the default for executor-role work per
  `~/.claude/rules/agents.md`; this rule governs the Claude-side routing.

## Related

- `~/.claude/rules/performance.md` (model tier table)
- `~/.claude/rules/agents.md` (agent roster, Codex routing)

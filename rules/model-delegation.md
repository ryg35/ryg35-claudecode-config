# Model Delegation (Delegate-first)

The main session (Fable) is an **orchestrator, not a worker**. Quota is tight, and every
token Fable spends on delegable work also bloats the main context until orchestration
quality drops. Every time.

## Trigger (MANDATORY, before starting work)

At the start of any substantive task, you MUST answer first: "Can this be delegated to
a non-Fable worker?" Then announce the routing in ONE line, stating the parallelism:

- 「委譲: N並列 (A / B / C)」 ... N>=2, all independent units in ONE message
- 「委譲: 1並列 (<task>) ... 直列理由: <後続が前の成果物に依存する等>」
- 「インライン実行: <reason it must stay in Fable>」

Skipping the announcement = skipping the question. Do not skip.
Announcing 1並列 without a 直列理由 = skipping the decomposition. Do not skip.

## Decompose-then-dispatch (MANDATORY)

Decompose into units, classify each edge as "depends on" or "independent" (one line:
「A→B→C, Dは独立」). Then:

1. Every unit with no unmet dependency launches **in the same message**. Sequential
   launch of independent units is a rule violation, not a style choice. This covers
   EVERY worker start: a Codex-routed executor (`Bash` + `codex-exec-bg.sh`,
   `run_in_background: true`) batches into the same wave as Agent calls, one
   announcement per wave.
2. Dependent units wait, then launch the moment their inputs arrive, batched with
   whatever else is ready.

**Out of scope (no violation, no burden beyond the 1-line 直列理由):** inherently serial
work. Chains where each step consumes the previous output (implement → review → fix),
single-unit tasks, and interactive work needing the user between steps. The rule forces
parallelism only where independence exists; never split serial work artificially.

Measured burn 2026-08-11: 12 sessions / 13 subagent calls, parallel launches = 0,
serial rate 100%, even for provably independent pairs. Sonnet workers run at effort
high; xhigh was measured at median 12.7 min/unit and is reserved for reviewers.

## Pick up completions immediately (MANDATORY)

A completion notification only arrives when the main session next acts. Launch-and-idle
leaves finished work unread: 5.4 min of real work took 18.6 min wall because it sat
unread 13 min. With no other work to continue, arm a fallback wakeup (ScheduleWakeup,
1200s+) instead of ending the turn silently, and synthesize the moment it arrives.

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

## Tiers (merged from performance.md, 2026-08-14)

| Tier | Who | Why |
|---|---|---|
| Fable | user dialogue, decisions, synthesis, orchestration | judgment only, NEVER worker tasks |
| `claude-opus-5` + `effort: high` | tdd-guide / planner / architect / tracer / executor / error-detective | smarter than sonnet xhigh AND faster |
| `claude-opus-5` + `effort: xhigh` | code-reviewer / security-reviewer / critic / verifier / database-reviewer / typescript-reviewer / silent-failure-hunter | quality gate, slow is fine |
| `claude-sonnet-5` + `effort: high` | all remaining workers (docs / scaffolding / exploration / CI) | speed over reasoning depth |
| haiku | trivial mechanical only (rename sweeps, format-only passes) | |

- Frontmatter uses pinned ids (`claude-opus-5` / `claude-sonnet-5`); aliases depend on
  runtime mapping, pinned ids do not. Codex (`codex-exec-bg.sh`) stays the executor-role
  default per `~/.claude/rules/agents.md`.
- Effort CANNOT be overridden per Agent-tool call (it comes from the agent frontmatter,
  or global `effortLevel` in settings.json). Workflow `agent()` takes `{model, effort}`.
- Avoid the last 20% of the context window for multi-file refactors; single-file edits
  and doc updates are fine there.
- Testing bar for workers: TDD (RED → GREEN → IMPROVE), 80%+ coverage, unit +
  integration + E2E (Playwright), via tdd-guide / e2e-runner.

## Related

- `~/.claude/rules/agents.md` (agent roster, Codex routing)

# Model Delegation (Delegate-first)

The main Claude session is an **orchestrator, not a worker**. Quota is tight, and every
token the main session spends on delegable work also bloats the main context until orchestration
quality drops. Every time.

## Trigger (MANDATORY, before starting work)

At the start of any substantive task, you MUST answer first: "Can this be delegated to
a subagent or Codex worker?" Then announce the routing in ONE line, stating the parallelism:

- 「委譲: N並列 (A / B / C)」 ... N>=2, all independent units in ONE message
- 「委譲: 1並列 (<task>) ... 直列理由: <後続が前の成果物に依存する等>」
- 「インライン実行: <reason it must stay in the main session>」

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
serial rate 100%, even for provably independent pairs. Workers run at effort low or medium; xhigh was measured at median 12.7 min/unit; reviewers run at high since 2026-09-24.

Every delegation prompt and Workflow script ends with this line: "Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better." Claude paces multiagent work to time signals and finishes sooner with it (Anthropic, Prompting Claude, "Time signals for multiagent harnesses").

## Pick up completions immediately (MANDATORY)

A completion notification only arrives when the main session next acts. Launch-and-idle
leaves finished work unread: 5.4 min of real work took 18.6 min wall because it sat
unread 13 min. With no other work to continue, arm a fallback wakeup (ScheduleWakeup,
1200s+) instead of ending the turn silently, and synthesize the moment it arrives.

## Routing table

| Work | Route |
|---|---|
| Implementation (design already decided) | Feature: Codex implements; bug: Claude (judgment tier), via tdd-guide. Follow `rules/model-roles.md`; if Codex is unavailable, stop and ask, never silently swap |
| Judgment-heavy workers (tdd-guide / planner / architect / tracer / error-detective) | Design: feature Claude, bug Codex. Implementation: feature Codex, bug Claude. Claude support agents use their assigned tier |
| Codebase search / exploration | `Task(subagent_type="light-worker")` for mechanical lookups, in parallel when independent; Explore or code-explorer |
| Code review / security review | Feature: Claude; bug: Codex, adjusted to the actual implementer per `rules/model-roles.md` |
| Verification (verifier) | Claude in both flows; evidence check, not review |
| Docs, tests, refactoring, scaffolding, planning drafts | Follow the feature/bug flow in `rules/model-roles.md`; Claude support agents use their assigned tier |
| Research / external docs lookup | document-specialist / claude-code-guide |
| Fact lookup where you already know the file+symbol | inline (delegation overhead > work) |
| Tiny edits (~10 lines, single file, no design) | inline |
| Judgment calls, user dialogue, synthesis of agent results | main session (this is the actual job) |

Tiers, model ids and effort live in rules/model-roles.md.

Measured 2026-10-01 (3 diffs): xhigh found the same HIGH count as high (4/19) at 1.8x wall time for code-reviewer, and no difference at 2x for security-reviewer.

- Effort CANNOT be overridden per Agent-tool call (it comes from the agent frontmatter,
  or global `effortLevel` in settings.json). Workflow `agent()` takes `{model, effort}`.
- Avoid the last 20% of the context window for multi-file refactors; single-file edits
  and doc updates are fine there.
- Testing bar for workers: TDD (RED → GREEN → IMPROVE), 80%+ coverage, unit +
  integration + E2E (Playwright), via tdd-guide / e2e-runner.

## Related

- `~/.claude/rules/agents.md` (agent roster, Codex routing)

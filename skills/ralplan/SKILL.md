---
name: ralplan
description: "Consensus-planning shortcut. Invokes the plan skill in --consensus mode with RALPLAN-DR structured deliberation, and acts as a gate that auto-intercepts vague ralph/team/autopilot requests before they spin up heavy execution."
user_invocable: true
argument-hint: "[--interactive] [--deliberate] [--architect codex] [--critic codex] <task description>"
---

# Ralplan Skill (/ralplan)

## Purpose

Two jobs:

1. **Shortcut.** `/ralplan "..."` is the same as `/plan --consensus "..."`. It runs the Planner → Architect → Critic loop with RALPLAN-DR structured deliberation (short mode by default, deliberate mode for high-risk work). Use it when you know you want consensus planning without typing `--consensus`.

2. **Pre-execution gate.** Vague execution requests like `ralph fix this` or `team improve performance` waste cycles because workers have no clear target. Ralplan intercepts those, redirects them through consensus planning, and then hands off to the requested execution mode with a tight, bounded plan.

This is a thin wrapper. The actual planning behavior lives in the `plan` skill.

## Use when

- The user says "ralplan", "consensus plan", or "deliberate plan".
- The user fired off `ralph X` or `team X` or `autopilot X` where X is a vague verb with no file/function/issue reference.
- The decision is hard to reverse (auth/security, schema migration, public API breakage, production incident).

## Do not use when

- The user already wrote a specific plan and wants execution. Use `ralph` or `team` directly.
- The user wants a single-pass plan. Use the `/plan` command.
- The user wants to drive requirements out of a vague idea via Q&A. Use `deep-interview` or `autopilot`.
- The request is small and obvious. Just do it.

---

## Flags

- `--interactive`: prompt the user at the draft-review step and at the final approval step. Without it, run fully automated: Planner → Architect → Critic, mark the final plan `pending approval`, output it, and stop.
- `--deliberate`: force deliberate mode (pre-mortem with 3 failure scenarios + expanded test plan covering unit / integration / e2e / observability). Without the flag, deliberate mode auto-enables when the request signals high risk.
- `--architect codex`: use Codex CLI for the Architect pass via `codex-exec-bg.sh`. Falls back to Claude Architect if Codex CLI is missing.
- `--critic codex`: use Codex CLI for the Critic pass via `codex-exec-bg.sh`. Falls back to Claude Critic if Codex CLI is missing.
- `--with-codex`: after Claude consensus reaches Critic APPROVE, invoke `Skill("codex-converge")` against the plan file to harden it via independent Codex review until P1 = 0 for two consecutive rounds. Skipped by default (Claude consensus alone is enough for most plans). Opt in when the plan is load-bearing (auth / schema migration / public API / destructive change) and you want an external reviewer signal before commit.
- `--codex-max-rounds N`: passed through to `codex-converge` (default 15). Only meaningful with `--with-codex`.

## Examples

```
/ralplan "add OAuth2 login with refresh tokens"
/ralplan --interactive "rebuild the cache module to support sharding"
/ralplan --deliberate "migrate the users table from int IDs to ULIDs"
/ralplan --critic codex "introduce a feature flag system across the API"
```

---

## Behavior

This skill invokes the `plan` skill in consensus mode:

```
Skill("plan") with arguments: --consensus [other flags] "<task>"
```

For full details on the consensus workflow, RALPLAN-DR summary requirements, the ADR section, the re-review loop, and the approval gate, read the `plan` skill's SKILL.md.

### Planning / execution boundary

Ralplan is a planning module. It may inspect context and draft / update plan artifacts only. It marks every artifact `pending approval` unless the user has explicitly opted into execution this turn. Before approval, it does not edit source files, run mutating shell commands, commit, push, open PRs, or invoke execution skills.

---

## Pre-execution gate

The gate exists because execution modes (`ralph`, `team`, `autopilot`) spin up heavy multi-agent orchestration. Launched on a vague request, agents waste cycles on scope discovery instead of execution.

### When the gate fires

The gate fires when a prompt contains an execution keyword (`ralph`, `team`, `autopilot`) AND is too vague to act on. "Too vague" means: short (about 15 effective words or less) AND no concrete anchor.

### Concrete anchors that auto-pass the gate

Any one of these is enough:

| Anchor type | Example | Why it passes |
|---|---|---|
| File path | `ralph fix src/hooks/bridge.ts` | References a specific file |
| Issue / PR number | `ralph implement #42` | Has a concrete work item |
| camelCase symbol | `ralph fix processKeywordDetector` | Names a specific function |
| PascalCase symbol | `ralph update UserModel` | Names a specific class |
| snake_case symbol | `team fix user_model` | Names a specific identifier |
| Test runner | `ralph npm test && fix failures` | Has an explicit test target |
| Numbered steps | `ralph do:\n1. Add X\n2. Test Y` | Structured deliverables |
| Acceptance criteria | `ralph add login - acceptance criteria: ...` | Explicit success definition |
| Error reference | `ralph fix TypeError in auth` | Specific error to address |
| Code block | <code>ralph add: \`\`\`ts ... \`\`\`</code> | Concrete code provided |
| Escape prefix | `force: ralph do it` or `! ralph do it` | Explicit user override |

### Gate decision tree

```
1. Is the prompt prefixed with `force:` or `!`? → Pass.
2. Does the prompt mention an execution keyword (ralph / team / autopilot)?
   - No → Not our concern. Skip.
   - Yes → Continue.
3. Does the prompt contain any concrete anchor from the table above? → Pass.
4. Is the effective word count > 15 with substantive detail? → Pass.
5. Otherwise → Gate. Redirect to ralplan consensus planning.
```

### Redirect message template

When the gate fires:

> Heads up: I'm redirecting this through `/ralplan` first.
> The request mentions `<execution-keyword>` but does not include a file, function, issue, test, or explicit acceptance criteria. Running execution without that scope wastes cycles.
>
> Consensus planning will produce a tight, bounded plan, then I'll hand off to `<execution-keyword>` when you approve it.
>
> To bypass: prefix with `force:` (e.g. `force: ralph do it`) or `!`.

Then proceed with the consensus flow.

### End-to-end example

```
User: ralph add user authentication
```

1. Gate detects execution keyword (`ralph`) + no concrete anchor → fire gate.
2. Show redirect message.
3. Run `plan --consensus` on the task:
   - Planner drafts the plan (which files, what auth method, what tests).
   - Architect reviews for soundness.
   - Critic validates testability and quality.
4. On consensus approval, present execution options via `AskUserQuestion`:
   - Approve and hand off to `team` (parallel, recommended).
   - Approve and hand off to `ralph` (sequential with verification).
   - Approve and compact context first, then `ralph`.
   - Request changes.
   - Reject.
5. Execution begins with a clear, bounded plan.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Gate fires on a prompt you consider well-specified | Add a file reference, function name, or issue number. |
| Want to bypass the gate | Prefix with `force:` or `!`. |
| Gate did not fire on a prompt you consider vague | The gate only catches short prompts with no anchor. For longer vague prompts, run `/ralplan` explicitly. |
| Redirected to ralplan but wanted execution | Use the structured approval option after consensus, or explicitly name the execution skill in the approval step. Saying "just do it" alone only marks the plan `pending approval`. |

---

## Final checklist

- [ ] Consensus loop ran Planner → Architect → Critic sequentially (not parallel).
- [ ] RALPLAN-DR summary included Principles (3-5), Decision Drivers (top 3), Viable Options (>= 2 or invalidation rationale).
- [ ] Final plan includes ADR section.
- [ ] In `--deliberate` mode: pre-mortem (3 scenarios) and expanded test plan included.
- [ ] In `--interactive`: user approval captured before execution.
- [ ] Without `--interactive`: plan output marked `pending approval`, no auto-execution.
- [ ] Gate redirect (if fired) explicitly told the user what was redirected and why.

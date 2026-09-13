---
name: autopilot
description: "Take a 1-2 sentence vague idea through requirements, prior-art research, and implementation plan in one flow. Sparring-partner skill for the 'haven't decided what to build yet' stage. Autopilot decides WHAT to build; the spec-driven skill pins down HOW it is specified; /vibe implements. Hands off to spec-driven (work big enough to need a spec) or /vibe (work small enough to skip one)."
user_invocable: true
argument-hint: "[<vague idea>]"
---

# Autopilot Skill (/autopilot)

## Purpose

Take a vague idea ("I want something like ..." level) and produce **an approved requirements doc + implementation plan**. Acts as a sparring partner. **Implementation is delegated: `spec-driven` for work big enough to need a spec, `/vibe` for work small enough to skip one.** Autopilot is the idea-to-plan entry; vibe is the plan-to-PR exit.

## Boundary with vibe

| | autopilot | vibe |
|---|---|---|
| Entry | Vague idea (1-2 sentences) | Approved plan / existing branch |
| Exit | `docs/requirements/*.md` + `docs/plan/*.md` | PR |
| Phases | Sparring -> requirements -> plan | Plan -> implementation -> PR |
| Mode | Interactive with user | Mostly autonomous |

When autopilot finishes, it asks which handoff to take at the exit (Phase 4).
This skill solves "haven't decided what to build". `/vibe` handles "how to build it".

## Boundary with spec-driven

**Autopilot is the "we have not decided what to build yet" stage; `spec-driven` is the "the thing is decided, now freeze the spec" stage.** Autopilot converges an idea into requirements; spec-driven turns those requirements into `specs/<NNN>-<slug>/spec.md` + `plan.md` + `tasks.md` and freezes them for implementation.

## Use when

- You have an idea but the requirements are not nailed down.
- "I want an app like ..." or "I want this feature" level vagueness.
- You want prior-art research before implementing (to avoid reinventing).
- You want a sparring partner (solo thinking loops back on itself).

## Do not use when

- The request is already detailed -> go straight to `/plan` or `/vibe`.
- One-off bug fix -> implement directly.
- Brainstorming or divergence -> autopilot is a convergence tool.
- Light existing-code patch -> autopilot is heavy, `/plan` is enough.

---

## Phase 0: Receive and confirm

1. Capture `$ARGUMENTS` as `initial_idea`.
2. If empty, ask "describe what you want to build in 1-2 sentences" and wait.
3. Announce:

```
Autopilot started.
Idea: "<initial_idea>"

Three phases ahead:
  Phase 1. Requirements (run deep-interview to drive out ambiguity)
  Phase 2. Prior-art research (ETHOS "Search before building")
  Phase 3. Implementation plan (planner produces a plan file)

I will pause for confirmation after each phase. Say "stop" any time to halt.
I will NOT implement. That belongs to spec-driven (spec first) or /vibe.
```

---

## Phase 1: Requirements (invoke deep-interview)

Invoke `Skill("deep-interview")` and pass `initial_idea` as the argument.

deep-interview outputs:
- `docs/requirements/<verb>-<topic>.md` (frontmatter `status: pending-approval`, `ambiguity: <score>`)

Once deep-interview has written its pending-approval spec, Phase 1 is complete.

deep-interview's Phase 5 bridge offers several options. In the autopilot context, the right next step is **Phase 2**. Surface that choice:

```
Phase 1 complete. Requirements spec: <path>
Ambiguity: <score>%

Advance to Phase 2 (prior-art research)?
  [Yes, continue]
  [No, stop here] (keep the spec, end the skill)
  [Back to interview] (more rounds in deep-interview)
```

---

## Phase 2: Prior-art research (ETHOS "Search before building")

Before any new implementation, search the three layers:

### Layer 1: Established standards
- Check whether the language / framework built-ins already solve this.
- Use the `documentation-lookup` skill to consult official docs (when applicable).
- Example: "task management SaaS" -> Todoist / TickTick / Things as standard patterns.

### Layer 2: Recent popular approaches (blog posts, current trends)
- Look at the dominant approach from the last 1-2 years.
- `WebFetch` is denied, so use `gh search code` or `mcp__context7__resolve-library-id` / `mcp__context7__query-docs`.
- Example: "LLM chat UI" -> Vercel AI SDK, Mastra, LangChain.

### Layer 3: First principles (specific to this problem)
- If Layers 1-2 do not answer, design from scratch.
- This is a good place to invoke `/second-opinion`.

### Output

Write `docs/research/<verb>-<topic>.md` (kebab-case, consistent with `~/.claude/agents/planner.md`):

```markdown
# Prior Art Research: <title>

## Queries used
- ...

## Layer 1: Established standards
- Findings: ...
- Relevance: high / medium / low
- Adoption candidates: ...

## Layer 2: Recent popular approaches
- Findings: ...
- Relevance: high / medium / low
- Adoption candidates: ...

## Layer 3: Pieces that require first-principles design
- Where existing solutions fall short: ...
- Decisions needed: ...

## Conclusion
- "Mostly solved by existing <X>", OR
- "Build on top of <X> with custom <Y>", OR
- "Entirely new. First-principles design needed."

## Impact on the requirements spec
- If anything in the spec changes, list those updates as bullets.
```

Then ask the user:

```
Phase 2 complete. Research: <path>

Summary: <2-3 sentence conclusion>

Advance to Phase 3 (implementation plan)?
  [Yes, plan it]
  [Update requirements first] (revise spec, then plan)
  [Stop here] (keep research, end the skill)
```

---

## Phase 3: Implementation plan (invoke planner)

Spawn the `planner` agent via the Task tool.
Inputs:
- Phase 1 requirements spec (`docs/requirements/<slug>.md`)
- Phase 2 research (`docs/research/<slug>.md`)

planner follows `~/.claude/agents/planner.md` and produces:
- `docs/plan/<verb>-<topic>.md` (frontmatter `status: backlog`)
- A `## Self-Critic` section at the bottom (mandated by planner.md)

If the work is clearly spec-scale (several files / a new feature / acceptance criteria still fuzzy), **skip this planner pass** and let `spec-driven` write `specs/<NNN>-<slug>/plan.md` instead. Two plans for the same work is forbidden by Rule 6 in `~/.claude/skills/directory-conventions/SKILL.md`.

Instruction to planner:
```
Follow ~/.claude/agents/planner.md strictly.
Inputs:
- Requirements: <path>
- Research: <path>
- Branch name candidate: <feat/<verb>-<topic> or fix/...>

Do not skip the Self-Critic section. Fill all six items.
```

After the plan is written, surface it to the user:

```
Phase 3 complete. Plan: <path>

| Section | Content |
|---|---|
| Goal | <one sentence> |
| Confidence | <high|medium|low> |
| Rollback path | <summary> |

Approve?
  [Approve, go to the Phase 4 handoff] (flip plan status to active, then pick spec-driven or /vibe)
  [Revise plan] (return feedback to planner)
  [Stop here] (keep plan as backlog, end the skill)
```

---

## Phase 4: Bridge to spec-driven or vibe (implementation NOT included)

Once the user approves in Phase 3, autopilot **terminates**. Pick the handoff by size:

| Handoff | When |
|---|---|
| `spec-driven` skill | Several files, a new feature, or acceptance criteria still fuzzy. It produces `specs/<NNN>-<slug>/spec.md` + `plan.md` + `tasks.md`. |
| `/vibe <slug>` | One file, an obvious change, requirements already sharp. No spec is written. |

**`docs/requirements/<slug>.md` from Phase 1 is the draft of `spec.md`.** Hand the path to spec-driven as-is. The User Stories, acceptance criteria, and open questions carry over; do not restart the interview from a blank page and do not throw the file away.

Final output:

```
Autopilot finished.

Artifacts:
- Requirements: docs/requirements/<slug>.md  (draft for spec.md)
- Research: docs/research/<slug>.md
- Plan: docs/plan/<slug>.md (status: active)   (omitted if the planner pass was skipped for spec-driven)

Next, pick one:
  spec-driven   turns the requirements doc into specs/<NNN>-<slug>/spec.md + plan.md + tasks.md
  /vibe <slug>  goes straight to implementation from the plan above

Or manually:
  - Re-read the Self-Critic section in the plan
  - `git checkout -b <branch>` to start the branch
  - Begin implementation
```

**Autopilot must not invoke any implementation skill.** Stop until the user runs `spec-driven`, `/vibe`, or another implementation flow explicitly. This is User Sovereignty in action. Despite the name, autopilot is autonomous up to the plan and human-triggered at implementation.

---

## What you must not do

- **Advance into implementation.** Autopilot ends at the plan; the spec belongs to `spec-driven` and the implementation belongs to vibe.
- **Skip the per-phase user confirmation.** Always stop at the end of each phase.
- **Skip deep-interview or planner with "just implement it".** That violates ETHOS "Boil the lake".
- **Ignore an existing solution found in Phase 2 and still plan a new implementation.** Search-before-building violation.

---

## Error handling

- deep-interview cannot reach the ambiguity threshold (hits round 20 hard cap) -> the spec lands with `EARLY_EXIT` status. Ask the user "advance to Phase 2 anyway, or stop?"
- Phase 2 reveals "an existing tool fully solves this" -> tell the user "you do not need to build this, consider adopting <X>", then stop.
- planner cannot fill the Self-Critic section due to missing info -> return to Phase 1.

---

## ETHOS alignment

| ETHOS | autopilot implementation |
|---|---|
| Boil the lake | Run all three phases. Do not skip Phase 2 research. |
| Search before building | Phase 2 is the dedicated step. |
| User sovereignty | Confirmation at the end of every phase; no silent advance. |
| Question the initial frame | deep-interview's Challenge modes (Contrarian / Simplifier / Ontologist) probe the assumed framing. |
| Build for yourself | The skill itself solves "I want a sparring partner". |

---

## Optional configuration

`~/.claude/settings.json`:

```json
{
  "omc": {
    "autopilot": {
      "skipResearch": false,
      "researchDepth": "standard"
    },
    "deepInterview": {
      "ambiguityThreshold": 0.2
    }
  }
}
```

- `skipResearch: true` skips Phase 2 (NOT recommended; ETHOS violation).
- `researchDepth: "quick"|"standard"|"deep"` controls how deep Layers 1-3 are explored.

---

## voice.md compliance

- No em dash.
- No AI vocabulary.
- Phase summaries and reports stay concrete. Avoid "seamless", "robust", "comprehensive", etc.
- Keep user-facing reports short and to the point.

Task: $ARGUMENTS

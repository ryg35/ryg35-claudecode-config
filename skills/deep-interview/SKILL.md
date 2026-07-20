---
name: deep-interview
description: Socratic deep interview that mines vague ideas via iterative one-question-at-a-time Q&A, scores ambiguity per round, and refuses to proceed to implementation until ambiguity drops below the resolved threshold. Native Claude Code only, no OMC runtime dependency.
user_invocable: true
argument-hint: "[<vague idea or description>]"
---

# Deep Interview Skill (/deep-interview)

## Purpose

AI can build anything. The hard part is knowing what to build.
This skill drives Socratic iterative questioning to surface what the user is **assuming**, then blocks the transition to implementation until clarity passes the threshold.

Inspired by the Ouroboros project (https://github.com/Q00/ouroboros).

## Use when

- The starting point is a vague idea ("I want something like ...").
- You want to prevent "that's not what I meant" outcomes after implementation.
- One ask-brief question is not enough; you need iterative drilling.
- Called from autopilot Phase 0 (idea-to-requirements entry).

## Do not use when

- The request already has file paths, function names, or acceptance criteria. Implement directly.
- A single question is enough. Use `/ask-brief` instead.
- The intent is brainstorming or divergence. This skill is a convergence tool.
- The user explicitly says "skip questions" / "just do it". Stop with a pending-approval spec instead of running questions.

---

## Phase 0: Resolve the ambiguity threshold

Lock the threshold that gates implementation before doing anything else.

1. Read `omc.deepInterview.ambiguityThreshold` from `~/.claude/settings.json`.
2. If a project-level `./.claude/settings.json` exists with the same key, it overrides.
3. If neither is set, use the default `0.2` (= 20%).

Emit this single line first:

```
Deep Interview threshold: <pct>% (source: <user|project|default>)
```

Do not ask any question, score any round, or write any spec until this line has been emitted.

---

## Phase 1: Initialization

### Input analysis
- Capture `$ARGUMENTS` as `initial_idea`.
- If no argument is supplied, ask the user "describe what you want to build in 1-2 sentences" and wait.

### Brownfield vs greenfield
- If the cwd contains source code / package files / git history AND the idea references modifying or extending that codebase, mark this **brownfield**.
- Otherwise mark **greenfield**.

### Brownfield pre-exploration
- Spawn `Task(subagent_type="code-explorer")` to map the relevant code areas.
- Store the result as `codebase_context`.
- **Never ask the user about facts the code already reveals.** Gather them with explore first.

### Opening announcement

```
Deep Interview threshold: <pct>% (source: <source>)

I will ask one question at a time. After each answer I will display the
current clarity score. Once ambiguity drops below <pct>%, I will write
a spec and stop. Implementation will not start before then.

Idea: <initial_idea>
Mode: <greenfield|brownfield>
Current ambiguity: 100% (not measured yet)
```

---

## Phase 2: Question loop

Repeat until `ambiguity <= threshold` OR the user exits early.

### Step 2a: Generate the next question

Dimensions to evaluate:

| Dimension | What it measures | Question style |
|---|---|---|
| **Goal** | Can the primary objective be stated in one sentence? Are key entities clear? | "What does the user do first when ...?" "What signals success?" |
| **Constraint** | Are boundaries, limits, and non-goals explicit? | "Should this work offline?" "Which OS?" "What is explicitly out of scope?" |
| **Criteria** | Can success be defined as a test? | "If I showed you the finished product, what would make you say 'yes, that's it'?" |
| **Context** (brownfield only) | Is the existing system understood well enough to change safely? | "I found JWT auth with passport in `src/auth/`. Extend it or build a separate flow?" |

**Rules:**
- One question at a time. No batching.
- Always target the weakest dimension from the previous round.
- Before the question, state in one sentence why that dimension is the current bottleneck.
- Aim to expose assumptions, not to collect feature lists.
- In brownfield mode, never ask the user about facts that the code already reveals.

### Step 2b: Ask the question

Call `AskUserQuestion`. Format:

```
Round <n> | Targeting: <weakest_dimension> | Why now: <one sentence>
Current ambiguity: <score>%

<question>
```

Provide 2-4 options plus a free-text field.

### Step 2c: Score ambiguity

After the answer, score every dimension on 0.0-1.0.

**Scoring prompt** (run via Task agent or by Claude itself):

```
Score each dimension below from 0.0 to 1.0, based on the interview transcript.

Idea: <initial_idea>

Q&A so far:
<rounds>

Dimensions:
1. Goal Clarity: can the primary objective be stated in one sentence without qualifiers?
2. Constraint Clarity: are boundaries and non-goals explicit?
3. Criteria Clarity: can success be written as a verifiable test?
4. Context Clarity (brownfield only): is the existing system understood enough to change safely?

For each dimension return:
- score: float (0.0-1.0)
- justification: one sentence
- gap: what is still unclear (if score < 0.9)

Also return:
- weakest_dimension: the dimension to target next round
- rationale: why that dimension is the current bottleneck
```

**Ambiguity computation:**

- Greenfield: `ambiguity = 1 - (goal * 0.40 + constraints * 0.30 + criteria * 0.30)`
- Brownfield: `ambiguity = 1 - (goal * 0.35 + constraints * 0.25 + criteria * 0.25 + context * 0.15)`

### Step 2d: Report progress

```
Round <n> complete.

| Dimension | Score | Weight | Weighted | Gap |
|---|---|---|---|---|
| Goal | 0.8 | 0.40 | 0.32 | <gap or "Clear"> |
| Constraints | 0.4 | 0.30 | 0.12 | <gap> |
| Criteria | 0.7 | 0.30 | 0.21 | <gap> |
| **Ambiguity** | | | **35%** | |

Next target: Constraints (weakest, 0.4)
Reason: <weakest_dimension_rationale>
```

### Step 2e: Soft limits

- **Round 3+**: allow early exit if the user says "enough" / "build it" / similar.
- **Round 10**: soft warning. "Ambiguity is X%. Continue interviewing, or proceed with current clarity?"
- **Round 20**: hard cap. "Max rounds reached. Proceeding with ambiguity X%."

---

## Phase 3: Challenge modes (fire once per threshold)

Inject the directive below into the question-generation prompt. Each mode fires **exactly once** in a run.

### Round 4+: Contrarian
> The next question must challenge the user's core assumption. Ask "what if the opposite were true?" or "is this constraint really necessary, or just habitual?"

### Round 6+: Simplifier
> The next question must probe whether complexity can be removed. Ask "what is the smallest viable version?" or "which of these constraints are truly required vs assumed?"

### Round 8+: Ontologist (only if ambiguity > 0.3)
> Eight rounds in and ambiguity is still high. You may be circling symptoms instead of the core problem. Ask "what IS this, really?" or "of the entities mentioned, which is the core and which are supporting?"

---

## Phase 4: Crystallize the spec

Once `ambiguity <= threshold` (or hard cap / early exit), write the spec.

### Destination

- If `docs/requirements/` exists, write to `docs/requirements/deep-interview-<slug>.md`.
- Otherwise create `docs/requirements/` (`mkdir -p`) and write there.
- **The slug follows the `<verb>-<topic>` kebab-case convention** (consistent with `~/.claude/agents/planner.md`).

### Frontmatter

```yaml
---
status: pending-approval
ambiguity: 0.15
threshold: 0.20
mode: greenfield
created: YYYY-MM-DD
---
```

### Body structure

```markdown
# Requirements: <title>

## Metadata
- Interview rounds: <count>
- Final ambiguity: <score>%
- Mode: <greenfield|brownfield>
- Threshold: <pct>% (source: <user|project|default>)
- Status: <PASSED | EARLY_EXIT>

## Clarity breakdown
| Dimension | Score | Weight | Weighted |
|---|---|---|---|
| Goal | <s> | <w> | <s*w> |
| Constraints | <s> | <w> | <s*w> |
| Criteria | <s> | <w> | <s*w> |
| Context (brownfield) | <s> | <w> | <s*w> |
| **Total clarity** | | | **<total>** |
| **Ambiguity** | | | **<1-total>** |

## Goal
<one-sentence primary objective, free of the ambiguities cleared in the interview>

## Constraints
- <constraint 1>
- <constraint 2>

## Non-goals (explicitly excluded)
- <out of scope 1>
- <out of scope 2>

## Acceptance criteria
- [ ] <testable criterion 1>
- [ ] <testable criterion 2>

## Assumptions surfaced
| Assumption | How it was challenged | Resolution |
|---|---|---|
| <assumption> | <how challenged> | <decided> |

## Technical context
<brownfield: relevant code areas from explore>
<greenfield: technology choices and constraints>

## Key entities
| Entity | Type | Fields | Relationships |
|---|---|---|---|
| <e.g. User> | core | name, email | has many Tasks |

## Interview transcript
<details>
<summary>Full Q&A (<n> rounds)</summary>

### Round 1
**Q:** <question>
**A:** <answer>
**Ambiguity:** <score>% (Goal: ..., Constraints: ..., Criteria: ...)

...
</details>
```

---

## Phase 5: Bridge to implementation

Once the spec is written, ask the user via `AskUserQuestion` how to proceed.

**Question:** "Spec is ready (ambiguity: <score>%). How should we continue?"

**Options:**

1. **Run `/plan` to produce an implementation plan** (Recommended)
   - Spawn the planner agent and generate `docs/plan/<verb>-<topic>.md`.
   - Stop at the plan; do not implement.

2. **Run `/vibe` to go all the way**
   - Feed the spec into the vibe pipeline (plan -> implement -> PR).

3. **Stop here, decide later**
   - Leave the spec on disk and end the skill.

4. **Continue interviewing** (only if ambiguity is still above threshold and the user wants more rounds)
   - Return to Phase 2.

**Important:**
- Do not invoke any implementation-side skill until the user explicitly picks one.
- This skill is a requirements agent, not an implementation agent.

---

## What you must not do

- Batch multiple questions in one round.
- Advance without showing the ambiguity score after each round.
- Ask the user about facts that the code already reveals (in brownfield mode).
- Decide "good enough" and jump into implementation while still above threshold.
- Move to the next phase without writing the spec.
- Invoke `/plan` or `/vibe` without an explicit user choice.

---

## Relationship to ask-brief

- `/ask-brief` is a format enforcer for a single decision.
- `/deep-interview` is a convergence tool that iterates to pin down scope.
- When a critical decision arises inside deep-interview, fire that single question in ask-brief format.
- They compose: deep-interview uses ask-brief internally.

## Relationship to the Confusion Protocol

The Confusion Protocol in `~/.claude/rules/coding-style.md` is the meta-rule: "stop and ask when confused".
Deep-interview is the **automation** of that "ask" step.
Small confusions stop at the Confusion Protocol; large ambiguities escalate to deep-interview.

---

## Optional configuration

`~/.claude/settings.json` or `./.claude/settings.json`:

```json
{
  "omc": {
    "deepInterview": {
      "ambiguityThreshold": 0.2,
      "maxRounds": 20,
      "softWarningRounds": 10,
      "minRoundsBeforeExit": 3,
      "enableChallengeAgents": true
    }
  }
}
```

---

## voice.md compliance

All prose (questions, reports, spec body) must follow `~/.claude/rules/voice.md`:
- No em dash. Use commas, periods, or `...` instead.
- No AI vocabulary (delve, robust, comprehensive, multifaceted, etc.).
- Use concrete file names, numbers, function names.
- Tie everything back to "what does the user experience".

Task: $ARGUMENTS

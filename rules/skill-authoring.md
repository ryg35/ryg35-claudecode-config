# Skill / Rule Authoring: Persuasion Principles

Why some instructions get followed and others get quietly ignored. LLMs respond
to the same persuasion patterns as humans, so the wording of a skill, a
CLAUDE.md clause, or an agent prompt changes how reliably the behavior actually
happens ... even under pressure or when the model is looking for an out.

**Empirical grounding:** Meincke et al. (2025), "Call Me A Jerk", University of
Pennsylvania. Tested 7 persuasion principles across N=28,000 LLM conversations.
Persuasion phrasing more than doubled compliance: 33% to 72% (p < .001).
Authority, commitment, and scarcity were the strongest. This is not a metaphor;
it is measured behavior.

This is for ensuring critical practices hold, not for manipulation. The test at
the bottom keeps that honest.

## Trigger (re-read at authoring time, not just at session load)

When you are about to **create or substantially revise** any of the following,
you MUST re-read this file first and pick principles from the table below:

- a `SKILL.md` (any project or `~/.claude/skills/`)
- an agent definition (`agents/*.md`)
- a slash command (`commands/*.md`)
- a `CLAUDE.md` clause or a `rules/*.md` file

Then, in the same turn, state which principle(s) you chose and why (one line is
enough). Skills authored without this step routinely ship soft "consider doing
X" phrasing that gets ignored under load. Every time.

Passive presence in context does not count: "the rule is loaded" and "the rule
is followed" are different states (see the Self-Verification burn in
`~/.claude/rules/coding-style.md`). A PreToolUse hook
(`~/.claude/scripts/skill-authoring-reminder.sh`) re-surfaces this trigger on
the first Write/Edit to those paths in each session, so compaction cannot
silently drop it.

Not covered: mechanical edits to existing skills (typo, path fix, renaming a
referenced script). Those don't change how the instruction persuades.

## The Seven Principles

### 1. Authority ... deference to expertise and non-negotiable framing
Imperative language, no exceptions. Removes decision fatigue and kills the
"is this an exception?" rationalization. Use for discipline-enforcing skills
(TDD, verification gates), safety-critical steps, established best practice.

```markdown
✅ Write code before the test? Delete it. Start over. No exceptions.
❌ Consider writing tests first when feasible.
```

### 2. Commitment ... consistency with a prior declaration
Require an announcement or an explicit choice before the work. Once the model
has said it will do X, it follows through. Use to make a skill actually fire,
for multi-step processes, and for accountability.

```markdown
✅ When you invoke a skill, you MUST announce: "I'm using [Skill Name]".
❌ Consider letting your partner know which skill you're using.
```

### 3. Scarcity ... urgency from time and sequence
Time-bound and sequential requirements defeat "I'll do it later". Use for
immediate verification, tight workflows, anything that rots if deferred.

```markdown
✅ After completing a task, IMMEDIATELY request review before proceeding.
❌ You can review the code when convenient.
```

### 4. Social Proof ... conformity to the norm
Universal patterns and named failure modes set the standard. Use for universal
practices and for warning about common failures.

```markdown
✅ Checklists without todo tracking = steps get skipped. Every time.
❌ Some people find a todo list helpful for checklists.
```

### 5. Unity ... shared identity, "we-ness"
Collaborative framing and shared goals. Use for collaborative workflows and
team culture, not for hard discipline.

```markdown
✅ We're colleagues working together. I need your honest technical judgment.
❌ You should probably tell me if I'm wrong.
```

### 6. Reciprocity ... obligation to return a benefit
Use sparingly. Rarely needed in a skill, and it reads as manipulative fast.
Other principles do the job better. Default: skip it.

### 7. Liking ... preference for those we like
Do NOT use for compliance. It conflicts with an honest-feedback culture and
breeds sycophancy. Avoid it for any discipline enforcement, always.

## Which principles for which skill type

| Skill type | Use | Avoid |
|---|---|---|
| Discipline-enforcing | Authority + Commitment + Social Proof | Liking, Reciprocity |
| Guidance / technique | Moderate Authority + Unity | Heavy authority |
| Collaborative | Unity + Commitment | Authority, Liking |
| Reference | Clarity only | All persuasion |

Do not stack all seven. Picking the wrong ones is worse than picking few.

## Why it works

- **Bright-line rules cut rationalization.** "YOU MUST" removes decision
  fatigue; absolute language closes the "is this an exception?" loophole;
  explicit anti-rationalization notes close specific loopholes by name.
- **Implementation intentions automate behavior.** "When X, do Y" beats
  "generally do Y". A concrete trigger plus a required action fires without
  deliberation.
- **LLMs are parahuman.** They trained on human text where authority precedes
  compliance, where statement-then-action sequences are everywhere, and where
  "everyone does X" establishes a norm. The phrasing taps those grooves.

## How this applies here

This setup already leans on these principles ... now do it on purpose.

- **CLAUDE.md imperatives** (`ALWAYS` / `MANDATORY` / `NEVER` / `IMPORTANT:`,
  `~/.claude/CLAUDE.md`) are Authority. Keep them absolute. A softened
  "consider" clause is a clause that gets skipped under load.
- **SKILL.md `description` fields** decide whether a skill fires at all. Frame
  the trigger as Commitment plus Social Proof: name the concrete situation
  ("直後", "when the user says X") so the model commits to invoking, and state
  the failure mode ("without this, steps get skipped") so skipping reads as
  breaking a norm.
- **Agent prompts** pick per role: Authority + Commitment + Social Proof for a
  verifier or reviewer (discipline); Unity for a critic or pairing agent whose
  value is honest disagreement, never Liking.
- **The Burn Log convention** (`~/.claude/rules/coding-style.md`) is Social
  Proof in action: "same bug twice = promote to a rule" names the failure so
  the fix reads as the norm, not a preference.

Complementary pair, read both when authoring or revising a skill:
`~/.claude/skills/empirical-prompt-tuning` **measures whether** an instruction
works (dispatch a blind executor, score both sides, iterate to convergence).
This file explains **why** it works (which principle to reach for, how to phrase
it). Design with this, then verify with that. One without the other is either
untested theory or blind trial-and-error.

## Ethical test

Before using a persuasion technique in an instruction, ask: **would this serve
the user's genuine interest if they fully understood the technique?**

- Legitimate: ensuring critical practices hold, preventing predictable failure,
  clear documentation.
- Illegitimate: false urgency, guilt-based compliance, manipulation for gain.

## Quick reference

1. What type is the skill? (discipline vs guidance vs reference)
2. What behavior am I trying to change?
3. Which principle(s) apply? (usually Authority + Commitment for discipline)
4. Am I stacking too many? (do not use all seven)
5. Does it pass the ethical test?

---

Source: obra/superpowers,
`skills/writing-skills/persuasion-principles.md`. Distilled 2026-07-14.
Research: Meincke et al. (2025), Cialdini (2021).

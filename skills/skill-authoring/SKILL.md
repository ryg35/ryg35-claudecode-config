---
name: skill-authoring
description: "Persuasion principles for authoring instructions. Invoke BEFORE you create or substantially revise a SKILL.md (any project or ~/.claude/skills/), an agent definition (agents/*.md), a slash command (commands/*.md), a CLAUDE.md clause, or a rules/*.md file. Announce \"I'm using skill-authoring\", then state in one line which principle(s) you picked and why. Skip it and you ship soft \"consider doing X\" phrasing that gets ignored under load. Every time. Measured: Meincke et al. (2025), N=28,000 LLM conversations, compliance 33% to 72% (p < .001). Mechanical edits (typo, path fix, renaming a referenced script) are exempt."
---

# Skill / Rule Authoring: Persuasion Principles

**Grounding:** Meincke et al. (2025), "Call Me A Jerk", U. Pennsylvania.
7 principles, N=28,000 LLM conversations, compliance 33% to 72% (p < .001).
Authority, commitment, scarcity strongest. Measured, not a metaphor.

## Trigger (authoring time, not session load)

Creating or substantially revising a `SKILL.md`, `agents/*.md`, `commands/*.md`,
a `CLAUDE.md` clause, or a `rules/*.md` file? Pick principles from the table
below and state the choice in one line.

"The rule is loaded" and "the rule is followed" are different states (the
Self-Verification burn in `~/.claude/rules/coding-style.md`). A PreToolUse hook
(`~/.claude/scripts/skill-authoring-reminder.sh`) re-injects this trigger on the
first Write/Edit to those paths each session, so compaction cannot drop it.

Not covered: mechanical edits (typo, path fix, renaming a script).

## The Seven Principles

**1. Authority ... non-negotiable framing.** Imperative, no exceptions. Kills the
"is this an exception?" out. For discipline skills (TDD, verification gates).
✅ `Write code before the test? Delete it. Start over. No exceptions.`
❌ `Consider writing tests first when feasible.`

**2. Commitment ... consistency with a prior declaration.** Require an
announcement before the work; once the model says it will do X, it follows
through. This is what makes a skill fire at all.
✅ `When you invoke a skill, you MUST announce: "I'm using [Skill Name]".`
❌ `Consider letting your partner know which skill you're using.`

**3. Scarcity ... urgency from time and sequence.** Defeats "I'll do it later".
For immediate verification and anything that rots if deferred.
✅ `After completing a task, IMMEDIATELY request review before proceeding.`
❌ `You can review the code when convenient.`

**4. Social Proof.** Universal patterns and named failure modes set the norm.
✅ `Checklists without todo tracking = steps get skipped. Every time.`
❌ `Some people find a todo list helpful for checklists.`

**5. Unity ... shared identity.** For collaborative workflows, not discipline.
✅ `We're colleagues working together. I need your honest technical judgment.`
❌ `You should probably tell me if I'm wrong.`

**6. Reciprocity.** Rarely needed, reads manipulative fast. Default: skip.

**7. Liking.** Do NOT use for compliance. Breeds sycophancy. Avoid always.

## Which principles for which skill type

| Skill type | Use | Avoid |
|---|---|---|
| Discipline-enforcing | Authority + Commitment + Social Proof | Liking, Reciprocity |
| Guidance / technique | Moderate Authority + Unity | Heavy authority |
| Collaborative | Unity + Commitment | Authority, Liking |
| Reference | Clarity only | All persuasion |

Do not stack all seven. Wrong ones are worse than few.

## Why it works

- **Bright-line rules cut rationalization.** "YOU MUST" removes decision fatigue;
  naming a loophole closes it.
- **Implementation intentions automate behavior.** "When X, do Y" beats "generally
  do Y": trigger + action fires without deliberation.
- **LLMs are parahuman.** Authority precedes compliance in their training text.

## How this applies here

- **CLAUDE.md imperatives** (`ALWAYS` / `MANDATORY` / `NEVER` / `IMPORTANT:`) are
  Authority. Keep them absolute; a softened "consider" gets skipped.
- **SKILL.md `description` fields** decide whether a skill fires at all.
  Commitment + Social Proof: name the situation ("直後", "when the user says X")
  and the failure mode ("without this, steps get skipped").
- **Agent prompts** per role: Authority + Commitment + Social Proof for a
  verifier/reviewer; Unity for a critic, never Liking.
- **Burn Log** (`~/.claude/rules/coding-style.md`) is Social Proof: "same bug
  twice = promote to a rule" makes the fix the norm, not a preference.

Pair with `~/.claude/skills/empirical-prompt-tuning`: it **measures whether** an
instruction works (blind executor, score both sides, iterate), this says **why**.

## Ethical test

Would this serve the user's genuine interest if they fully understood the
technique? Legitimate: making practices hold, preventing predictable failure.
Illegitimate: false urgency, guilt-based compliance, manipulation for gain.

## Quick reference

Skill type? Behavior I am changing? Which principle(s) (usually Authority +
Commitment)? Stacking too many (never all seven)? Passes the ethical test?

---

Source: obra/superpowers, `skills/writing-skills/persuasion-principles.md`.
Distilled 2026-07-14. Research: Meincke et al. (2025), Cialdini (2021).

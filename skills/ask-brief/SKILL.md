---
name: ask-brief
description: Format-enforcer that fires before AskUserQuestion. Structures the question as a "decision brief" with the 7 required elements - D-number + ELI10 + Stakes + Recommendation + Completeness + ✅×2/❌×1 per option + Net. Use when surfacing important choices in biz-analysis / plan / deep-research / design decisions.
user_invocable: true
---

# Decision Brief Skill (/ask-brief)

When you are about to surface a meaningful choice to the user, build the content
in this format **before** calling AskUserQuestion. Source: gstack's AskUserQuestion Format.

## When to use

- Design decisions, architecture choices, scope expand/reduce calls
- When you reach a fork after the Confusion Protocol kicks in
- When you need to ask the user for direction inside biz-analysis, weekly review, research
- Even in auto mode, fire it whenever you hit a one-way-door call you cannot reverse

Do not use it for routine confirmations, light yes/no, or obvious choices.

---

## Required format

```
D<N>: <one-line title>

ELI10: <plain language a 16-year-old would understand, 2-4 sentences, what is at issue and what is at stake>

Cost of getting it wrong: <one sentence: what breaks, what the user sees, what is lost>

Recommendation: <option> because <one-line reason>

Completeness: A=X/10, B=Y/10
(or: Note: options differ in kind, not coverage; no completeness score)

Options:

A) <option label> (Recommended)
  ✅ <pro: concrete, observable, 40+ characters>
  ✅ <pro>
  ❌ <con: honest weakness, 40+ characters>

B) <option label>
  ✅ <pro>
  ✅ <pro>
  ❌ <con>

Net: <one-sentence verdict frame, what is being traded off>
```

---

## Rules per element

### 1. D-number
Count D1, D2, ... per skill invocation. If a child skill asks internally,
label it `D1 (skill-name)` to disambiguate. Drift is acceptable in long sessions.

### 2. ELI10 (mandatory, never skip)
Write what the choice **does**, not jargon.
Use concrete examples and analogies, not function or type names.
Assume the user has not been staring at this screen for 20 minutes.

### 3. Cost of getting it wrong (mandatory)
Concrete at the level of "the user stares at a 3-second spinner."
"Performance may degrade" is too weak.
One sentence that makes the trade-off real.

### 4. Recommendation (mandatory)
Even in a neutral posture (taste call, choices that differ in kind), state a recommendation.
Format: `Recommendation: <choice> because <reason>` on its own line.
Neutral case: `Recommendation: <default> ... this is a taste call, no strong preference`

### 5. Completeness scoring
**When options differ in coverage**: assign N/10 to each option.
- 10 = complete (all edge cases, all error paths)
- 7 = happy path only
- 3 = shortcut

**When options differ in kind** (e.g. mode selection, A vs B architecture,
cherry-pick Add/Defer/Skip): do not score. Replace with one line:
`Note: options differ in kind, not coverage; no completeness score`

**Do not fabricate scores.** If you would have to give every option 10/10, do not score at all.

### 6. Pros / Cons block
- **Minimum ✅×2, ❌×1** per option
- If you cannot find a con on the recommended option, the recommendation is hollow. Look harder.
- If you cannot find a pro on the rejected option, the question is not real.
- **Each bullet 40+ characters.** "✅ simple" is not a pro.
  "✅ Reuses existing YAML frontmatter, zero new parsers" is a pro.
- For one-sided choices (destructive-action confirmation, one-way doors), a single
  `✅ no con, this is a hard-stop choice` bullet is acceptable. Do not abuse this.

### 7. Net line (mandatory)
Not a summary, a **verdict frame**. One sentence on what is being traded off.
Example: "The new format is speculative; the copy-paste is immediate leverage.
Copy-paste now, evolve when a real pattern emerges."

### 8. Effort notation
When effort is a load-bearing axis, list both scales:
`(human: ~2 days / CC: ~15 minutes)`

### 9. 5+ options: split, never drop
AskUserQuestion caps every call at 4 options. With 5 or more real options,
never drop, merge, or silently defer one to fit. Split into sequential calls
(one brief per batch; D-numbers continue across calls), or restructure
per-option (e.g. one Add/Defer/Skip question per item).
This composes with CLAUDE.md question_batching: batch up to 4 questions per
message, but never sacrifice a real option to stay under the cap.
Source: gstack generate-ask-user-format.ts (2026-07 upstream addition).

### 10. One-way doors: strengthen the gate
When the decision is irreversible or destructive (delete, force-push, drop
table, overwrite), prose is a weaker gate than the tool, so make it stronger:
require an explicit typed confirmation (the user types the action word, e.g.
"delete"), and never proceed on a vague, partial, or ambiguous reply.
Source: gstack generate-ask-user-format.ts (2026-07 upstream addition).

---

## Pre-fire self-check

Right before calling AskUserQuestion:

- [ ] D<N> header present
- [ ] ELI10 and "Cost of getting it wrong" present
- [ ] Recommendation on its own line
- [ ] Completeness score for coverage, or kind note for kind
- [ ] Every option has ✅×2 ❌×1, each 40+ characters
- [ ] Exactly one option labelled "(Recommended)"
- [ ] Net line closes the brief
- [ ] 5+ real options were split across calls, not dropped or merged
- [ ] Destructive / one-way-door choices require a typed confirmation word
- [ ] Fire as tool_use (a prose `Question:` block does not become an interactive UI; always call the tool)

If you have to re-read your own writing to understand it, it is too complex.
Simplify before firing.

---

## Good example (self-applied to this format)

```
D1: How to store biz-analysis results in Obsidian

ELI10: PEST through TAM produces 7 notes worth of analysis. Either roll them into one
Obsidian file or split them into seven. The choice changes how you re-read them later
and how easy it is to link from the Daily Note.

Cost of getting it wrong: One file makes the editor crowded; you lose focus when other
sections drift into view while editing. Seven files clutter the Daily Note with seven
links instead of one.

Recommendation: B (seven files) because each framework can be reused independently in
other projects.

Completeness: A=8/10, B=8/10
(coverage is equivalent; the options differ in kind but at the same level of completeness)

Options:

A) Single combined file (000_<project>.md with all 7 sections)
  ✅ See the whole picture while editing, easier to spot cross-section contradictions
  ✅ Single link from the Daily Note, single search hit
  ❌ File grows long; other sections steal focus during editing

B) Seven split files (PEST.md, 5Forces.md, ... in one folder) (Recommended)
  ✅ Each framework is independent and reusable in another project
  ✅ Obsidian Graph view visualises the relationships
  ❌ Daily Note ends up with seven links, looks noisy

Net: Combined wins on readability, split wins on reusability. Reuse fires more often, so split.
```

---

## Relationship to voice.md

All prose inside this format must follow `~/.claude/rules/voice.md`:
- No em dash (do not use `—`; use comma, period, or `...`)
- No AI vocabulary (delve, crucial, robust, comprehensive, multifaceted, etc.; same in Japanese)
- Use concrete file names, function names, numbers
- Tie everything back to a real user outcome

ELI10 and "Cost of getting it wrong" must especially follow voice.md's
"specificity is the default" rule.

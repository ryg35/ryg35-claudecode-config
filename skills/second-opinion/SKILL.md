---
name: second-opinion
description: Run Codex (GPT-5 family) as an independent reviewer of Claude's own conclusion, then present the **diff** between the two to the user. Never output a merged "we both agree" verdict. Aligns with ETHOS "User Sovereignty". Use for architectural decisions, library selection, complex bug root-cause hypotheses.
user_invocable: true
argument-hint: "<question / decision / hypothesis to second-opinion>"
---

# Second Opinion Skill (/second-opinion)

## Purpose

Take Claude's conclusion, ask an independent model (Codex / GPT-5 family) to review it, and present **the diff** to the user. Do not present consensus or a merged verdict. The user decides.

Strict ETHOS "User Sovereignty" enforcement:
> An AI recommendation is not a decision. Even if Claude and another model agree, that is still a recommendation, not a decision.
> Never output "we agreed, so I adopted X".

## Use when

- Architectural decisions (microservice vs monolith, ORM choice, etc.)
- Library / framework selection
- Complex bug root-cause hypotheses (second opinion on a tracer hypothesis)
- Direction-setting refactors
- Security review double-check (when `security-reviewer` alone feels insufficient)

## Do not use when

- Simple implementation calls (one-file change, obvious fix)
- Style preferences
- Decisions the user has already made
- Time-critical tasks (codex start-up is 30-60s)

---

## Prerequisites

- The `codex` CLI is installed (e.g. `/opt/homebrew/bin/codex`).
- `~/.claude/settings.json` allow list includes `Bash(codex exec:*)` and the wrapper path `~/.claude/scripts/codex-exec-bg.sh` is used for all invocations (raw `codex exec` is blocked by the pre-tool-enforcer hook).
- Verify with `codex --version`.

If `codex` is missing, print an error and stop before doing anything else.

---

## Steps

### Step 1: Lock Claude's position

This skill requires a **Claude-side conclusion already on the table** before it can be invoked. If the caller has not formed one, build it first.

Claude's position must include:
- **Conclusion**: 1-2 sentences
- **Rationale**: 3-5 bullets
- **Rejected alternatives**: 1-2 (if there is none, you may be violating `~/.claude/ETHOS.md` "Question the initial frame")
- **Worries**: 1-2 points where Claude is unsure

### Step 2: Ask Codex

Call Codex via `~/.claude/scripts/codex-exec-bg.sh` (raw `codex exec` is blocked by the pre-tool-enforcer hook). Prompt template:

```bash
~/.claude/scripts/codex-exec-bg.sh --skip-git-repo-check "$(cat <<'EOF'
You are an independent senior engineer asked to give a second opinion on the
decision below. **You are NOT required to agree with the other AI.** Agree,
disagree, or propose a third option, all are welcome.

## Decision under review
<question>

## The other AI's (Claude's) conclusion
<Claude's position = conclusion + rationale + rejected alternatives + worries>

## Related context (if any)
- Relevant files: <paths>
- Constraints: <constraints>

## Please answer
1. Your conclusion (same as Claude's or different is fine).
2. Your rationale (3-5 bullets).
3. Weaknesses in Claude's position (what Claude is missing).
4. Alternatives you would consider (that Claude did not raise).
5. Your confidence (high / medium / low).

Do not produce diplomatic consensus. If you disagree, say so explicitly.
EOF
)"
```

**Notes:**
- Use `--skip-git-repo-check` so it works outside a git repo.
- End the HEREDOC with `EOF` on its own line.
- Allow ~180s of timeout (codex can be slow).

### Step 3: Extract the diff

Place Claude's position and Codex's position **side by side**, then classify the diff into three buckets:

| Bucket | Definition |
|---|---|
| **Agreements** | Same conclusion AND same rationale |
| **Different perspective** | Same conclusion, but different drivers / emphasis |
| **Disagreement** | Different conclusions |

### Step 4: Present to the user

Do NOT call `AskUserQuestion` first. Output the report as text:

```markdown
# Second Opinion Report: <question>

## Claude's position
**Conclusion**: <1-2 sentences>

**Rationale**:
- ...
- ...

**Rejected alternatives**: <alt> | reason: <reason>

**Worries**: <weakness>

---

## Codex's position
**Conclusion**: <1-2 sentences>

**Rationale**:
- ...
- ...

**Critique of Claude's position**: <criticism>

**Codex's alternatives**: <alternative>

**Confidence**: <high|medium|low>

---

## Diff

### Agreements
- ...

### Different perspective (same conclusion, different rationale)
- Claude emphasizes X, Codex emphasizes Y.
- Reason for the difference: ...

### Disagreement (different conclusions)
- Claude: A
- Codex: B
- Core of the disagreement: ...

---

## Over to you

Which do you adopt, or do you want to design a third option C?
Claude is not allowed to decide for you. Your context (domain knowledge, strategic timing, taste) is what matters.
```

Only after that, call `AskUserQuestion` with options:
- A) Adopt Claude's position
- B) Adopt Codex's position
- C) Combine the strengths of both into a third option
- D) Gather more information (one more deep dive)

Plus a free-text field.

---

## What you must not do

- **Write "since both AIs agreed, I adopted X".** That violates User Sovereignty.
- **Pre-bias Codex by saying "please agree with Claude".** The prompt explicitly says "you are not required to agree". Keep it that way.
- **Translate Codex's reply into Claude's words and lose the original meaning.** Preserve the diff faithfully.
- **Pick a winner when the two disagree.** Stay neutral; the user decides.
- **Retry codex with a doctored prompt when the answer is unwelcome.** One or two attempts, then report to the user.

Real incident (NG example, added 2026-07-07 audit): an internal Codex-review log recorded "adopt every Codex finding" and merged all suggestions into v2 without per-item user decisions: exactly the merged-verdict pattern this skill prohibits. Presenting a P0/P1 diff table is good; the adopt/reject call still belongs to the user, item by item.

---

## Error handling

- `codex` not installed: print "command not found" and stop.
- codex timeout (>180s): tell the user "codex did not respond; should we proceed with Claude's position alone?"
- codex returns "fully agree": record agreement as one form of the diff and tell the user. **Still do not write "adopted because we agreed".**

---

## ETHOS alignment

| ETHOS principle | Implementation in this skill |
|---|---|
| Boil the lake | Do not shortcut to single-model output on important calls; take a second opinion. |
| Search before building | Another model = another search vector. Closes blind spots. |
| **User sovereignty** | **Never output consensus. Only the diff. The user decides.** |
| Question the initial frame | The Codex prompt explicitly asks for "alternatives Claude did not raise", forcing option C onto the table. |
| Build for yourself | Built for the moment when a solo dev wonders "is this really right?" |

---

## voice.md compliance

- No em dash.
- No AI vocabulary.
- Summarize Claude's and Codex's positions in voice.md-compliant prose (rewrite AI vocabulary that leaks from raw codex output).
- Avoid words like "seamlessly integrated", "comprehensive consensus", and other satin diplomacy.

---

## Usage example

```
/second-opinion Should this project use session-based auth instead of JWT?
```

Claude thinks:
- Conclusion: session-based recommended (reason: ...)
- Rejected: JWT (reason: ...)
- Worry: mobile-client compatibility

-> Codex is asked the same question via `codex-exec-bg.sh`.
-> Codex thinks: JWT recommended, different rationale.
-> Diff report: conclusions differ; the core trade-off is "session storage cost vs token re-issue cost".
-> User decides with full visibility into both arguments.

Task: $ARGUMENTS

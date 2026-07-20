---
name: sciomc
description: "Parallel codebase research with the scientific method: decompose into hypotheses, investigate in parallel with evidence, cross-validate, synthesize a report. Use when the user asks 'how does X work across this codebase', wants an architecture or behavior investigation report, or invokes /sciomc. For web-centric research use deep-research instead. For tracing WHY a single behavior happens use deep-dive or the tracer agent."
user_invocable: true
argument-hint: "[AUTO:] <research goal>"
---

# Sciomc Skill (/sciomc)

## Purpose

When the question is "what does this codebase actually do, and why does it behave the way it does", break it into 3-7 independent investigations, run them in parallel, cross-validate the findings, and synthesize a single report grounded in file:line evidence.

This is the codebase counterpart of `deep-research`. They do not overlap:

| | sciomc | deep-research |
|---|---|---|
| Source of truth | This codebase | The web |
| Tools | `Task` subagents, `Read`, `Grep`, `Glob`, `Bash`, `Skill("documentation-lookup")` for library docs | firecrawl + exa MCP search |
| Output | Report with file:line evidence | Report with URL citations |
| Use for | "How does auth work here?", "Why do these tests flake?", "Where does the cache invalidate?" | "Which OAuth library is the best fit?", "What did Stripe change in their API in Q3?" |

## Use when

- The user asks for analysis across files: "explain how X works", "where does Y happen", "why does Z behave like this".
- Bug investigation that spans multiple modules and needs evidence from each.
- Architecture mapping: "give me a full picture of how the system is wired".
- The user says "sciomc", "research the codebase", "deep-analyze".

## Do not use when

- The question can be answered by `Read` on one file. Just read it.
- The question is about the web, not the codebase. Use `deep-research`.
- The user wants a plan, not a report. Use `plan` or `autopilot`.
- The user wants implementation. Use `ralph`, `team`, or `vibe`.

---

## Workflow

### Phase 1: Decompose

Break the research goal into 3-7 independent stages. Each stage is a question that can be answered with evidence from this codebase.

```markdown
## Research Decomposition

**Goal:** <original research goal>

### Stage 1: <stage name>
- **Focus:** what this stage investigates
- **Hypothesis:** expected finding (if applicable)
- **Scope:** files/areas to examine
- **Tier:** LOW | MEDIUM | HIGH

### Stage 2: ...
```

Stages must be independent so they can run in parallel. If two stages depend on each other, merge or sequence them.

### Phase 2: Execute in parallel

Fire all independent stages in the same message. Match model tier to stage complexity:

| Stage type | Tier | Example |
|---|---|---|
| Enumeration, file counts, simple lookups | LOW (Haiku) | "List every test file in `src/`" |
| Pattern analysis, code reading, documentation review | MEDIUM (Sonnet) | "Analyze error-handling patterns in `src/api/`" |
| Architecture analysis, cross-cutting reasoning, hypothesis validation | HIGH (Opus) | "Explain why the cache invalidates twice on user update" |

Each stage agent must:

1. Use `Read`, `Grep`, `Glob` for raw evidence.
2. Use `Bash` for `git log`, `git blame`, `rg`, etc.
3. Cite every claim with `path:line` references.
4. Tag findings with structured markers (see below).

Spawn pattern:

```
Task(general-purpose, model=haiku, prompt="[STAGE:1] Enumerate every file under src/auth/ and group by responsibility...")
Task(general-purpose, model=sonnet, prompt="[STAGE:2] Analyze how src/auth/ handles token refresh...")
Task(general-purpose, model=opus, prompt="[STAGE:3] Identify race conditions in the session cache, with file:line evidence...")
```

Concurrency cap: 20 scientists in parallel. If you have more stages, batch them.

### Phase 3: Cross-validate

After all parallel stages complete, run one sequential validation pass:

```
Task(general-purpose, model=sonnet, prompt="
[CROSS_VALIDATION]
Validate findings across all stages for:
1. Contradictions between stages.
2. Missing connections (stage A references X but stage B never mentions it).
3. Gaps in coverage.
4. Evidence quality (every claim cited with file:line?).

Stage 1 findings: <summary>
Stage 2 findings: <summary>
...

Output: [VERIFIED] or [CONFLICTS: <list>]
")
```

If conflicts surface, re-run the affected stages with the conflict as context. Do not paper over disagreements.

### Phase 4: Synthesize

Generate the final report. Save to `.claude/sciomc/<session-id>/report.md`:

```markdown
# Research Report: <goal>

**Session:** <id>
**Date:** <ISO>
**Status:** complete | partial | blocked

## Executive summary
<2-3 paragraph summary of the most important findings>

## Methodology
| Stage | Focus | Tier | Status |
|---|---|---|---|
| 1 | ... | LOW | complete |
| 2 | ... | MEDIUM | complete |
| 3 | ... | HIGH | complete |

## Key findings

### Finding 1: <title>
**Confidence:** HIGH | MEDIUM | LOW

<detailed finding>

#### Evidence
- `src/auth/login.ts:45-52`: <relevant code>
- `tests/auth/login.test.ts:12`: <relevant test>

### Finding 2: ...

## Cross-validation results
<summary; any conflicts and how they were resolved>

## Limitations
- <area not covered and why>
- <assumption that may not hold>

## Recommendations (if any)
1. ...
2. ...

## Appendix: raw stage outputs
- Stage 1: `.claude/sciomc/<session-id>/stages/stage-1.md`
- Stage 2: `.claude/sciomc/<session-id>/stages/stage-2.md`
```

---

## AUTO mode

`/sciomc AUTO: <goal>` runs the workflow autonomously without user checkpoints.

Loop control:

- **Max iterations:** 10.
- **Continue until:** the synthesis report exists and cross-validation returned `[VERIFIED]`, OR max iterations reached, OR blocking error.
- **Cancellation:** user says "stop", "cancel", "abort".

Use AUTO when the user explicitly says "auto", "no checkpoints", or "just run it". Default (without AUTO) shows the user the decomposition after Phase 1 and asks via `AskUserQuestion` whether to proceed before running parallel stages.

---

## Session management

| Path | Purpose |
|---|---|
| `.claude/sciomc/<session-id>/state.json` | Session progress, stage statuses, mode. |
| `.claude/sciomc/<session-id>/stages/stage-N.md` | Raw stage findings. |
| `.claude/sciomc/<session-id>/report.md` | Final synthesized report. |

Session id format: `sciomc-YYYYMMDD-<random6>`. Keep sessions for later reference unless the user asks to clean up.

### State file

```json
{
  "id": "sciomc-20260524-abc123",
  "goal": "...",
  "status": "in_progress | complete | blocked | cancelled",
  "mode": "standard | auto",
  "iteration": 1,
  "max_iterations": 10,
  "stages": [
    {
      "id": 1,
      "name": "...",
      "tier": "HIGH",
      "status": "pending | running | complete | failed",
      "findings_file": "stages/stage-1.md"
    }
  ],
  "validation": {
    "status": "pending | verified | conflicts",
    "conflicts": []
  }
}
```

### Resume

`/sciomc resume [<session-id>]` reads the most recent state file and continues from the last incomplete stage. Without an id, resume the most recently active session.

---

## Finding tags (for structured stage output)

Each scientist agent must emit findings in this format so the synthesizer can extract them mechanically:

```
[FINDING:F1] Token refresh race condition
The refresh interceptor and the session refresher both write to localStorage
without coordination. Under concurrent requests, one write clobbers the other.

[EVIDENCE:F1]
- File: src/auth/refresh.ts
- Lines: 47-58
- Content:
  ```ts
  if (token.expired) { ... localStorage.setItem('token', newToken) }
  ```

[CONFIDENCE:HIGH]
Two independent code paths, observed in logs (network tab), reproduces in tests.
[/FINDING]
```

Extraction regexes (for reference):

- Findings: `/\[FINDING:(\w+)\]\s*(.*?)\n([\s\S]*?)\[\/FINDING\]/g`
- Evidence: `/\[EVIDENCE:(\w+)\]([\s\S]*?)(?=\[CONFIDENCE|\[\/FINDING\])/g`
- Confidence: `/\[CONFIDENCE:(HIGH|MEDIUM|LOW)\]\s*(.*)/g`
- Stage complete: `/\[STAGE_COMPLETE:(\d+)\]/`
- Validation result: `/\[(VERIFIED|CONFLICTS):?(.*?)\]/`

---

## Quality thresholds

A finding must meet all of these to make the final report:

| Check | Requirement |
|---|---|
| Evidence present | At least one `[EVIDENCE]` block per finding |
| Confidence stated | Each finding has `[CONFIDENCE:HIGH|MEDIUM|LOW]` |
| Source cited | File paths are real, lines are real |
| Reproducible | Another agent could re-run the same grep / read and arrive at the same finding |

Low-confidence findings can stay in the appendix but must not headline the executive summary.

---

## Stop conditions

- All stages complete and cross-validation returned `[VERIFIED]` → exit success.
- Max iterations (AUTO mode) reached → exit with partial report and the open questions.
- User cancellation → exit, preserve state for resume.
- Persistent conflicts that cannot resolve in 2 re-runs → exit with the conflict surfaced explicitly. Do not paper over.

---

## Final checklist

- [ ] Decomposed into 3-7 independent stages with clear tier assignment.
- [ ] All independent stages fired in parallel (same message).
- [ ] Cross-validation ran after all stages completed.
- [ ] Every finding in the report has at least one `[EVIDENCE]` block and a confidence level.
- [ ] Report saved to `.claude/sciomc/<session-id>/report.md`.
- [ ] State file written so the session can be resumed.

---

## Examples

### Good: parallel hypothesis battery

```
Task(general-purpose, model=sonnet, "[HYPOTHESIS:A] Does adding LRU cache to fetchSession reduce p99 by 50ms? Evidence from src/auth/ and any existing benchmark.")
Task(general-purpose, model=sonnet, "[HYPOTHESIS:B] Does batching requests reduce database round-trips? Evidence from src/db/ and src/api/.")
Task(general-purpose, model=sonnet, "[HYPOTHESIS:C] Does lazy-loading the user profile reduce time-to-interactive? Evidence from src/components/ and the bundle analyzer output.")
```

Three hypotheses tested simultaneously.

### Good: independent dataset analysis

```
Task(general-purpose, model=haiku, "[STAGE:1] Enumerate all API routes in src/api/")
Task(general-purpose, model=haiku, "[STAGE:2] Enumerate all utility functions in src/utils/")
Task(general-purpose, model=haiku, "[STAGE:3] Enumerate all React components in src/components/")
```

### Bad: one giant stage

```
Task(general-purpose, model=opus, "Analyze the entire src/ directory and tell me everything")
```

Unbounded scope, low signal. Decompose first.

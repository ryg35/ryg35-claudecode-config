# Coding Style

## Baseline (assumed, not restated)

Small focused files (200-400 lines, 800 max), immutable updates, intentional error handling, validate external input with zod/pydantic. No console.log left behind.

## Comments (default: none, MANDATORY)

Code is the source of truth. Write a comment ONLY for a WHY the code cannot express: a non-obvious constraint, a workaround, an external bug/issue link. One line. No exceptions.

- NEVER: restate what the code does, section banners, dates or 追加/変更 history, burn narratives, docstrings on self-explanatory functions, comments addressed to the reviewer.
- History and reasons go in the commit body, not the code.
- Surrounding code is comment-heavy? Do not match it. Match its naming and idiom, not its comment density.
- Before finishing a code change, reread every comment you added and delete each one that fails the test above.

Heavy comments are the default look of AI-written code, and the user rejects them. Every time. Burn 2026-09-22: 「最近コメントが多すぎて困る。コードが正だから必要以上のコメントは避けたい」.

## Load on demand

- Writing CSS or picking text colors: invoke the `css-pitfalls` skill (specificity ordering and per-surface contrast, burned 5 times in Aug 2026).
- Writing a scorer for free-text output: read `~/.claude/skills/eval-harness/references/positive-assertion-scoring.md` (assert presence of correct behaviour, never absence of wrong strings; burned 4 times Aug 2026).

## No left accent bar (HTML / PDF / slides, MANDATORY)

NEVER put a colored vertical bar on the left edge of a box: no `border-left: 3-5px solid <color>` on summary boxes, callouts, warnings, quotes, or cards. Use a background tint or a thin full border. No exceptions, including "just this one callout".

- It is the default look of AI-made documents, and the user rejects it on sight. Every time.
- Writing a prompt for a subagent that produces HTML? The prompt MUST say "no left accent bar (border-left)". If the prompt does not say it, the agent adds one. Every time.
- Before delivering any HTML/PDF, run `grep -c "border-left" <file>` with the literal path. Anything but 0 = not done. Reused generators (`render.py` etc.) get the same check.

Burn 2026-09-17: four boxes in one session (report `.lead` / `.warn` / `.action`, then the A4 summary box built by a subagent whose prompt did not forbid it). User: "これは何回もやっている指摘".

## Opus 5.5 default looks (HTML / PDF / slides)

Without design direction, Opus 5.5 falls back on a few default styles. Do not use any of these unless the user or the design system asks for it: a cream or off-white page background, italic accent words inside headlines, numbered "01 / 02 / 03" section labels, monospace labels, pill-shaped buttons. Subagent prompts that produce HTML list these five next to the left-bar ban.

Source: Anthropic, Prompting Claude Opus 5.5, "Frontend design defaults" (a vague "avoid a generic AI look" only swaps one default for another; named patterns work). Adopted 2026-09-24.

## Confusion Protocol

Hit high-risk ambiguity (two plausible architectures or data models, a request that contradicts an existing pattern, a destructive operation with unclear blast radius, missing context that would change the plan)? **STOP.**
Name the ambiguity in one sentence, present 2-3 options with trade-offs, ask the user. Never guess an architecture or data-model decision.
Not for routine coding, small additions, or obvious changes. Source: gstack `generate-confusion-protocol.ts`.

## Self-Verification (run the last grep)

"The rule is written" and "the rule is followed" are different states. Required before commit:

```bash
# voice.md 違反 (em dash, AI 語彙)
grep -nH '—' <changed-files>
grep -niE 'delve|crucial|robust|comprehensive|nuanced|multifaceted|深掘り|包括的|多面的|堅牢' <changed-files>

# 残存 TODO / FIXME / WIP コメント
grep -niE 'TODO|FIXME|WIP|XXX' <changed-files>

# console.log / print / dbg! の取り残し
grep -nE 'console\.(log|debug)|print\(|dbg!' <changed-files>

# シークレット混入の最終確認
grep -niE 'sk-[a-z0-9]|api[_-]?key|password|secret' <changed-files>
```

Write file paths literally in grep commands, never via a variable: zsh does not word-split unquoted `$F`, so `grep ... $F || echo none` prints "none" after checking nothing.
Burned twice 2026-08-22. Works in bash, fails in zsh, and the local shell is zsh.
Applies to new files and large edits, not to a one-line fix.

## Documentation Discipline

| What to record | Where it lives |
|---|---|
| Why this code is written this way (non-obvious constraint, workaround) | code comment (1 line, only per "Comments" above; otherwise commit body) |
| Why this judgment call was made | commit message body |
| User-visible change | CHANGELOG.md |
| Project-specific decision (test command, deploy steps) | the project's CLAUDE.md |
| Cross-environment knowledge (gstack-derived skills etc.) | `~/.claude/rules/*.md`, `~/.claude/skills/*/SKILL.md` |
| Session handoff (open questions for the next session) | `~/.claude/handoff/current.md` (overwrite) |
| Snapshot just before /compact | `~/.claude/handoff/precompact-<YYYY-MM-DD-HHMM>.md` (append) |

Write WHY not WHAT; no aspirational notes. Never memory, always the files above: handoff is markdown, not JSON state or key-value memory, so it is rereadable and `git diff` shows what changed.

## Burn Log

- 1st occurrence: `再発防止: <1 line>` in the fix commit body. Add a one-line code comment ONLY where a reasonable future edit would step on the same rake again. Done.
- 2nd occurrence: promote it to a rule in `~/.claude/rules/`.
- 3rd occurrence: the rule is unread or badly written. Rewrite it, do not re-add the same note.
- A file's stated policy is not evidence of its practiced policy: run `git log -p` on it before turning an observed convention into a rule.

## Tools

`sg` (ast-grep) for structural search and replace when grep is not precise enough: `sg --pattern 'console.log($A)' --lang ts`, `sg --pattern 'var $A = $B' --rewrite 'const $A = $B' --lang js`. Install with `brew install ast-grep`.

---
name: review-status
description: Record and browse the review-run history. Appends one line to ~/.claude/memory/review-log.jsonl per review run and shows recent history. Every entry point (pre-pr-review / review-prs / vibe, plus direct code-review skill invocation) runs the same implementation in skills/code-review, but each logs under its own name, so old lines stay greppable. Prevents the "did I already review that PR?" problem.
user_invocable: true
---

# /review-status - Review history

Manages the review-run history accumulated in `~/.claude/memory/review-log.jsonl`.
One line = one review run. timestamp + skill + target + cwd + note.

## Usage

Three modes, dispatched by the first argument.

### Mode 1: Show history (no args, or `list`)

```
/review-status
```

Display the last 20 entries as a table:

```bash
LOG="$HOME/.claude/memory/review-log.jsonl"
if [ ! -f "$LOG" ]; then
  echo "No review history yet. Use /review-status log <skill> <target> to start recording."
  exit 0
fi

echo "=== Last 20 review runs ==="
tail -20 "$LOG" | jq -r '"\(.ts | sub("T";" ") | sub("Z";"")) | \(.skill) | \(.target) | \(.cwd | split("/") | .[-1])\(if .note != "" then " | " + .note else "" end)"' | column -t -s '|'
```

### Mode 2: Append a record (`log <skill> <target> [note]`)

Call this right after finishing a review. Arguments:
- `<skill>`: the entry point that was run. `pre-pr-review` / `review-prs` / `vibe` are the three commands; `code-review` means the skill was invoked directly. All of them execute `~/.claude/skills/code-review/SKILL.md`, but each logs its own name. Keeping the entry point (not one unified name) is deliberate: every line written before the merge stays greppable, and per-entry-point counts keep working. Note that `code-review` exists only as a skill and a log name now, not as a command, so old `code-review` lines are still valid history.
- `<target>`: the target (PR number `PR#1185` / branch `branch:feature-x` / commit `sha:abc123`)
- `[note]`: optional note (may be empty)

```bash
~/.claude/bin/log-review.sh "$SKILL" "$TARGET" "${NOTE:-}"
```

Examples:
```
/review-status log pre-pr-review PR#1185
/review-status log review-prs branch:feature-auth "auth check still pending"
```

### Mode 3: Search (`grep <pattern>`)

Filter by skill / target / cwd:

```bash
LOG="$HOME/.claude/memory/review-log.jsonl"
grep -i "$PATTERN" "$LOG" | jq -r '"\(.ts | sub("T";" ") | sub("Z";"")) | \(.skill) | \(.target) | \(.cwd | split("/") | .[-1])\(if .note != "" then " | " + .note else "" end)"' | column -t -s '|'
```

Examples:
```
/review-status grep PR#1185        # history for a specific PR
/review-status grep pre-pr-review  # history for a specific skill
/review-status grep gstack         # history for a specific project
```

---

## When to use

- Step 8 of `~/.claude/skills/code-review/SKILL.md` already logs every run, including report-only ones. Fire `/review-status log ...` by hand only for reviews done outside that skill
- Before running `/pre-pr-review PR#1185` next week, check `/review-status grep PR#1185` to see whether you already did it
- At the start of the month, run `/review-status` to glance at how many reviews happened

## Why this granularity

Minimum granularity only (timestamp + skill + target + cwd + note). It does not record "what findings were raised".
Reason: if logging is heavy, it stops happening. Knowing "did vs didn't" is enough to prevent double work.
If future need calls for tracking findings too, extend the schema then (YAGNI for now).

## Where the log lives

- Body: `~/.claude/memory/review-log.jsonl`
- Append script: `~/.claude/bin/log-review.sh`
- Format: one JSON per line `{"ts":"...","skill":"...","target":"...","cwd":"...","note":"..."}`

It can be queried directly with `jq`:

```bash
# Reviews in the last 30 days
jq -r .ts ~/.claude/memory/review-log.jsonl | awk -v d="$(date -u -v-30d +%Y-%m-%d)" '$1 > d' | wc -l

# Per-skill counts
jq -r .skill ~/.claude/memory/review-log.jsonl | sort | uniq -c | sort -rn

# Per-project counts
jq -r '.cwd | split("/") | .[-1]' ~/.claude/memory/review-log.jsonl | sort | uniq -c | sort -rn
```

---
name: config-gc
description: Garbage collection for the Claude Code configuration. Scans ~/.claude (skills, agents, handoff snapshots, permissions, MCP servers, caches) for redundant, stale, orphaned, or low-value items, then walks the user through a confirm-each-item cleanup. Use when the user says "clean up my config", "config GC", "too many skills", ".claudeが肥大化してる", or asks for a periodic config review.
metadata:
  origin: ECC (everything-claude-code v2.0.0), adapted 2026-07-14 for this setup (handoff-based memory, no-rm policy)
---

# Config GC ... Garbage Collection for this Claude Code Setup

Borrowed from runtime garbage collection: periodically scan for items that are
no longer referenced, redundant, expired, or low-value, and reclaim the space.
The critical difference: **collection requires the human in the loop. Never
delete autonomously.**

## Local adaptations (differences from the ECC original)

1. **No-rm policy**: this setup forbids Claude from running `rm` / `rmdir` /
   `unlink` (CLAUDE.md file_deletion). Soft-delete is Claude's ceiling:
   rename to `.disabled` or `mv` into `~/.claude/_gc_trash/<date>/`.
   Hard deletion is always presented as an exact command for the user to run.
2. **Handoff instead of memory**: this setup does not use memory files by
   policy. The equivalent accumulating channel is `~/.claude/handoff/`
   (precompact snapshots pile up every /compact).
3. **Hooks are centralized**: hook commands live in `~/.claude/settings.json`;
   `~/.claude/hooks/` holds a deliberately disabled `hooks.json.disabled`.
   Do not propose re-enabling it; only flag orphaned script files.

## When to Activate

- The user asks to clean up, audit, or slim down the configuration
- The user complains about too many skills, noisy output, or slow startup
- A monthly/periodic review is due
- After a big OSS sync (gstack / OMC / ECC updates), to reconcile overlaps

Do NOT activate for: cleaning project source code (that's refactoring),
clearing chat history, or anything outside `~/.claude` and project `.claude/`.

## Scan Channels

| # | Channel | Path | Staleness / redundancy signals |
|---|---------|------|--------------------------------|
| 1 | Skills | `~/.claude/skills/*/` | Overlapping trigger descriptions; superseded by a newer skill; domain mismatch with actual work; broken or empty SKILL.md |
| 2 | Agents | `~/.claude/agents/*.md` | Role fully covered by another agent; never spawned in recent sessions; references tools/paths that no longer exist |
| 3 | Handoff | `~/.claude/handoff/` | `precompact-*.md` older than 30 days whose content is fully superseded by `current.md` or by committed history |
| 4 | Permissions | `permissions.allow` in `settings.json` / `settings.local.json` | Duplicates; specific entries shadowed by a wildcard; one-off grants from past experiments |
| 5 | MCP servers | `~/.claude.json`, project `.mcp.json` | Servers that fail to connect; functional duplicates; long-unused |
| 6 | Rules / templates | `~/.claude/rules/`, `~/.claude/templates/` | Rules contradicting newer rules; templates with no consumer |
| 7 | Runtime caches | `~/.claude/{cache,file-history,logs,shell-snapshots,screenshots}/` | Sort by size and mtime; propose items >30 days old and large |

## Workflow

1. **Scan** all channels (or the subset the user names). Collect candidates
   with: path, channel, the signal that flagged it, size, last-modified.
2. **Rank** by confidence (broken/orphaned = high; merely old = low) and
   present as a numbered table. Cap each run at ~20 candidates ... GC is
   periodic, not exhaustive.
3. **Confirm one by one.** For each candidate show the evidence, then ask.
   Batch the questions (up to 4 per AskUserQuestion, per question_batching)
   but keep one decision per item ... no "delete all 15? [y/n]".
4. **Soft-delete confirmed items**: `.disabled` rename for skills/agents,
   `mv` to `~/.claude/_gc_trash/<date>/` for files. For permission entries:
   back up the settings file, record the removed entry verbatim in
   `gc_log.md`, then remove it from the `allow` array with `jq`.
   **Hard deletion: print the exact `rm` command for the user to run.**
5. **Log** the run to `~/.claude/gc_log.md`: timestamp, items actioned,
   undo instructions.
6. **Report**: reclaimed size, channels still healthy, suggested next review.

## Example Scan Commands

Skill overlap candidates (channel 1) ... same trigger words in two descriptions:

```bash
grep -h '^description:' ~/.claude/skills/*/SKILL.md | sort | uniq -c | sort -rn | head
```

Stale handoff snapshots (channel 3):

```bash
find ~/.claude/handoff -name 'precompact-*.md' -mtime +30 -exec ls -lh {} +
```

Redundant permission entries (channel 4):

```bash
jq -r '.permissions.allow[]?' ~/.claude/settings.json | sort | uniq -d
```

Largest stale caches (channel 7) ... `du -k` works on macOS/BSD:

```bash
find ~/.claude/file-history ~/.claude/shell-snapshots -type f -mtime +30 \
  -exec du -k {} + 2>/dev/null | sort -rn | head -20
```

Soft-delete with undo path:

```bash
gc_date=$(date +%Y-%m-%d)
mkdir -p ~/.claude/_gc_trash/$gc_date
mv ~/.claude/skills/dead-skill ~/.claude/_gc_trash/$gc_date/
echo "$(date -Iseconds) moved skills/dead-skill -> _gc_trash/$gc_date/ (undo: mv back)" >> ~/.claude/gc_log.md
```

## Anti-Patterns

- **Bulk approval.** "Delete all 15? [y/n]" defeats the design. One item, one decision.
- **Hard-deleting on first pass.** No `_gc_trash/` copy or `.disabled` rename = done wrong. And hard deletion is the user's keystroke, never Claude's.
- **Treating "old" as "dead".** A skill untouched for 60 days may be seasonal (monthly-review, tax season). Age is a signal, not a verdict.
- **Touching anything outside `~/.claude`** (or the project's `.claude/`). Config GC never wanders into source trees, `~/Library`, or launchd.
- **Proposing to re-enable disabled hooks.** Disabled is a decision, not debris.

## Related Skills

- `harness-audit` ... audits config *quality* (scorecard); config-gc audits *existence*. Run harness-audit on what survives GC.
- `review-status` ... its `review-log.jsonl` is itself a channel-7 candidate when huge.
- `strategic-compact` ... produces the precompact snapshots channel 3 later collects.

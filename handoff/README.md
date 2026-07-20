# Handoff

Session-to-session handoff in markdown. The replacement for memory.

Why this exists: ETHOS says "do not write to memory". But information you discover
in one session, like an unresolved design question or the next step you would have
taken, dies at the session boundary unless you write it somewhere. This directory
is that somewhere. Markdown is easy to re-read, easy to diff, easy to delete.

## Two file types

### `current.md` (overwrite)

What goes here: the answer to "if a new session picks this up tomorrow, what does
it need to know that is not already in the code, the commit log, the CHANGELOG,
or the project CLAUDE.md?"

- Open decisions you have not made yet
- Reasoning behind a judgment call that does not fit a commit message
- The next concrete step you were about to take

Overwritten each time. Treat it as a single rolling note, not a log.

### `precompact-<YYYY-MM-DD-HHMM>.md` (append)

Snapshot right before `/compact` runs. Captures state that will be lost in the
compaction. Append-only because each snapshot is a distinct moment.

Filename example: `precompact-2026-05-24-1648.md`.

## What to write

- Decision reasoning (the why, when the why is not obvious from the diff)
- Open questions you did not resolve
- Next action you were about to take
- Constraints you discovered that future sessions need to know

## What not to write

- Code snippets. Read the code.
- Secrets, tokens, API keys, credentials
- Things already captured in commit messages, CHANGELOG, or CLAUDE.md
- "Maybe later" wishes (yagni)

## Lifecycle

Handoff notes are ephemeral. After 7 days, snapshots are stale and should be
removed. This agent cannot run `rm`. Ask the user to clean up:

```
rm ~/.claude/handoff/precompact-2026-*.md
```

`current.md` is overwritten in place, so it does not accumulate.

## Files tracked in git

- Only `README.md` (and the local `.gitignore`) is committed
- `current.md` and `precompact-*.md` are gitignored (local only; session content is private)

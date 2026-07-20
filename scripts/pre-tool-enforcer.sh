#!/usr/bin/env bash
# PreToolUse hook for Bash matcher: block obviously dangerous patterns that
# the settings.json deny list does not catch (pipe-to-shell, eval streams).
# settings.json already blocks curl/wget/sudo/rm/dd; do not duplicate them.
INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c "import json,sys
try:
    data=json.load(sys.stdin)
    print(data.get('tool_input',{}).get('command',''))
except Exception:
    pass" 2>/dev/null)

# Pipe-to-shell pattern (remote code execution risk).
case "$CMD" in
  *"| sh"*|*"|sh "*|*"| bash"*|*"|bash "*|*"| zsh"*|*"|zsh "*)
    echo "Blocked by pre-tool-enforcer: piping to a shell is dangerous." >&2
    exit 2
    ;;
esac

# eval with substitution from network or unknown source.
case "$CMD" in
  *"eval \"\$(curl"*|*"eval \"\$(wget"*|*"eval \$(curl"*|*"eval \$(wget"*)
    echo "Blocked by pre-tool-enforcer: eval of network output is dangerous." >&2
    exit 2
    ;;
esac

# Raw `codex exec` bypasses codex-exec-bg.sh, so the job never registers in
# /tmp/claude-codex-jobs/ and the statusline shows nothing while it runs.
# Burn: 2026-07-16, a hand-rolled `codex exec ... &` ran 10+ minutes with zero
# statusline feedback. Force the wrapper instead of trusting the rule in
# agents.md alone (prompts degrade under compaction; this doesn't).
#
# Only match `codex exec` in a COMMAND POSITION (start of command, or after
# ; && || | & $( ` or newline). A bare substring match also blocked innocent
# commands that merely mention the text, e.g. `grep "codex exec" file` or
# documentation echoes. Burn: 2026-07-17, a grep scanning config files for
# stale codex invocations was itself blocked by this hook.
case "$CMD" in
  "codex exec"*|*"; codex exec"*|*"&& codex exec"*|*"|| codex exec"*|*"| codex exec"*|*"& codex exec"*|*"\$(codex exec"*|*"\`codex exec"*|*"
codex exec"*)
    case "$CMD" in
      *"codex-exec-bg.sh"*)
        ;;
      *)
        echo "Blocked by pre-tool-enforcer: use ~/.claude/scripts/codex-exec-bg.sh instead of a raw 'codex exec' call, so the job registers in /tmp/claude-codex-jobs/ and shows up in the statusline. Foreground (non-backgrounded) codex exec calls do not need this, but the wrapper works for those too." >&2
        exit 2
        ;;
    esac
    ;;
esac

# Git/gh guard: the settings.json deny list is PREFIX-matched, so any wrapper
# in front of the verb slips through: `git -C dir push`, `cd dir && git push`,
# `env git push`, `gh repo create --push` (not git at all). Burn: 2026-07-19,
# both routes were used to push main on a project repo without tripping a
# single deny rule, and pre-commit-push-safeguard.sh only fires for the commit-push
# Skill. This block tokenizes the command, walks each shell segment, resolves
# the real git subcommand past -C/-c/--git-dir, and enforces:
#   - no push to main/master (explicit refspec, HEAD, or resolved current branch)
#   - no force push
#   - no bulk add (-A/--all/-u/.), no rm/reset/rebase (mirrors the deny list)
#   - no `gh repo create --push`, no `gh pr merge`
# NOTE: the hook JSON goes in via env var, NOT a pipe — the <<'PYEOF' heredoc
# already occupies python's stdin (it IS the script), so a piped stdin would be
# silently lost and every check would pass.
GUARD_OUT=$(CLAUDE_HOOK_INPUT="$INPUT" python3 - <<'PYEOF' 2>/dev/null
import json, os, re, shlex, subprocess, sys

PROTECTED = {'main', 'master'}
WRAPPERS = {'command', 'nohup', 'time', 'exec'}
BLOCKED_SUBCOMMANDS = {'rm', 'reset', 'rebase'}
GIT_ARG_OPTS = {'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'}


def tokenize(cmd):
    try:
        lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        return list(lex)
    except ValueError:
        # Unbalanced quotes (e.g. heredoc bodies): fall back to a rough split
        # that still separates shell operators so command position is kept.
        return [t for t in re.split(r'(\|\||&&|;|\||&|\(|\))|\s+', cmd) if t]


def segments(tokens):
    segs, cur = [], []
    for t in tokens:
        if t and all(c in '&|;()' for c in t):
            if cur:
                segs.append(cur)
            cur = []
        else:
            cur.append(t)
    if cur:
        segs.append(cur)
    return segs


def strip_wrappers(seg):
    i = 0
    while i < len(seg):
        base = os.path.basename(seg[i])
        if base == 'env':
            i += 1
            while i < len(seg) and (seg[i].startswith('-') or re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', seg[i])):
                i += 1
        elif base in WRAPPERS:
            i += 1
        elif re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', seg[i]):
            i += 1  # leading VAR=value assignment
        else:
            break
    return seg[i:]


def current_branch(repo):
    try:
        out = subprocess.run(
            ['git', '-C', repo, 'rev-parse', '--abbrev-ref', 'HEAD'],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0:
            return out.stdout.strip()
    except Exception:
        pass
    return None


def dst_branch(refspec):
    name = refspec.split(':')[-1]
    if name.startswith('+'):
        name = name[1:]
    if name.startswith('refs/heads/'):
        name = name[len('refs/heads/'):]
    return name


def check_git(args, cwd):
    repo = cwd
    i = 0
    sub, rest = None, []
    while i < len(args):
        a = args[i]
        if a == '-C' and i + 1 < len(args):
            nxt = args[i + 1]
            repo = nxt if os.path.isabs(nxt) else os.path.join(repo, nxt)
            i += 2
        elif a in GIT_ARG_OPTS and i + 1 < len(args):
            i += 2
        elif a.startswith('-'):
            i += 1
        else:
            sub, rest = a, args[i + 1:]
            break

    if sub in BLOCKED_SUBCOMMANDS:
        return "'git %s' is deny-listed in any form (including via -C or cd). Give the exact command to the user to run manually." % sub

    if sub == 'add':
        for a in rest:
            if a in ('-A', '--all', '-u', '--update', '.'):
                return "bulk 'git add %s' is deny-listed (including via -C or cd). Stage files explicitly by name." % a
        return None

    if sub != 'push':
        return None

    for a in rest:
        if a in ('-f', '--force', '--force-with-lease', '--force-if-includes') or a.startswith('--force-with-lease='):
            return 'force push is not allowed. Ask the user to run it manually.'

    positional = [a for a in rest if not a.startswith('-')]
    refspecs = positional[1:]  # positional[0] is the remote
    needs_branch_resolve = not refspecs
    for r in refspecs:
        name = dst_branch(r)
        if name == 'HEAD':
            needs_branch_resolve = True
            continue
        if name in PROTECTED:
            return "pushing to '%s' is not allowed. Push a feature branch instead, or give the command to the user to run manually." % name

    if needs_branch_resolve:
        cur = current_branch(repo)
        if cur is None or cur in PROTECTED:
            shown = cur or 'unresolvable (possibly main)'
            return "this push targets the current branch '%s'. Push an explicit feature branch (git push origin <branch>), or give the command to the user." % shown
    return None


def check_gh(args):
    words = [a for a in args if not a.startswith('-')]
    if words[:2] == ['repo', 'create'] and '--push' in args:
        return "'gh repo create --push' pushes main without the git-push guard. Create the repo without --push and let the user push, or push a feature branch."
    if words[:2] == ['pr', 'merge']:
        return "'gh pr merge' must be run by the user, not the agent."
    return None


def main():
    data = json.loads(os.environ.get('CLAUDE_HOOK_INPUT') or '{}')
    cmd = data.get('tool_input', {}).get('command', '')
    cwd = data.get('cwd') or os.getcwd()
    if not cmd:
        return
    for seg in segments(tokenize(cmd)):
        seg = strip_wrappers(seg)
        if not seg:
            continue
        base = os.path.basename(seg[0])
        reason = None
        if base == 'cd' and len(seg) > 1:
            # Track `cd dir && git push` so bare-push branch resolution
            # looks at the directory git will actually run in.
            cwd = seg[1] if os.path.isabs(seg[1]) else os.path.join(cwd, seg[1])
        elif base == 'git':
            reason = check_git(seg[1:], cwd)
        elif base == 'gh':
            reason = check_gh(seg[1:])
        if reason:
            print(reason)
            return


main()
PYEOF
)
if [ -n "$GUARD_OUT" ]; then
  echo "Blocked by pre-tool-enforcer: $GUARD_OUT" >&2
  exit 2
fi

exit 0

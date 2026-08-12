#!/usr/bin/env bash
# Syntax guard for pre-tool-enforcer.sh (PreToolUse hook entry point).
#
# Why this exists: the enforcer runs before EVERY Bash call. If the enforcer
# itself becomes syntactically invalid (Burn 2026-08-12: merge conflict
# markers <<<<<<< landed in it mid-merge), every Bash command dies with a
# bare "syntax error" and Bash-based recovery is impossible. This wrapper
# keeps the fail-closed posture (security guard never opens) but replaces
# the cryptic failure with explicit recovery instructions for the Edit tool.
#
# Design decision (2026-08-12, user-selected): fail-closed + guided recovery.
# Rejected: degraded minimal guard (opens a wrapped-command window),
# fail-open (guard fully down while broken). Do not weaken this to
# fail-open without an explicit user decision.
#
# Keep this file boring and rarely edited: it is the new single point of
# failure, and its safety comes from never changing.

TARGET="${PRE_TOOL_ENFORCER_TARGET:-$HOME/.claude/scripts/pre-tool-enforcer.sh}"

if ! SYNTAX_ERR=$(bash -n "$TARGET" 2>&1); then
  {
    echo "Blocked by pre-tool-enforcer-guard: $TARGET is syntactically broken, so ALL Bash calls are blocked (fail-closed)."
    echo ""
    echo "Syntax error:"
    echo "$SYNTAX_ERR"
    echo ""
    echo "Recovery (Bash is unavailable while this persists):"
    echo "  1. Use the Edit tool (NOT Bash) on $TARGET"
    echo "  2. Most likely cause: leftover merge conflict markers (<<<<<<< / ======= / >>>>>>>). Remove them, keeping the intended side."
    echo "  3. Any Bash call after the fix will pass this guard again."
  } >&2
  exit 2
fi

exec "$TARGET"

# Git Workflow

## Commit Message Format

`<type>: <description>` + blank line + optional body.
Types: feat, fix, refactor, docs, test, chore, perf, ci

Commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` is added
by the harness; do not add other attribution.

## Author Email (GH007 prevention, MANDATORY)

**Before the FIRST commit in any new repository:**

```bash
git config user.email "207206215+ryg35@users.noreply.github.com"
```

Email privacy protection is ON: commits with the private personal address (git's
global default) are REJECTED at push with GH007 and the history must be rewritten.
Never write that address into a committable file, this one included.
Burn: 2026-07-24, a private repo needed 9 commits rewritten before first push.

Fix for unpushed commits that already carry the private email:

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
export GIT_AUTHOR_EMAIL="207206215+ryg35@users.noreply.github.com"
export GIT_COMMITTER_EMAIL="207206215+ryg35@users.noreply.github.com"
' -- --all
```

## Decision Trailers (design-carrying commits only)

Attach when your future self, reading `git log` in 3 months, needs to recall why.
Skip for typo / formatting / mechanical rename.

- `Constraint:` constraint that bounded the decision (technical, policy, time)
- `Rejected:` alternative considered | reason for rejection
- `Directive:` warning or instruction for future modifiers of this code
- `Confidence:` high | medium | low
- `Scope-risk:` narrow | moderate | broad (blast radius)
- `Not-tested:` edge case or scenario not covered by tests

Place at the **end** of the body, one blank line after the prose:

```bash
git commit -m "$(cat <<'EOF'
fix(auth): prevent silent session drops during long-running ops

Auth returns inconsistent codes on token expiry, so the interceptor catches all 4xx.

Constraint: Auth service does not support token introspection
Rejected: Extend token TTL to 24h | security policy violation
Directive: Catching all 4xx is intentional; do not narrow without verifying upstream
EOF
)"
```

**Burn-related commits must carry a `Directive:`.** 1st fix of a bug: a `Directive:`
saying do not step on this rake again. 2nd time it nearly returns: promote to a rule,
and that commit carries a `Directive:` too.

## Push は実行しない。コマンドを渡す

**`git push` は AI が実行しない。** 実行するコマンドを1行で渡す。リモートとブランチを必ず書く。

```bash
cd <repo> && git push origin <branch>
```

初回は `git push -u origin <branch>`。素の `git push` は渡さない。外に出す操作は利用者が引く
（同形: `rm` / `git rm` / `gh pr merge`）。
burn 2026-08-31: f1-weather PR #62 で `git push` を実行しようとして拒否された。
burn 2026-09-05 (2回目、規則に昇格): PR #66 で素の `git push` を渡し「明示的に」と指摘された。

## Pull Request Workflow

Use `git diff [base-branch]...HEAD`, the full history, not just the latest commit.

**ALWAYS surface the full PR URL as a clickable link in the final message**, on every
PR creation, PR-branch push, and conflict resolution. "Linked it earlier" does not count.
Burn: 2026-08-12, user had to ask "URLくれ" before merging PR #31.

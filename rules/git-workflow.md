# Git Workflow

## Commit Message Format

`<type>: <description>` + blank line + optional body.
Types: feat, fix, refactor, docs, test, chore, perf, ci

The `Co-Authored-By: Claude <model> <noreply@anthropic.com>` commit trailer is added
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

**`main` / `master` / `develop` など既定ブランチへの push コマンドは渡さない。例外なし。** `~/.claude` の設定リポジトリも、
1行の chore も同じ。渡すのは作業ブランチの push だけで、既定ブランチへは必ず PR を通す。

1. コミットする前に `git branch --show-current` を見る。既定ブランチか、マージ済みのブランチ
   (`git branch -r --merged origin/main` に出る) なら、`git switch -c <type>/<slug> origin/main` で切ってからコミットする。
2. push コマンドを書く前に、`<branch>` が既定ブランチでないことを確かめる。既定ブランチなら書かずに 1. に戻る。
3. push を渡したら、同じターンで PR を作る段取り（push 後に `gh pr create`）まで示す。

burn 2026-10-29: `~/.claude` でマージ済みの feat/model-roles の上にコミットし、確かめないまま
`git push origin main` を渡した。「main push やめれ。PRつくるべ」と指摘された。

## Branch names: `release/<x>` fails when a `release` branch exists

Git stores branches as files under `refs/heads/`, so `release` and `release/<name>` cannot
coexist: `git switch -c release/foo` dies with `cannot lock ref ... 'refs/heads/release' exists`.
Same for any `<name>` / `<name>/<sub>` pair.

**Do not escape it by renaming to `release-<name>`.** Reuse the existing branch: fast-forward
it to the target base, then cherry-pick.

```bash
git switch release && git merge --ff-only origin/main
```

`git reset --hard` is deny-listed by the pre-tool-enforcer, which is what pushes you toward a
new name. `merge --ff-only` does the same job when the branch is already contained in the base
(check with `git merge-base --is-ancestor <branch> origin/main`), and it refuses instead of
destroying work when it is not.

burn 2026-09-20: client-project-A の release で `release/campaign-kpi-...` が作れず、reset も deny
され、`release-campaign-kpi-2026-09-20` に逃げた。ff-only を探さなかっただけで、PR を 1 本
作り直しになった。

**The fixed branch is checked out in another worktree: advance it there, never rename.**
`git switch web-release` fails with `already used by worktree at <path>`. Run the ff inside
that worktree instead: `git -C <path> merge --ff-only origin/main`, then cherry-pick there.
A dated or suffixed copy (`web-release-2026-11-02`) is the same escape as above. No exceptions.
A delegation prompt never offers a fallback branch name; it says "stop and report" instead.

burn 2026-11-02 (2nd time, client-project-A): a subagent brief allowed `web-release-2026-11-02` as a
fallback and the release PR (#485) went out from it; the release had to be re-opened from
`web-release` as #486. The repo's release-flow-guard would have blocked it but only loads in
sessions opened in the repo; `~/.claude/scripts/client-project-A-release-guard.sh` now runs it everywhere.

## Pull Request Workflow

Use `git diff [base-branch]...HEAD`, the full history, not just the latest commit.

**ALWAYS surface the full PR URL as a clickable link in the final message**, on every
PR creation, PR-branch push, and conflict resolution. "Linked it earlier" does not count.
Burn: 2026-08-12, user had to ask "URLくれ" before merging PR #31.

## Merge state: check it yourself, never wait to be told

**Whenever a PR is waiting on merge (handoff `マージ待ち`, a PR you opened this session, or a
post-merge runbook step is next), run `gh pr view <url> --json state,mergedAt` BEFORE replying
to the user's next message.** No exceptions, whatever that message says ("次", "続き", anything).

- `MERGED`: say so in one line with `mergedAt`, then present the first post-merge step (show its
  content and wait for approval as the prod-SQL/CLI rule requires; checking merge state does not
  authorize running anything).
- `OPEN`: one line ("#337 はまだ未マージ"), then continue with other work.
- Never ask "マージしましたか?". The app's PR monitor does not fire on merge, so the user is the
  only other source, and making them report it is the failure this rule exists to stop.

Burn 2026-10-01: 「PRをmergedしたときに毎回いうの面倒」.

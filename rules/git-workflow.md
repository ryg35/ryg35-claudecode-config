# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Author Email (GH007 prevention — MANDATORY)

**Before the FIRST commit in any new repository**, set the GitHub noreply address:

```bash
git config user.email "207206215+ryg35@users.noreply.github.com"
```

Why: the user's GitHub account has email privacy protection ON. Commits authored
with the private personal address (the global git default) are REJECTED at push
time with GH007, forcing a full history rewrite (filter-branch) before the repo
can go up. Do not write the private address itself in any file that may be
committed (this rule file included).

Burn: 2026-07-24, a private repo — 9 commits had to be rewritten before first push.
User has pointed this out multiple times across repos. Do not repeat.

If commits with the private email already exist (unpushed only):

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
export GIT_AUTHOR_EMAIL="207206215+ryg35@users.noreply.github.com"
export GIT_COMMITTER_EMAIL="207206215+ryg35@users.noreply.github.com"
' -- --all
```

## Decision Trailers (for significant commits only)

Attach structured trailers to commits that carry a design decision. Skip trailers for trivial commits (typo, formatting, mechanical rename).

Selection rule: would your future self, reading this commit in 3 months via `git log`, need to recall why this was done? If yes, attach trailers.

### Trailer list

- `Constraint:` constraint that bounded the decision (technical, policy, time)
- `Rejected:` alternative considered | reason for rejection
- `Directive:` warning or instruction for future modifiers of this code
- `Confidence:` high | medium | low (confidence in correctness)
- `Scope-risk:` narrow | moderate | broad (blast radius)
- `Not-tested:` edge case or scenario not covered by tests

Each trailer is optional. Include only the ones that apply.

### Format

Place trailers at the **end** of the commit body, separated from the prose by one blank line. Use HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
fix(auth): prevent silent session drops during long-running ops

Auth service returns inconsistent status codes on token expiry,
so the interceptor catches all 4xx and triggers inline refresh.

Constraint: Auth service does not support token introspection
Rejected: Extend token TTL to 24h | security policy violation
Confidence: high
Scope-risk: narrow
Directive: Catching all 4xx is intentional; do not narrow without verifying upstream behavior
Not-tested: Auth service cold-start latency >500ms
EOF
)"
```

### Burn-related commits must carry a Directive:

This aligns with the Burn Log concept in `~/.claude/rules/coding-style.md`:

- **First** time you fix a given bug: leave a `Directive:` saying "do not step on this rake again".
- **Second** time the same bug nearly returns: promote it to a rule (and the rule-promotion commit also carries a `Directive:`).

Example:
```
Directive: This path traversal guard must be realpath-based, otherwise it can be bypassed.
A startswith()-only guard was bypassed in production on 2025-11-12.
```

### Searching the log

```bash
git log --grep='Confidence: low'      # commits where uncertainty remained
git log --grep='Rejected:' --oneline  # commits carrying explicit design decisions
git log --grep='Directive:'           # commits with warnings for future modifiers
```

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft full PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

**ALWAYS surface the PR URL.** Every time you create a PR, push to a PR
branch, or resolve a PR's conflicts, the final message to the user MUST
contain the full PR URL as a clickable link. No exceptions: "linked it
earlier in the conversation" does not count — the user merges from the
latest message, not from scrollback. Burn: 2026-08-12, user had to ask
"URLくれ" before merging PR #31 because the link only appeared at creation
time.

## Feature Implementation Workflow

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Identify dependencies and risks
   - Break down into phases

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use **code-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format
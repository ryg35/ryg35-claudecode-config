---
description: Create a GitHub Pull Request with auto-generated summary from commit history.
---

Follow `rules/model-roles.md` for every design, implementation and review step. Feature: Claude designs, Codex implements, Claude reviews. Bug: Codex designs, Claude implements, Codex reviews. Select reviewers from the actual implementer's opposite lineage; human-written PRs use both catalog lineages. Verification uses `Task(subagent_type="verifier")` on Claude in both flows and is an evidence check, not review. If Codex is unavailable (limit, login failure, crash), stop and ask. Tool access outside Codex's sandbox (MCP, browser connectors, etc.) is not unavailability: Claude implements and Codex reviews; announce that routing. Only the step taken over changes hands. Resolve model selection and any explicit override through `rules/model-roles.md`.


# PR Create

Create a GitHub Pull Request with comprehensive summary.

## Instructions

1. **Check prerequisites**

```bash
git status
git log --oneline origin/main..HEAD
```

- Verify there are commits to create a PR from
- Verify current branch is not main/master
- Verify branch is pushed to remote

2. **If branch is not pushed, push it**

```bash
git push -u origin <current-branch>
```

3. **Analyze all commits in the PR**

```bash
git log origin/main..HEAD --format="%s%n%b" --no-merges
git diff origin/main...HEAD --stat
```

- Understand the full scope of changes
- Identify all files changed and their purposes

3.5. **Model routing suggestion**

Use the feature/bug flow above and the actual implementer to choose the opposite reviewer lineage. Use the existing review catalog, not PR size, to choose scopes.

4. **Generate PR title**

- Under 70 characters
- Follow conventional commit style: `feat: ...`, `fix: ...`, etc.
- Be specific about what was done

5. **Generate PR body**

Use this template:

```markdown
## Summary
- Bullet point summary of changes (1-3 points)

## Changes
- Detailed list of what was modified and why

## Test Plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing steps

## Screenshots
(if UI changes)
```

6. **Create the PR**

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body content>
EOF
)"
```

7. **Report the PR URL**

## Arguments

$ARGUMENTS can be:
- (none) - Create PR against default base branch
- `<base-branch>` - Create PR against specific branch
- `draft` - Create as draft PR
- `draft <base-branch>` - Draft PR against specific branch

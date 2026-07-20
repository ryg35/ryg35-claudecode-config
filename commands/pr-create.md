---
description: Create a GitHub Pull Request with auto-generated summary from commit history.
---

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

Suggest the optimal model for review based on PR size:
- Large PR (50+ files) → Opus review recommended
- Medium PR (10-50 files) → Sonnet review recommended
- Small PR (1-10 files) → Haiku is sufficient

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

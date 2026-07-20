---
description: Check for potential merge conflicts with the base branch before implementation starts.
---

# Conflict Check

Pre-implementation conflict detection against the base branch.

## Instructions

1. **Detect base branch**

```bash
git remote show origin | grep 'HEAD branch' | awk '{print $NF}'
```

2. **Fetch latest remote state**

```bash
git fetch origin
```

3. **Check divergence**

```bash
git log --oneline HEAD..origin/<base-branch>
git log --oneline origin/<base-branch>..HEAD
```

- Report: how many commits ahead/behind

4. **Dry-run merge to detect conflicts**

```bash
git merge --no-commit --no-ff origin/<base-branch>
```

- If conflicts exist: list all conflicting files with `git diff --name-only --diff-filter=U`
- Then abort: `git merge --abort`
- If no conflicts: abort cleanly: `git merge --abort`

5. **Check overlapping file changes**

```bash
git diff --name-only origin/<base-branch>...HEAD
```

- Cross-reference with files changed on remote since fork point
- Highlight files modified on both branches (high conflict risk)

## Output

```
CONFLICT CHECK: [CLEAN / WARNING / CONFLICTS DETECTED]

Base branch:  main
Ahead:        X commits
Behind:       Y commits

Overlapping files: Z
  - path/to/file1.ts (both modified)
  - path/to/file2.ts (both modified)

Conflicts:    [NONE / X files]

Recommendation: [SAFE TO PROCEED / REBASE FIRST / MERGE BASE FIRST]
```

## Arguments

$ARGUMENTS can be:
- (none) - Check against default base branch
- `<branch-name>` - Check against specific branch

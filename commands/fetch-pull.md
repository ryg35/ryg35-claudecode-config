---
description: Safely sync with remote by verifying a clean working tree, then fetch and pull with explicit conflict handling.
---

## Fetch & Pull (Procedure)

### 0) Check current state (required)

```bash
git status
```

- **What to check**
  - **Current branch** is the intended one
  - **No uncommitted changes** exist (if any, commit or stash them before proceeding)

### 0.5) Handle uncommitted changes (MANDATORY GATE)

**CRITICAL: NEVER pull with uncommitted changes. NEVER commit them either. You MUST stash first → pull → create branch → stash pop → then commit.**

```bash
# 1. Stash
git stash -u

# 2. Pull (proceed to steps 1–3)

# 3. After pull, create a working branch
git switch -c <branch-name>

# 4. Restore and then commit
git stash pop
```

- `-u` includes untracked files in the stash
- **Note**: if conflicts occur during stash pop, resolve them using the same steps 5–7

### 1) Fetch latest information from remote

```bash
git fetch origin
```

- **Intent**: retrieve remote changes as metadata first, before merging into local
- **Note**: `fetch` does not modify the working tree, so it is safe

### 2) Check the diff against remote

```bash
git log HEAD..origin/main --oneline
```

- **What to check**
  - How many commits exist on the remote
  - What kind of changes are included
- **Note**: replace `main` with `master` or the appropriate target branch name

### 3) Pull (merge strategy)

```bash
git pull origin main
```

- **Note**: always specify the branch name explicitly (don't omit it)
- **Intent**: integrate remote changes into the local branch

---

## Conflict resolution procedure (when conflicts occur)

### 4) Check whether conflicts exist

```bash
git status
```

- **No conflicts** → skip to step 8
- **Conflicts exist** → check the files shown as `both modified:`, then proceed

### 5) Identify conflict locations

```bash
grep -rn '<<<<<<< HEAD' .
```

- **What to check**
  - Which files and lines have conflicts
  - The number and scope of conflicts

### 6) Ask the user for conflict resolution strategy

- **For each conflicting file**, present both the local and remote changes to the user, then use the `AskUserQuestion` tool to ask for the resolution strategy

- **Information to present**
  - File name and the relevant section
  - Local changes (`<<<<<<< HEAD` to `=======`)
  - Remote changes (`=======` to `>>>>>>> origin/main`)

- **What to ask via AskUserQuestion**
  - Options:
    - **Keep local**: adopt the local changes
    - **Keep remote**: adopt the remote changes
    - **Merge both**: combine both changes
  - If the user selects "Merge both", present a proposed merge and confirm again

- **Note**: all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) must be **completely removed** after resolution
- **Note**: never resolve conflicts without the user's explicit decision

### 7) Stage resolved files and commit

```bash
git add <resolved-files>
git commit -m "Resolve merge conflicts from origin/main"
```

- **Commit message examples**
  - `"Resolve merge conflicts from origin/main"`
  - `"Merge origin/main and resolve conflicts in config"`

---

## Final verification

### 8) Check the final state

```bash
git status
git log --oneline -5
```

- **What to check**
  - Output shows `nothing to commit, working tree clean`
  - The merge commit is correctly reflected

### 9) Restore stash (only if stashed in step 0.5)

```bash
git stash pop
```

- **Note**: conflicts can also occur during stash restoration → resolve them using the same steps 5–7

---

## Conflict resolution rules (summary, important)

### 1) Core principles (most important)

- **Understand the full picture before resolving**
  Always check all conflict locations with `git status` and `grep` before starting resolution
- **Resolve file by file**
  Don't try to resolve everything at once; review and resolve one file at a time

### 2) Resolution strategy

- **Understand the intent of the code before choosing**
  Don't simply default to "keep local" or "keep remote"; understand the intent behind both changes before deciding
- **When unsure, ask the team member**
  For changes you can't judge alone, confirm with the author before resolving

### 3) Post-resolution checks

- **Verify that the build and tests pass**
- **Verify no conflict markers remain** using `grep`

```bash
grep -rn '<<<<<<< ' .
grep -rn '=======' .
grep -rn '>>>>>>> ' .
```

### 4) Common pitfalls

- **Leftover conflict markers**: `=======` often gets left behind
- **Forgetting to restore stash**: check `git stash list` for any stashed changes
- **Forgetting to fetch**: make it a habit to always fetch and review the diff before pulling

---
description: Safe commit & push procedure with branch gate, staged-diff review, secret check, then push and PR confirmation.
---

## Commit & Push (Procedure)

### 0) Check current state (required)

```bash
git status
```

- **What to check**
  - **Current branch** is the intended one
  - **Changed files** are as intended (no unrelated files mixed in)

### 0.5) Create a branch if needed (when you are on main / master)

- If the **branch name matches your change** and you are **already on a non-main/non-master branch**, skip this step and continue
- If your **current branch is main / master**, create a new branch with a name aligned to your change, switch to it, then continue

```bash
git switch -c <branch-name-aligned-to-your-change>
```

- **Naming guideline (one line)**: use a prefix like `docs/xxx` / `fix/xxx` / `feat/xxx` + a short description so the purpose is obvious

### 1) Verify branch name matches the change (MANDATORY GATE)

**CRITICAL: If the branch name does NOT match the change content, you MUST AskUserQuestion before proceeding. NEVER commit-push without resolving this mismatch.**

- Confirm the **branch name and the change content are aligned**
  Example: `fix/xxx` for bug fixes, `docs/xxx` for documentation, `feat/xxx` for new features, etc.
- **If they are NOT aligned** — present these options to the user via AskUserQuestion:
  1. Create a new branch with an appropriate name
  2. Rename the current branch (`git branch -m <new-name>`)
  3. Proceed anyway (requires explicit user approval)

### 2) Stage files, explicitly naming what you add

```bash
git add <target-files> .
```

- **Intent**: explicitly list what you want to add, while staging the required changes
- **Note**: since `.` can include unintended files, always re-check with `git status` right before this

### 3) Commit with a short one-sentence English message

```bash
git commit -m "Short English message in one sentence"
```

- **Examples**
  - `"Fix typo in docs"`
  - `"Update commit and push instructions"`
  - `"Refactor config loading"`

### 4) Push to remote (explicit branch name)

```bash
git push origin <explicit-branch-name>
```

- **Note**: don’t use the abbreviated `git push`; always specify **`origin` and the branch name**

### 5) Final state check (recommended)

```bash
git status
```

### 6) Ask whether to create a PR (MANDATORY GATE — AskUserQuestion ONLY)

**CRITICAL RULE: After a successful push, you MUST use the `AskUserQuestion` tool to ask whether to create a Pull Request. Asking via plain chat text is STRICTLY FORBIDDEN.**

- ✅ ALLOWED: Calling the `AskUserQuestion` tool with the options below
- ❌ FORBIDDEN: Writing a chat message like "Do you want to create a PR?" and waiting for the user's reply
- ❌ FORBIDDEN: Skipping this gate and creating a PR automatically
- ❌ FORBIDDEN: Skipping this gate and finishing without asking

If `AskUserQuestion` is not yet loaded, load it first via `ToolSearch` with `select:AskUserQuestion`, then call it. Never fall back to chat.

Required `AskUserQuestion` call:
- question: "Push completed. Do you want to create a Pull Request?"
- options:
  1. **Create PR now** — run `/pr-create` (or `gh pr create`) with auto-generated title/body from commits
  2. **Create PR with custom title/body** — prompt me for title/body before opening
  3. **Skip** — do not create a PR (e.g., still WIP, or PR already exists)

Based on the user's choice via the tool, proceed accordingly. **Never create a PR without explicit user approval via this AskUserQuestion gate, and never substitute chat for the tool.**

---

## Commit guidelines (summary, important)

### 1) Core principles (most important)

- **One commit = one purpose**  
  Include only one logical change (don’t mix “fix + formatting + refactor” in a single commit)
- **Commit message should describe “what you did”**  
  Put the “why” in PR / Issue / Discussion; commit history should make the change immediately clear

### 2) Structure (recommended format)

- **Standard**: `<type>: <summary>`
- **Examples**
  - `fix: ...`
  - `add: ...`
  - `refactor: ...`

### 3) Type usage (de facto standard)

- **add**: new feature / new files
- **fix**: bug fix
- **change**: behavior/spec change (including breaking changes)
- **refactor**: structural improvement without behavior change
- **remove**: remove feature/code
- **docs**: documentation only
- **test**: add/update tests
- **chore**: build/CI/config

Note: some teams use `feat` / `style`, etc. What matters most is **consistency within the team**.

### 4) Summary (first line) rules

- Keep it **short and specific** (guideline: **within 50 characters**)
- Standardize on either **noun phrase** or **verb-led** style within the team
- Be concrete about the target (avoid vague messages like “update”, “fix bug”)

### 5) Body (only when needed)

- **When to write it**
  - the reason isn’t obvious from the code
  - behavior/spec changes
  - side effects or cautions exist
- **How**: short bullet points for key context (background/impact/cautions)

### 6) Issue / PR linkage (if needed)

- **Include issue number**: `fix: ... (#123)`
- **Auto-close** (add to body): `Closes #123`

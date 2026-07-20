# Directory Conventions

Rules for **creating new meta structure** under `docs/`, `.github/`, and similar.
Not for routine code edits or single-file changes.

## Trigger

Read this file **before starting work** when any of the following applies:

- Creating a new directory under `docs/` (mkdir, new subdir)
- Deciding a file naming convention under `docs/` (e.g. date-prefix vs verb-topic)
- Creating a new template file (`_template*.md`)
- Inventing a file lifecycle policy (e.g. active to done movement)
- Defining required frontmatter keys

Does not apply to routine work: code edits, bug fixes, single-file additions, conforming to existing conventions.

## Rules

### 1. Read global conventions **first**

Before inventing an ad-hoc convention, check **all** of the following:

| Location | What it defines |
|---|---|
| `~/.claude/agents/planner.md` | The 3 plan templates, naming (verb-topic), lifecycle (backlog to active to in-progress to done) |
| `~/.claude/agents/project-doc-gen.md` | Standard `docs/` structure (PROJECT-SEED.md based) |
| `~/.claude/agents/repo-scaffolder.md` | Folder structure for repository initialization |
| `~/.claude/agents/doc-updater.md` | Constraints when updating `docs/` |
| `~/.claude/templates/` | Master templates to copy from (plan/, PROJECT-SEED.md, etc.) |
| `~/.claude/rules/coding-style.md` | File Organization (small files, 200-400 lines) |
| Project `CLAUDE.md` | Project-specific no-edit zones, ADR conventions |
| Project `docs/folder.md` (if present) | Existing folder responsibilities |

If a relevant convention exists, **follow it instead of inventing one**.
Only when no convention exists, ask the user "I do not see this in global conventions, may I define one?"

### 2. Templates: copy, do not create

If a master template exists under `~/.claude/templates/`, **copy from it**:

```bash
# Example: plan templates
cp ~/.claude/templates/plan/_template-feature.md docs/plan/_template-feature.md
cp ~/.claude/templates/plan/_template-fix.md docs/plan/_template-fix.md
cp ~/.claude/templates/plan/_template-investigate.md docs/plan/_template-investigate.md
```

If a project already has a template, **do not overwrite** it (preserve user customization).

Do not **invent** a custom template (e.g. a single generic `_template.md`).
If no master matches, ask the user "should I create a new master, or keep this project-local?"

### 3. Naming follows convention

| Kind | Convention source | Format |
|---|---|---|
| Plan | `~/.claude/agents/planner.md` | `<verb>-<topic>.md` (e.g. `add-settings-screen.md`) |
| ADR | Project `docs/decisions/` practice | `NNNN-<title>.md` sequential |
| Runbook | Project `docs/folder.md` | Subject (not verb) (`deploy.md`, `incident.md`) |
| Research | Project `docs/folder.md` | `YYYY-MM-DD-<topic>.md` (received-date prefix) |

For kinds not covered, **observe existing files first** before deciding.
Whether to date-prefix depends on the convention, not on independent judgment.

### 4. Frontmatter keys follow convention

planner convention for plan frontmatter is **`status` / `branch` only**:

```yaml
---
status: backlog
branch: feat/example-feature
---
```

Add custom keys (`title` / `date` / `related` / `scope`) only **after** the required keys are satisfied.
Do not replace required keys.

### 5. Lifecycle follows convention

Plan state transitions follow planner convention:

- `backlog` to `active` to `in-progress` to `done`
- `done` is moved to `docs/plan/done/<name>.md` via **`git mv`** (preserves history)
- Deletion after completion is prohibited

Do not invent custom lifecycles (e.g. status values like "shipped", "rejected").
If a missing status is needed, ask the user before adding it to rules.

## Burn Log

### First incident: invented `docs/plan/` structure without reading planner conventions

**What happened:**

When creating `docs/plan/` for the first time in a project, planner conventions in `~/.claude/agents/planner.md` were not consulted. Invented instead:
- A single generic `_template.md`
- Date-prefixed filenames (`YYYY-MM-DD-<topic>.md`)
- Custom lifecycle statuses ("done", "rejected")

After user pointed out "your planner agent has a `_template` pattern, it should be in global config", reading `planner.md` revealed:

- 3 templates (`_template-feature.md` / `_template-fix.md` / `_template-investigate.md`)
- Master copies live in `~/.claude/templates/plan/`
- Naming is `<verb>-<topic>.md` (no date prefix)
- Frontmatter is `status` / `branch` only
- Lifecycle is `backlog` to `active` to `in-progress` to `done`, with `done` moved to `docs/plan/done/` via `git mv`

Every one of these had a convention. Every one was reinvented.

**Why it happened:**

- When the user said "put a plan under `docs/plan/`", the mental mode flipped to "create a new directory"
- The step "check existing global conventions when creating new structure" was skipped, content was filled in directly
- `planner.md` was assumed to be "rules for the planner subagent only", not rules Claude itself follows

**Prevention:**

- This rules file (`directory-conventions.md`) is referenced from `~/.claude/CLAUDE.md` and `~/.claude/rules/coding-style.md`
- Before inventing directory structure, naming, templates, or lifecycle, walk through the "global conventions checklist" in this file
- Treat `planner.md` / `project-doc-gen.md` / `repo-scaffolder.md` / `doc-updater.md` as **rules Claude itself follows**, not subagent-only docs

**Decision criterion:**

"Would another Claude session make the same decision here?"
If yes, **it belongs in global conventions** (already, or needs to be added). If it is there, follow it. If not, ask the user before inventing.

## Related

- `~/.claude/agents/planner.md` (canonical plan conventions)
- `~/.claude/templates/plan/` (plan template masters)
- `~/.claude/rules/coding-style.md` (File Organization)
- `~/.claude/CLAUDE.md` (Principles entry point)

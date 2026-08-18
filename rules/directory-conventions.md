# Directory Conventions

Rules for **creating new meta structure** under `docs/`, `.github/`, and similar.
Not for routine code edits or single-file changes.

## Trigger

Read this file **before starting work** when any of the following applies:

- Creating a new directory under `docs/` (mkdir, new subdir)
- Creating a `specs/<NNN>-<slug>/` directory for SPEC-driven work (see Rule 6)
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
| `~/.claude/skills/spec-driven/SKILL.md` | SPEC-driven layout: `specs/<NNN>-<slug>/` with spec.md + plan.md + tasks.md (see Rule 6) |
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
| SPEC set | `~/.claude/skills/spec-driven/SKILL.md` | `specs/<NNN>-<slug>/` at the repo root, holding `spec.md` / `plan.md` / `tasks.md` |
| Measurement log | Rule 6 | `docs/<topic>-eval.md` (benchmark, spike, model eval) |

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

### 6. SPEC-driven work lives in `specs/`, never under `docs/`

Two places can hold a plan. The choice is made once, at the entry point, and the same work never lands in both.

| Scale of the work | Where the plan lives | Contents |
|---|---|---|
| Big enough for SPEC-driven (several files, a new feature, acceptance criteria still fuzzy) | `specs/<NNN>-<slug>/` at the **repository root** | `spec.md` + `plan.md` + `tasks.md`, all three |
| Everything else | `docs/plan/<verb>-<topic>.md` | one plan file, planner convention (Rules 1-5) |

- `specs/` sits at the repository root, **not** under `docs/`. That is exactly what keeps `specs/<NNN>-<slug>/plan.md` from colliding with `docs/plan/<verb>-<topic>.md`.
- **Never put the same work in both places.** If a SPEC set exists for the work, the `docs/plan/` file is retired (`git mv` it into `docs/plan/done/`), not kept in parallel.
- `<NNN>` is a zero-padded serial that matches the branch name: `specs/001-side-preview-translation/` pairs with `feat/001-side-preview-translation`. The branch-to-spec link is readable from the name alone.
- Task IDs in `tasks.md` restart at `T-001` **per spec directory**. They are not serial across the repository. (An existing repo started 002 at `T-101` to dodge a collision that never needed to exist.)
- Lifecycle reuses the planner statuses from Rule 5: `backlog` to `active` to `in-progress` to `done`, kept in the `spec.md` frontmatter. **Do not invent a new lifecycle** for specs. A finished spec directory stays where it is; the `docs/plan/done/` move in Rule 5 applies to plan files only, since the `<NNN>-<slug>` name is what pairs the spec with its branch.
- The `spec.md` body is the only spec and is kept current; it is **not** frozen at implementation start. From `status: in-progress` onward every change is a three-part set: update the body, keep the pre-change wording as a quote right below it, and add an entry to `## 仕様変更ログ`. The rule and its failure cases live in 規則4 of `~/.claude/skills/spec-driven/SKILL.md`; do not restate them here.
- Measurement logs (benchmarks, spikes, model evals) go to `docs/<topic>-eval.md`. One naming rule, so they stay findable.
- **Already holding both? Migration has its own procedure.** Read `~/.claude/skills/spec-driven/references/migration.md`, do not improvise here. It sorts the repo into three cases (only `docs/plan/`, both but different work, both but the same work), gives the section-by-section mapping from `~/.claude/templates/plan/_template-feature.md` into the three files, and ends with count-based checks. The steps live in one place only; this rule does not restate them.
- Measured 2026-08-17: no repo under `<dev-root>/` holds both a root `specs/` and a `docs/plan/`, so the true-duplication case has zero occurrences today. Five repos keep `docs/specs/*.md`, which is neither location; those are migration case 1.

Existing examples to copy from, not to redesign:

- `<repo-A>/specs/001-side-preview-translation/`
- `<repo-B>/specs/002-remote-mcp-and-cloudflare/`

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

### Second incident (2026-08-17): proposed a new SPEC location without checking the repos that already had one

Asked to fold SPEC-driven development into the config, I proposed `docs/spec/<slug>/`
and spent a full section of the plan draft resolving its collision with `docs/plan/`.
Two repositories already ran SPEC-driven work at `specs/<NNN>-<slug>/`
(`chrome-extensions/repo-A`, `repo-B`), where the collision does not exist
at all because the directory sits outside `docs/`. The convention was measurable in
30 seconds with `ls */specs`. This is the first incident repeated verbatim.

### Third incident (2026-08-17, same day): wrote a rule from a file's own declaration instead of its git diff

Authoring the `spec-driven` skill, I read this line at the top of a real `spec.md`:

> ステータス: 確定 (このファイルは実装中に変更しない...)

and turned it into an absolute rule: "the body is never rewritten". One `git show e601a3c`
would have shown the body line being **deleted and replaced**. The declared policy and the
practiced policy were different, and the practiced one was the correct one. The skill shipped
with a rule its own source of truth violates.

The same session produced a second instance of the same shape: the skill stated
"never create a new spec, always update the existing one" while `specs/002-cli-translation-engine/`
sat in the reference repository as a counterexample.

**The rule this promotes to (third occurrence, per the Burn Log escalation in `coding-style.md`):**

**A file's stated policy is not evidence of its practiced policy. Measure the practice.**

Before turning any observed convention into a rule, run the command that shows what
actually happened, not what the file claims:

```bash
git log -p -- <the file>          # did the body ever change, and how
git log --diff-filter=A --name-only -- <dir>/   # what was created together
ls -d */specs */docs/plan 2>/dev/null           # which layout actually exists
```

If the declaration and the diff disagree, **the diff wins** and the rule is written from
the diff. Note the disagreement in the rule itself, so the next reader does not
"fix" the rule back to the declaration.

This is the same failure as the one in `~/.claude/rules/backup-verification.md`
("a sync tool's success message is not evidence that the data arrived"). Reading a
status line and counting the actual objects are different acts. So are reading a
policy header and diffing the file.

**Decision criterion:**

"Would another Claude session make the same decision here?"
If yes, **it belongs in global conventions** (already, or needs to be added). If it is there, follow it. If not, ask the user before inventing.

## Related

- `~/.claude/agents/planner.md` (canonical plan conventions)
- `~/.claude/templates/plan/` (plan template masters)
- `~/.claude/rules/coding-style.md` (File Organization)
- `~/.claude/skills/spec-driven/SKILL.md` (SPEC set conventions, Rule 6)
- `~/.claude/CLAUDE.md` (Principles entry point)

---
name: directory-conventions
description: "Conventions for NEW meta structure. Invoke BEFORE creating: a new directory under docs/, a specs/<NNN>-<slug>/ for SPEC-driven work, a naming convention under docs/ (date-prefix vs verb-topic), a _template*.md, a file lifecycle policy, or required frontmatter keys. Announce \"I'm using directory-conventions\", then check the convention table before inventing anything. Skipping it reinvents what already exists: burned 3 times (docs/plan/ invented without reading planner.md; 2026-08-17 proposed docs/spec/<slug>/ while two repos already ran specs/<NNN>-<slug>/; 2026-08-17 wrote a rule from a declared policy instead of the git diff). Routine code edits and single-file additions are exempt."
---

# Directory Conventions

For **new meta structure** under `docs/`, `.github/` and similar.

## Trigger

Invoke **before starting work** when any of these applies:

- Creating a new directory under `docs/`
- Creating a `specs/<NNN>-<slug>/` for SPEC-driven work (Rule 6)
- Deciding a naming convention under `docs/` (date-prefix vs verb-topic)
- Creating a template file (`_template*.md`)
- Inventing a file lifecycle policy (active to done movement)
- Defining required frontmatter keys

Not for routine work: code edits, bug fixes, single-file additions, conforming to existing conventions.

## Rules

### 1. Read global conventions **first**

Before inventing an ad-hoc convention, check **all** of:

| Location | What it defines |
|---|---|
| `~/.claude/agents/planner.md` | 3 plan templates, verb-topic naming, lifecycle (backlog/active/in-progress/done) |
| `~/.claude/agents/project-doc-gen.md` | Standard `docs/` structure |
| `~/.claude/agents/repo-scaffolder.md` | Folder layout at repo init |
| `~/.claude/agents/doc-updater.md` | Constraints for updating `docs/` |
| `~/.claude/skills/spec-driven/SKILL.md` | `specs/<NNN>-<slug>/` = spec/plan/tasks.md (Rule 6) |
| `~/.claude/templates/` | Masters to copy (plan/, PROJECT-SEED.md) |
| `~/.claude/rules/coding-style.md` | File Organization (200-400 lines) |
| Project `CLAUDE.md` | No-edit zones, ADR conventions |
| Project `docs/folder.md` | Folder duties |

If a convention exists, **follow it instead of inventing one**. Only when none
exists, ask the user "not in global conventions, may I define one?"

### 2. Templates: copy, do not create

If a master exists under `~/.claude/templates/`, **copy from it**:

```bash
cp ~/.claude/templates/plan/_template-{feature,fix,investigate}.md docs/plan/
```

If a project already has one, **do not overwrite** it. Do not **invent** a custom
template (e.g. a generic `_template.md`). If no master matches, ask "new master, or
project-local?"

### 3. Naming follows convention

| Kind | Convention source | Format |
|---|---|---|
| Plan | `~/.claude/agents/planner.md` | `<verb>-<topic>.md` (`add-settings-screen.md`) |
| ADR | Project `docs/decisions/` | `NNNN-<title>.md` sequential |
| Runbook | Project `docs/folder.md` | Subject, not verb (`deploy.md`) |
| Research | Project `docs/folder.md` | `YYYY-MM-DD-<topic>.md` (received date) |
| SPEC set | `~/.claude/skills/spec-driven/SKILL.md` | `specs/<NNN>-<slug>/` at repo root: spec/plan/tasks.md |
| Measurement log | Rule 6 | `docs/<topic>-eval.md` (benchmark, spike, eval) |

For kinds not covered, **observe existing files first**: date-prefix follows the
convention, not independent judgment.

### 4. Frontmatter keys follow convention

plan frontmatter is **`status` / `branch` only** (planner convention):

```yaml
---
status: backlog
branch: feat/example-feature
---
```

Add custom keys (`title` / `date` / `related` / `scope`) only **after** those two.
Do not replace them.

### 5. Lifecycle follows convention

- `backlog` to `active` to `in-progress` to `done`
- `done` moves to `docs/plan/done/<name>.md` via **`git mv`** (keeps history)
- Deletion after completion is prohibited

Do not invent statuses (e.g. "shipped", "rejected"). Ask the user before adding one.

### 6. SPEC-driven work lives in `specs/`, never `docs/`

Two places can hold a plan. Choose once; the same work never lands in both.

| Scale of the work | Where the plan lives | Contents |
|---|---|---|
| SPEC-driven scale (several files, new feature, criteria still fuzzy) | `specs/<NNN>-<slug>/` at the **repo root** | all three files |
| Everything else | `docs/plan/<verb>-<topic>.md` | one plan file (Rules 1-5) |

- `specs/` sits at the repo root, **not** under `docs/`. That is what keeps `specs/<NNN>-<slug>/plan.md` from colliding with `docs/plan/<verb>-<topic>.md`.
- **Never both places.** If a SPEC set exists, retire the `docs/plan/` file (`git mv` into `docs/plan/done/`).
- `<NNN>` is a zero-padded serial matching the branch: `specs/001-side-preview-translation/` pairs with `feat/001-side-preview-translation`.
- Task IDs in `tasks.md` restart at `T-001` **per spec directory**, not serial across the repo. (A repo started 002 at `T-101` to dodge a collision that never existed.)
- Lifecycle reuses the Rule 5 statuses in the `spec.md` frontmatter. **No new lifecycle.** A finished spec directory stays put; the `docs/plan/done/` move is for plan files only, since `<NNN>-<slug>` pairs the spec with its branch.
- The `spec.md` body is kept current, **not** frozen at implementation start. From `status: in-progress` on, a change is three parts: update the body, keep the old wording as a quote below it, add an entry to `## 仕様変更ログ` (規則4 of the spec-driven skill).
- Measurement logs (benchmarks, spikes, evals) go to `docs/<topic>-eval.md`.
- **Holding both already?** Follow `~/.claude/skills/spec-driven/references/migration.md`, do not improvise: three cases (only `docs/plan/`, both with different work, both with the same work), a section map from `_template-feature.md` into the three files, count-based checks.
- Measured 2026-08-17: no repo under `<dev-root>/` holds both a root `specs/` and a `docs/plan/` (true duplication: zero today). Five keep `docs/specs/*.md`, neither location, migration case 1.

Copy from, do not redesign:

- `<repo-A>/specs/001-side-preview-translation/`
- `<repo-B>/specs/002-remote-mcp-and-cloudflare/`

## Burn Log

1. **Invented `docs/plan/` from scratch** (generic `_template.md`, `YYYY-MM-DD-<topic>.md`, statuses "done"/"rejected") without reading `~/.claude/agents/planner.md`, which already had 3 templates, `<verb>-<topic>.md`, `status`/`branch`, and the `git mv` to `docs/plan/done/`. Cause: `planner.md` read as subagent-only docs. It plus `project-doc-gen.md` / `repo-scaffolder.md` / `doc-updater.md` are **rules Claude itself follows**.
2. **2026-08-17**: proposed `docs/spec/<slug>/` and spent a plan section resolving its collision with `docs/plan/`, while `chrome-extensions/repo-A` and `repo-B` already ran `specs/<NNN>-<slug>/`, where no collision exists. `ls */specs` would have shown it in 30 seconds. Incident 1 verbatim.
3. **2026-08-17, same day**: read `ステータス: 確定 (実装中に変更しない...)` atop a real `spec.md` and shipped "the body is never rewritten". One `git show <the-commit>` shows that line deleted and replaced. Same session: the skill said "never create a new spec" while `specs/002-cli-translation-engine/` sat in the reference repo.

**Promoted rule (third occurrence, per the Burn Log escalation in `coding-style.md`):
a file's stated policy is not evidence of its practiced policy. Measure the practice.**

```bash
git log -p -- <the file>          # did the body ever change, and how
git log --diff-filter=A --name-only -- <dir>/   # what was created together
ls -d */specs */docs/plan 2>/dev/null           # which layout actually exists
```

If declaration and diff disagree, **the diff wins**, and note the disagreement in
the rule so the next reader does not "fix" it back. Same failure as
`~/.claude/skills/backup-verification/SKILL.md`: reading a status line and counting the
objects are different acts.

**Decision criterion:** "Would another Claude session make the same decision here?"
If yes, **it belongs in global conventions**: follow it if it is there, ask the user
before inventing if it is not.

## Related

`~/.claude/agents/planner.md` (canonical plan conventions) /
`~/.claude/templates/plan/` / `~/.claude/rules/coding-style.md` /
`~/.claude/skills/spec-driven/SKILL.md` / `~/.claude/CLAUDE.md`

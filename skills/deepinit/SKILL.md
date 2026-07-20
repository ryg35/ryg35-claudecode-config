---
name: deepinit
description: Build a hierarchical set of AGENTS.md documentation files across the codebase so future agents can navigate any directory and immediately understand its purpose, key files, conventions, and dependencies.
user_invocable: true
argument-hint: "[<directory subset>]"
---

# Deepinit Skill (/deepinit)

## Purpose

Create AGENTS.md in every meaningful directory of the codebase, linked into a navigable hierarchy via parent references. This makes the codebase legible to future agents (including this one in later sessions) without forcing them to re-explore from scratch.

## Use when

- New project that has never been documented for agents.
- Existing project whose AGENTS.md (or CLAUDE.md substructure) is missing or stale.
- After a major refactor that moved/renamed many directories.
- The user says "deepinit", "generate AGENTS.md", "document the codebase for agents".

## Do not use when

- Single file or feature needs documenting. Use `update-docs` or write a focused doc.
- The project is tiny (1-2 source directories). One root AGENTS.md is enough.
- The codebase is closed-source / vendored / generated code. Skip.

## Relationship to existing tools

- `init` command: writes the root `CLAUDE.md` file. Different artifact, complementary.
- `update-codemaps` command: keeps an existing codemap fresh. Use after deepinit to maintain.
- `project-init` skill: full project bootstrap (repo setup, CI, docs). Deepinit is the per-directory AGENTS.md layer of that.

---

## Core concept

`AGENTS.md` is AI-readable documentation per directory. Each one tells an agent:

- What this directory is for.
- Key files and one-line descriptions.
- Subdirectory map.
- Conventions and patterns to follow in this directory.
- Test/build commands relevant here.
- Dependencies (internal + external).

Every AGENTS.md except the root carries a parent reference:

```markdown
<!-- Parent: ../AGENTS.md -->
```

This creates a navigable tree:

```
/AGENTS.md                          (root, no parent)
├── src/AGENTS.md                   <!-- Parent: ../AGENTS.md -->
│   ├── src/components/AGENTS.md    <!-- Parent: ../AGENTS.md -->
│   └── src/utils/AGENTS.md         <!-- Parent: ../AGENTS.md -->
└── docs/AGENTS.md                  <!-- Parent: ../AGENTS.md -->
```

---

## AGENTS.md template

```markdown
<!-- Parent: ../AGENTS.md -->
<!-- Generated: <YYYY-MM-DD> | Updated: <YYYY-MM-DD> -->

# <Directory name>

## Purpose
<One paragraph: what this directory contains and its role in the system.>

## Key files

| File | Description |
|---|---|
| `file.ts` | <one-line purpose> |

## Subdirectories

| Directory | Purpose |
|---|---|
| `subdir/` | <one-line purpose> (see `subdir/AGENTS.md`) |

## For AI agents

### Working in this directory
<conventions, patterns, gotchas specific to this directory>

### Testing
<how to run the tests relevant to this code>

### Common patterns
<recurring patterns or idioms>

## Dependencies

### Internal
<other parts of the codebase this depends on>

### External
<key external packages used here>

<!-- MANUAL: Anything written below this line is preserved on regeneration. -->
```

The `<!-- MANUAL: -->` marker is the protected zone. On regeneration, content below it is preserved.

---

## Execution workflow

### Step 1: Map directory structure

Use `Bash` or `Glob` to list every directory, excluding:

- `node_modules`, `vendor`, `.git`, `dist`, `build`, `out`, `coverage`
- `__pycache__`, `.venv`, `.cache`
- `.next`, `.nuxt`, `.turbo`, `.svelte-kit`
- Anything in `.gitignore`

```bash
find . -type d \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -not -path '*/.next/*' \
  -not -path '*/coverage/*' \
  | sort
```

### Step 2: Group by depth

Process parents before children so parent references resolve when children are written.

```
Level 0: /
Level 1: /src, /docs, /tests, ...
Level 2: /src/components, /src/utils, /docs/api, ...
Level 3: ...
```

### Step 3: Generate level by level

For each level, fire `Task` subagents in parallel (one per directory) at Haiku tier. Each subagent:

1. Reads the files in its assigned directory.
2. Reads any sibling AGENTS.md for context.
3. Generates AGENTS.md following the template.
4. Writes the file with the correct `<!-- Parent: -->` reference.

For very large directories (>50 files), use Sonnet tier and include a brief codebase exploration in the agent prompt.

### Step 4: Compare and update existing files

When an AGENTS.md already exists:

1. Read the existing content.
2. Split into auto-generated sections vs the `<!-- MANUAL: -->` zone.
3. Regenerate the auto sections from current directory state.
4. Preserve everything under `<!-- MANUAL: -->`.
5. Update the timestamp at the top.

### Step 5: Validate the hierarchy

After generation, verify:

| Check | How |
|---|---|
| Every parent reference resolves | `grep -r '<!-- Parent:' --include='AGENTS.md' .` then check each path exists. |
| No orphaned AGENTS.md | Cross-check AGENTS.md locations against the directory list. |
| Completeness | Every non-skipped directory has an AGENTS.md (or was explicitly skipped). |
| Timestamps current | All `<!-- Generated: -->` and `<!-- Updated: -->` dates match this run. |

If any check fails, fix the affected file before reporting done.

---

## Empty / near-empty directory rules

| Condition | Action |
|---|---|
| No files, no subdirectories | Skip. No AGENTS.md. |
| No files, has subdirectories | Minimal AGENTS.md with only the subdirectory table. |
| Only generated files (`*.min.js`, `*.map`, `dist/...`) | Skip. |
| Only config files | Brief AGENTS.md describing the config purpose. |

Minimal template for directory-only containers:

```markdown
<!-- Parent: ../AGENTS.md -->
# <name>

## Purpose
Container for organizing related modules.

## Subdirectories
| Directory | Purpose |
|---|---|
| `subdir/` | <description> (see `subdir/AGENTS.md`) |
```

---

## Parallelization rules

1. **Same-level directories run in parallel.** Fire all of them in one message.
2. **Different levels run sequentially.** Parent first, then children.
3. **Large directories get their own agent.** Don't batch a giant directory with small ones.
4. **Small sibling directories can batch.** One agent can write 3-5 small leaf directories if it has the context.

---

## Quality standards

Must include:

- [ ] Accurate file descriptions, not generic.
- [ ] Correct parent reference.
- [ ] Subdirectory links to existing children.
- [ ] AI agent instructions (conventions, test commands, gotchas).
- [ ] External dependency list when relevant.

Must avoid:

- [ ] Generic boilerplate like "Contains code files".
- [ ] Wrong file names (verify against `ls`).
- [ ] Broken parent references.
- [ ] Missing important files.
- [ ] Stomping on `<!-- MANUAL: -->` content.

---

## Update / refresh mode

When run on a codebase that already has AGENTS.md files:

1. Detect existing files via `find . -name 'AGENTS.md'`.
2. Read and parse each.
3. Compute a diff between the documented state and the current directory state:
   - New files added? List them.
   - Files removed? Remove from the table.
   - Subdirectories added? Add to the subdirectory table.
4. Apply updates while preserving manual sections.
5. Update timestamps.

---

## Output structure expected after a successful run

```
AGENTS.md                            (root, no parent)
src/
  AGENTS.md                          parent: ../AGENTS.md
  components/
    AGENTS.md                        parent: ../AGENTS.md
  utils/
    AGENTS.md                        parent: ../AGENTS.md
docs/
  AGENTS.md                          parent: ../AGENTS.md
tests/
  AGENTS.md                          parent: ../AGENTS.md
```

Each non-root AGENTS.md has a working parent reference, current timestamps, and at minimum: Purpose, Key files, Subdirectories (if any), For AI agents.

---

## Final checklist

- [ ] Directory map generated, with excludes correctly applied.
- [ ] Levels processed parent-first.
- [ ] Same-level directories generated in parallel.
- [ ] Existing files updated with manual sections preserved.
- [ ] Parent reference validation passed.
- [ ] No orphaned AGENTS.md files left behind.
- [ ] Timestamps current on every regenerated file.

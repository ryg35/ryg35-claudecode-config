---
description: Project initial setup. Supports both new and existing projects. Interview → Repository setup → Document generation → CI configuration → Commit.
---

# Project Init (Orchestrator)

This command automates the initial setup of a project.
**It can be safely used for both new projects and joining existing projects midway.**
To minimize main context consumption, all heavy generation tasks are delegated to subagents.

## Arguments

$ARGUMENTS: `<project-path>` (required) — Directory path of the target to initialize

## Execution Flow

### Phase 0: Validation & Mode Detection

1. If `<project-path>` does not exist, create it with `mkdir -p`
2. **Mode detection** — Check the following to determine `new` or `existing`:
   - `.git` exists → `existing`
   - Source files such as `src/` or `package.json` exist → `existing`
   - None of the above → `new`
3. If `CLAUDE.md` already exists, warn → ask the user to choose "overwrite / merge / skip"
4. Record the mode in the `mode` field of `project-context.json`

**Important:** In `existing` mode, never overwrite or delete existing files.

### Phase 1: Interview (conducted in main context)

Ask the user the following questions and collect their answers.
**Only this phase runs in the main context (because interaction is required).**

**Important: Questions must be asked using the `AskUserQuestion` tool. Do not ask questions via text output.**
Use the AskUserQuestion tool to ask all questions at once in a single call. Use the options parameter when choices are available.

Questions:
1. **Project purpose** — What are you building? (1-2 sentences)
2. **Tech stack** — Language, framework, DB, cache, etc.
3. **Target users** — End users / developers / internal tool, etc.
4. **API presence** — REST / GraphQL / none
5. **Authentication presence and method** — JWT / OAuth / Supabase Auth / none, etc.
6. **Deployment target** — Vercel / Cloud Run / AWS / Railway / none, etc.
7. **Security contact email** — Email for vulnerability reports (used in `SECURITY.md`). Default to the user's primary email if known; otherwise leave as `TODO`.

Save answers to `<project-path>/.claude/project-context.json`.

**Additional interview for existing projects:**
- Lightly scan the existing codebase (package.json, pyproject.toml, etc.) to auto-detect the tech stack
- Confirm detected results with the user and only ask about missing information

```json
{
  "name": "project-name",
  "purpose": "description of purpose",
  "mode": "new | existing",
  "techStack": {
    "language": "TypeScript",
    "framework": "Next.js 15",
    "database": "Supabase (PostgreSQL)",
    "cache": "Redis",
    "deployment": "Vercel"
  },
  "targetUsers": "SaaS for general users",
  "api": {
    "hasApi": true,
    "type": "REST",
    "authMethod": "JWT"
  },
  "securityContact": "security@example.com",
  "createdAt": "YYYY-MM-DD",
  "initPhase": "in_progress",
  "existingFiles": ["README.md", "CLAUDE.md"]
}
```

`existingFiles` records the paths of existing files that overlap with generation targets.
Each agent skips files included in this list.

### Phase 1.5: Skills Suggestion (in main context)

Search for and suggest skills useful to the project based on interview results.
**This is only a suggestion. Installation is performed only with the user's explicit approval.**

#### Step 1: Keyword Extraction

Extract search keywords from the contents of `project-context.json`.

Extraction sources:
- Each value in `techStack` (e.g., "Next.js" → `nextjs`, "Supabase" → `supabase`)
- `api.type` (e.g., "REST" → `rest api`, "GraphQL" → `graphql`)
- `api.authMethod` (e.g., "JWT" → `auth jwt`, "OAuth" → `oauth`)
- `techStack.deployment` (e.g., "Vercel" → `vercel deploy`, "AWS" → `aws`)
- Domain-specific keywords from `purpose` (e.g., "e-commerce site" → `ecommerce`, "chat" → `realtime websocket`)

Limit keywords to **a maximum of 5** (to reduce search cost).

#### Step 2: Check installed skills

```bash
ls ~/.claude/skills/ 2>/dev/null | sort
ls ~/.agents/skills/ 2>/dev/null | sort
ls ~/.claude/commands/ 2>/dev/null | sort
```

#### Step 3: Skills search execution

Run `npx skills find` for each keyword:

```bash
npx skills find "keyword1" 2>&1 | tail -15
npx skills find "keyword2" 2>&1 | tail -15
# ... up to 5 keywords
```

#### Step 4: Filtering & Suggestion

**Filtering criteria (following weekly-review standards):**
- Only skills with **1,000+ installs** (to ensure quality and security)
- Exclude already installed skills
- Prioritize official repositories (supabase/, expo/, vercel-labs/, etc.)

**Suggestion format:**

```markdown
## Recommended Skills

Based on your project requirements, the following skills may be useful:

| # | Skill | installs | Relevance to project |
|---|-------|----------|---------------------|
| 1 | owner/repo@skill | X.XK | Explanation of relevance |
| 2 | owner/repo@skill | X.XK | Explanation of relevance |

Select the skill numbers you want to install (multiple OK, e.g., 1,3).
If not needed, reply "skip".
```

Use the `AskUserQuestion` tool to request a selection.

#### Step 5: Install selected skills

Only if the user makes a selection:

```bash
npx skills add owner/repo@skill -g -y
```

If "skip", proceed directly to Phase 2.

---

### Phase 2: Repository Initialization + Architecture Planning (parallel subagents)

Launch the following 2 agents **in parallel**.

**Agent 1: repo-scaffolder**
```
Use Agent tool:
- subagent_type: general-purpose
- prompt: "Read <project-path>/.claude/project-context.json and
  set up the repository. Check the mode field.
  - mode=new: Execute in order: .gitignore → git init → scaffold → gh repo create
    Warning: .gitignore must be created BEFORE git init.
    If created after git init, node_modules etc. will be included in the first commit.
  - mode=existing: Leave existing .git/.gitignore as-is.
    Only add missing docs/ subdirectories with mkdir -p.
    Never overwrite or modify existing files.
  Agent definition: See ~/.claude/agents/repo-scaffolder.md"
```

**Agent 2: architect (existing)**
```
Use Agent tool:
- subagent_type: architect
- prompt: "Read <project-path>/.claude/project-context.json and
  draft an architecture overview for this project.
  For mode=existing, scan existing code first and ensure content reflects the actual state.
  1. Evaluate the validity of the tech stack
  2. Recommend directory structure (respect current structure if existing)
  3. Propose design patterns based on API presence
  4. Write results to <project-path>/docs/architecture/architecture.md.
     However, if that file already exists, do not overwrite it;
     write to <project-path>/docs/architecture/architecture-draft.md instead."
```

### Phase 3: Documentation + CI Generation (parallel subagents)

After Phase 2 completes, launch the following 2 agents **in parallel**.

**Agent 3: project-doc-gen**
```
Use Agent tool:
- subagent_type: general-purpose
- prompt: "Read <project-path>/.claude/project-context.json and
  <project-path>/docs/architecture/architecture.md, then
  generate a full set of documentation following the PROJECT-SEED.md template.
  Important: Always skip files included in existingFiles.
  Do not write to paths where existing files are present.
  Agent definition: See ~/.claude/agents/project-doc-gen.md
  Template reference: ~/.claude/templates/PROJECT-SEED.md"
```

**Agent 4: ci-gen**
```
Use Agent tool:
- subagent_type: general-purpose
- prompt: "Read <project-path>/.claude/project-context.json and
  generate GitHub Actions appropriate for the tech stack.
  Skip if files already exist in .github/workflows/.
  Important: When the tech stack indicates a UI framework (Next.js / React / Vue / Svelte /
  Nuxt / Remix / Astro / Expo web), also emit .github/workflows/e2e.yml that installs
  Playwright (npx playwright install --with-deps) and runs npx playwright test,
  uploading playwright-report/ as artifact on failure. Skip this workflow file if
  .github/workflows/e2e.yml already exists.
  Agent definition: See ~/.claude/agents/ci-gen.md"
```

### Phase 3.5: E2E Scaffold (conditional subagent)

Run only when the tech stack indicates a UI surface. Detect by reading `project-context.json`:

- `techStack.framework` includes any of: `Next.js`, `React`, `Vue`, `Svelte`, `Nuxt`, `Remix`, `Astro`, `Expo`
- OR `targetUsers` is end-user facing AND a frontend framework is present

If neither matches, **skip this phase entirely**. (API-only backends, CLI tools, and library projects do not get an E2E scaffold.)

When triggered, launch:

```
Use Agent tool:
- subagent_type: e2e-runner
- prompt: "Read <project-path>/.claude/project-context.json and
  <project-path>/docs/architecture/architecture.md.
  Bootstrap a minimal Playwright E2E setup for this project:
  1. If no package.json exists yet (mode=new + fresh), skip — this phase will be
     rerun by the user after the framework is installed.
  2. Run 'npx playwright install --with-deps' (best effort; warn on failure).
  3. Create playwright.config.ts with: baseURL from env (PLAYWRIGHT_BASE_URL ||
     http://localhost:3000), retries: 2 in CI, reporter: 'html', projects for
     chromium + webkit + firefox.
  4. Create tests/e2e/ directory and a sample smoke spec tests/e2e/smoke.spec.ts
     that navigates to '/' and asserts the page loads (no 5xx, non-empty body).
  5. Create a Page Object Model template at tests/e2e/pages/BasePage.ts.
  6. Add 'test:e2e' script to package.json if writable.
  Important:
  - Respect existingFiles list in project-context.json — never overwrite.
  - Do NOT run the tests during init (server is not running yet).
  - Report which files were created vs skipped.
  Agent definition: See ~/.claude/agents/e2e-runner.md"
```

### Phase 4: Codex Review & Auto-fix

After Phase 3 completes, review the generated output with OpenAI Codex CLI before committing, and auto-fix any issues found.

1. Run Codex CLI in `full-auto` mode to review the generated code and configurations:

```bash
cd <project-path> && codex --approval-mode full-auto \
  "Review all files in this project for code quality, security issues, \
   and best practice violations. Fix any issues you find directly. \
   Focus on: typos, missing error handling, security concerns, \
   incorrect configurations, and inconsistencies."
```

2. Once Codex finishes its fixes, review the diff:

```bash
cd <project-path> && git diff
```

3. Briefly report the fix details to the user (if no fixes were needed, report "no issues found")

**Notes:**
- If Codex fails (API key not set, network error, etc.), skip and proceed to Phase 5
- Treat Codex review results as reference information; do not block the project initialization itself

### Phase 5: Initial Commit

After Phase 4 completes:
1. Update `initPhase` in `project-context.json` to `"complete"`
2. Run `/commit-push` to perform the initial commit and push
   - Commit message: `add: initialize project with docs, CI, and CLAUDE.md`

**Fallback:** Even if the hook (post-init-trigger-commit) does not fire, explicitly run `/commit-push` here.

### Phase 5.5: GitHub Security Hardening (in main context)

After the initial commit is pushed, harden GitHub security settings. The `gh` CLI requires repo admin permission for these endpoints; if the current `gh` auth account is not an admin, the API calls will return 404 and the user must perform the steps manually via the Settings UI.

#### Step 1: Try API enablement

Run the following sequentially. **Do not abort on failure** — record results and continue.

```bash
# Detect owner/repo from git remote
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# Dependabot alerts (free for both public and private)
gh api -X PUT "/repos/${REPO}/vulnerability-alerts" 2>&1

# Dependabot automated security updates (free)
gh api -X PUT "/repos/${REPO}/automated-security-fixes" 2>&1

# Secret scanning + push protection (private repo requires GHAS subscription)
gh api -X PATCH "/repos/${REPO}" \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled' 2>&1
```

#### Step 2: Report results to user

Use the AskUserQuestion tool to confirm what's been enabled vs. what needs manual action.

If any API call returned 404 or "GHAS not enabled" errors, present the manual fallback:

> Some GitHub Security settings could not be enabled via the API. Open the following URL in a browser and enable them manually:
>
> `https://github.com/<owner>/<repo>/settings/security_analysis`
>
> Recommended items:
>
> | Item | Cost | Recommendation |
> | --- | --- | --- |
> | Dependabot alerts | Free | Always ON |
> | Dependabot security updates | Free | ON (auto-opens PRs to fix vulnerabilities) |
> | Dependabot version updates | Free | Runs automatically once `dependabot.yml` is committed |
> | Secret scanning | GHAS paid for private | ON if you can afford GHAS |
> | Push protection | GHAS paid for private | Same as above |
> | Code scanning (CodeQL) | GHAS paid for private | Same as above |
>
> For private repos without GHAS, enabling only the 3 Dependabot items is sufficient.

**Note:** Skip this phase entirely if `mode=existing` AND `.github/dependabot.yml` already exists AND the user explicitly opts out at Phase 1.

### Phase 6: Completion Report (in main context)

Present the following to the user:
1. List of generated files
2. GitHub repository URL
3. Suggested next steps:
   - "Let's plan the first feature with `/plan`"
   - "Let's start test-driven development with `/tdd`"
   - "Let's add E2E coverage with `/e2e`" (only when Phase 3.5 ran)

## Minimizing Context Consumption

| Task | Execution Location | Reason |
|------|----------|------|
| Interview | Main | Requires user interaction |
| Skills suggestion | Main | User interaction + lightweight search only |
| git init + repo creation | Subagent | Routine processing |
| Architecture planning | Subagent | Independent decision-making |
| Full documentation generation | Subagent | Highest token consumption |
| CI configuration generation | Subagent | Template-based |
| E2E scaffold (conditional) | Subagent | Playwright config + smoke spec |
| Codex review & auto-fix | Bash (codex CLI) | Quality check via external tool |
| Initial commit | /commit-push | Reuse existing command |
| GitHub Security hardening | Main | gh API + manual UI fallback |
| Completion report | Main | Final report to user |

## Data Passing Between Agents

All via the filesystem. Main only instructs each agent with file paths.

```
Main → Skills search:        Extract keywords from project-context.json → npx skills find → suggest
Main → repo-scaffolder:   Read project-context.json and initialize repository
Main → architect:         Read project-context.json and plan architecture
Main → project-doc-gen:   Read project-context.json + architecture.md and generate documentation
Main → ci-gen:            Read project-context.json and generate CI (+ e2e.yml when UI stack)
Main → e2e-runner:        Read project-context.json and scaffold Playwright (conditional on UI stack)
```

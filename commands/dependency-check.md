---
description: Audit dependencies for vulnerabilities and check for outdated packages.
---

# Dependency Check

Security audit and health check for project dependencies.

## Instructions

1. **Detect package manager**

Check for lock files in order: `pnpm-lock.yaml` > `bun.lockb` > `yarn.lock` > `package-lock.json`

2. **Run security audit**

```bash
# pnpm
pnpm audit

# npm
npm audit

# yarn
yarn audit

# bun
bun pm pack --dry-run  # bun doesn't have audit, use npm audit as fallback
```

2.5. **Detailed investigation of CRITICAL vulnerabilities**

When CRITICAL-level vulnerabilities are detected:
- Use the `deep-research` skill to investigate CVE details (scope of impact, exploit availability, patch status)
- Handles cases where npm audit information alone is insufficient

3. **Check for outdated packages**

```bash
# pnpm
pnpm outdated

# npm
npm outdated
```

3.5. **Breaking changes check** (when major updates are available)

For outdated packages with major version bumps:
- Use the `documentation-lookup` skill (Context7) to retrieve the latest migration guide
- Identify the scope of breaking changes and propose a remediation strategy

4. **Check for unused dependencies**

```bash
npx depcheck --ignores="@types/*,eslint-*,prettier*,postcss*,tailwindcss*,autoprefixer*"
```

- Only report dependencies that are clearly unused
- Ignore type packages, linting tools, and build tools that may be used implicitly

5. **Check for duplicate dependencies** (if pnpm)

```bash
pnpm dedupe --check
```

6. **License check** (if a license policy exists)

- Scan for copyleft licenses (GPL, AGPL) in production dependencies
- Flag any license incompatibilities

## Output

```
DEPENDENCY CHECK: [HEALTHY / WARNING / CRITICAL]

Vulnerabilities:
  Critical: X
  High:     X
  Moderate: X
  Low:      X

Outdated (major): X packages
Unused:           X packages
Duplicates:       X packages

Action items:
  - [CRITICAL] Fix: package@version has CVE-XXXX-XXXXX
  - [WARNING] Update: package 1.x -> 2.x (breaking changes)
  - [INFO] Remove: unused-package
```

## Arguments

$ARGUMENTS can be:
- (none) - Full audit (default)
- `quick` - Security audit only
- `fix` - Auto-fix vulnerabilities where possible

---
description: Run a quick smoke test of critical paths - faster than full E2E, more than unit tests.
---

# Smoke Test

Quick validation of critical application paths.

## Instructions

1. **Detect project type and available test infrastructure**

- Check for `playwright.config.ts` / `playwright.config.js`
- Check for `cypress.config.ts` / `cypress.config.js`
- Check for test files matching `*.e2e.*`, `*.smoke.*`, `*.spec.*`

2. **If dedicated smoke tests exist**

```bash
# Look for smoke test files
find . -name "*.smoke.*" -o -name "*smoke*spec*" | head -10
```

- Run them directly

3. **If no smoke tests exist, run critical subset**

- Run only tests tagged with `@critical`, `@smoke`, or in `critical/` directory
- If no tags exist, run the first 5 E2E test files (sorted by priority/name)

4. **Fallback: Build + Type check + Core tests**

If no E2E infrastructure exists:

```bash
# Build check
npm run build 2>&1 | tail -5

# Type check
npx tsc --noEmit 2>&1 | tail -10

# Run only test files matching core business logic
npm test -- --findRelatedTests src/lib/ --passWithNoTests
```

5. **Quick API health check** (if applicable)

- If dev server is running, hit health/status endpoint
- Report response status

## Output

```
SMOKE TEST: [PASS / FAIL]

Build:     [OK / FAIL]
Types:     [OK / FAIL]
Core tests: X/Y passed
E2E smoke:  X/Y passed (Xs)

Duration: Xs (target: <60s)

Issues:
  - [description of any failures]
```

## Arguments

$ARGUMENTS can be:
- (none) - Auto-detect and run smoke tests
- `build-only` - Just build + type check
- `e2e` - Run E2E smoke subset only
- `api` - API endpoint health checks only

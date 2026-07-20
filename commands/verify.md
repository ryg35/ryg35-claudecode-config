---
description: Run build, type check, lint, and tests in order and report a PASS/FAIL verdict with evidence.
---

# Verification Command

Run comprehensive verification on current codebase state.

## Instructions

Execute verification in this exact order:

1. **Build Check**
   - Run the build command for this project
   - If it fails, report errors and STOP

2. **Type Check**
   - Run TypeScript/type checker
   - Report all errors with file:line

3. **Lint Check**
   - Run linter
   - Report warnings and errors

4. **Test Suite**
   - Run all tests
   - Report pass/fail count
   - Report coverage percentage

5. **Console.log Audit**
   - Search for console.log in source files
   - Report locations

6. **Git Status**
   - Show uncommitted changes
   - Show files modified since last commit

7. **Silent Failure Check** (pre-pr mode only)
   - Use the `silent-failure-hunter` agent to detect empty catches, swallowed errors, and dangerous fallbacks

8. **TypeScript Deep Check** (pre-pr mode only, when TS/JS files are present)
   - Use the `typescript-reviewer` agent to detect `any` overuse, non-null assertions, and unsafe casts

## Output

Produce a concise verification report:

```
VERIFICATION: [PASS/FAIL]

Build:    [OK/FAIL]
Types:    [OK/X errors]
Lint:     [OK/X issues]
Tests:    [X/Y passed, Z% coverage]
Secrets:  [OK/X found]
Logs:     [OK/X console.logs]
Silent:   [OK/X issues] (pre-pr only)
TS Deep:  [OK/X issues] (pre-pr only)

Ready for PR: [YES/NO]
```

If any critical issues, list them with fix suggestions.

## Evidence Gate

Before writing any line of the report above, run each claim through this gate:

1. **IDENTIFY** the exact command that proves the claim (e.g. `npm run build`, `tsc --noEmit`).
2. **RUN** it fresh and in full this session. Output from an earlier run does not count.
3. **READ** the whole output and the exit code, not just the last line.
4. **VERIFY** the output actually supports the verdict before you write it.

If you have not run the command in this session, you cannot report its status. Leave it FAIL/unknown, not OK.

## Claim vs. Evidence

Each row of the verdict needs specific evidence. The right column lists what does NOT close the check, so do not accept it as proof.

| Claim | Requires | Not sufficient |
|-------|----------|----------------|
| Build OK | Fresh build command run, exit 0, no errors in output | "It compiled last time", "types are fine so build is fine" |
| Types OK | Type checker run on changed files, 0 errors printed | Build passing (build may skip strict type check), "looks typed correctly" |
| Lint OK | Linter run this session, 0 errors (warnings noted) | Types passing, "I did not touch style" |
| Tests X/Y | Full test command run fresh, actual pass/fail count read | "should pass now", "the change is small", a subset run, remembered counts |
| Coverage Z% | Coverage reporter run, number read from its output | Test count alone, an estimate |
| Secrets OK | Grep/scan run over changed files this session | "I would not commit a secret" |
| Ready for PR | Every row above is OK from fresh evidence | Any single green check standing in for the rest |

A green check on one line never implies another. Build passing does not prove types; types passing does not prove tests.

<!-- Claim/evidence gate distilled from obra/superpowers verification-before-completion, 2026-07-14 -->

## Arguments

$ARGUMENTS can be:
- `quick` - Only build + types
- `full` - All checks (default)
- `pre-commit` - Checks relevant for commits
- `pre-pr` - Full checks plus security scan
  - `pre-pr` runs the following in addition to existing checks:
    - `silent-failure-hunter` agent for silent error detection
    - `typescript-reviewer` agent for deep type safety checks (any overuse, unsafe casts, etc.)

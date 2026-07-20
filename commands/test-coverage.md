---
description: Run tests with coverage, find files under the 80% threshold, and generate the missing tests.
---

# Test Coverage

Analyze test coverage and generate missing tests:

1. Run tests with coverage: npm test --coverage or pnpm test --coverage

2. Analyze coverage report (coverage/coverage-summary.json)

3. Identify files below 80% coverage threshold

4. For each under-covered file:
   - Analyze untested code paths
   - Generate unit tests for functions
   - Generate integration tests for APIs
   - Generate E2E tests for critical flows

5. Verify new tests pass

6. Show before/after coverage metrics

7. Ensure project reaches 80%+ overall coverage

Focus on:
- Happy path scenarios
- Error handling
- Edge cases (null, undefined, empty)
- Boundary conditions

## Enhanced Options

### silent-failure-hunter Integration
When low-coverage areas are around error handling:
- Use the `silent-failure-hunter` agent to evaluate insufficient testing of error paths
- Prioritize where tests are truly needed, not just based on coverage numbers

### eval-harness Integration
With the `--eval` flag, record test coverage results in eval format:
- Track coverage changes over time
- Automate regression detection

---
name: debugging
description: 'Debug and fix failures across the stack: CI pipeline failures, distributed Lambda/SQS system failures, bug reports and code defects, and dev environment issues. Covers evidence-first methodology, root-cause analysis, and environment troubleshooting.'
---

# Skill: Debugging

## Overview

Unified debugging skill for the Legacy Sports monorepo. Covers CI failures, distributed system failures, bug reports, and dev environment issues. All debugging follows the same core methodology: gather evidence first, find the root cause, fix the code — never patch symptoms.

## When to Use

- **CI pipeline failure** — GitHub Actions run failed on a PR, branch, or merge queue
- **Distributed system failure** — Draft stuck, stats not loading, SQS dead-letter messages, Lambda errors, cron jobs not firing
- **Bug report / code defect** — Error logs, exceptions being swallowed, incorrect behavior reported by users
- **Dev environment issue** — Module not found, DB connection failures, port conflicts, Nx cache corruption, file locks

## Core Methodology

1. **Gather evidence** — read logs, error messages, stack traces. Never guess at the problem.
2. **Reproduce the bug** — observe the broken behavior before writing any fix. If you can't show it's broken, you can't prove it's fixed. See [Verification by Bug Type](#verification-by-bug-type) for how to reproduce each category.
3. **Plan the fix** — after reproduction and before writing code, run the [planning skill](../planning/SKILL.md). Risk is especially important for bugs: UI/visual bugs are typically Low risk, resolver/logic bugs are Medium, distributed system bugs are High (cross-service impact), and data/query bugs are Medium-High (data integrity). The planning phase prevents "fix the symptom, miss the cause" patterns.
4. **Fix the code** — address the defect that produced the bad state. Data recovery is a separate step, not the fix.
5. **Verify the fix** — re-run the exact reproduction scenario from step 2 and confirm the broken behavior is gone. This is not optional — `make pc` passing is necessary but not sufficient. You must demonstrate the specific reported behavior is resolved.

## Verification by Bug Type

Every bug fix requires verification that matches the bug's category. Choose the method based on where the bug manifests:

| Bug category                                  | Typical Risk | Reproduce (before fix)                                                                                                                                                                               | Verify (after fix)                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI / visual**                               | Low          | `browser_dev_start` → `browser_navigate` → `browser_screenshot(name: "bug-before")`                                                                                                                  | Same navigation → `browser_screenshot(name: "bug-after")` → confirm broken behavior is gone. Upload both to PR body.                                                                                                                                             |
| **Resolver / logic**                          | Medium       | Write a failing test that exercises the broken code path (unit or DB integration test in `lambdas/db/**/*.integration.spec.ts`)                                                                      | Run the test — it must pass after the fix. The test stays as regression coverage.                                                                                                                                                                                |
| **Distributed system** (Lambda / SQS / async) | High         | Write or extend a Playwright integration test (`apps/web-e2e/src/integration/tests/`) that triggers the flow and asserts the broken state, OR use `aws_logs_tail` to capture the error in CloudWatch | Run the integration test — the flow must complete successfully. For async flows, use `expect.poll()` or `waitForStatsLoaded` helpers to confirm end-state. If reproduction used `aws_logs_tail`, re-check CloudWatch logs to confirm the error no longer occurs. |
| **Data / query**                              | Medium-High  | Use `db_query` to demonstrate the incorrect data or query result                                                                                                                                     | Re-run the same query after the fix — results must be correct.                                                                                                                                                                                                   |

**Mixed bugs** (e.g., UI caused by a resolver issue) require verification at the layer where the user experiences the bug — if the user sees a broken UI, screenshot verification is required even if the root cause is in a resolver.

> **If reproduction is not possible** (environment-specific, requires production data, mobile-only): document why in the PR body under a `## Verification` section (appended after the standard PR body template from [create-pr.md](../pr-lifecycle/references/create-pr.md)), explain what alternative evidence you gathered (logs, code analysis), and add a regression test that covers the code path even if it can't reproduce the exact user scenario. The `## Verification` section is recommended for bug-fix PRs but is not part of the standard PR template -- add it manually when needed.

## Critical Rules

- **Precondition for closing a bug: the code path that produced the bad state is fixed.** Direct DB corrections are a recovery step that runs _alongside_ the fix; on their own they leave the defect free to produce the same bad state again, repeating the patch — often at 2 AM.
- **Precondition for any fix that touches error reporting: the LOGGER.error / Sentry / catch-block path still surfaces future occurrences.** Removing the log, swallowing the exception in a bare `catch`, or filtering it from Sentry hides the symptom while leaving the defect running, so the next occurrence is invisible and the eventual fix takes longer to find.
- **Every `catch` must re-throw, log, or return a meaningful error.** Empty catch blocks and demoted log levels make future debugging impossible.
- **Precondition for `@ts-ignore` / `eslint-disable`: a separate ticket documents why the types or code cannot be fixed.** Suppression as a debugging shortcut converts a typed bug into an untyped one and removes the lint signal that catches the next regression.
- **Precondition for writing a fix: cite the specific error message, file path, and line number.** If you cannot, return to evidence-gathering before editing code.

## Decision Tree

```
What type of failure are you debugging?
│
├── CI pipeline failure (GitHub Actions)
│   → Run `make ci-classify-failure LOG="<error text>"` first (auto-classifies 15+ patterns)
│   → If unclassified: Load references/ci-failure.md
│   → Advanced: references/ci-pipeline-architecture.md, references/ci-troubleshooting-advanced.md
│
├── Distributed system failure (Lambda / SQS / EventBridge / WebSocket)
│   → Load references/distributed-debugging.md
│   → Scenarios: references/common-failure-scenarios.md
│   → Test stdout is opaque (n/a, stuck, timeout, silent count mismatch): cloudwatch-archaeology
│
├── Bug report / code defect (exceptions, incorrect behavior, error handling)
│   → Load references/bug-fixing.md
│
└── Dev environment issue (module errors, DB, ports, Nx cache, file locks)
    → Load references/environment-troubleshooting.md
```

## Quick Reference: Error Classification

| Situation                              | Level   | Report to Sentry? | Action                    |
| -------------------------------------- | ------- | ----------------- | ------------------------- |
| Unexpected exception / unhandled state | `error` | Yes               | Fix the root cause        |
| Client-facing code (auth, validation)  | `warn`  | No                | Return structured error   |
| Transient failure, will retry          | `warn`  | No                | Retry with backoff        |
| User input validation failure          | `warn`  | No                | Return validation message |

## Anti-Patterns

| Anti-Pattern                                   | Do This Instead                               |
| ---------------------------------------------- | --------------------------------------------- |
| `UPDATE table SET status = ...` as the fix     | Fix the code, then reset as recovery          |
| Removing `LOGGER.error()` to reduce noise      | Fix the code so the error doesn't occur       |
| Empty `catch {}` blocks                        | Log and re-throw, or handle specifically      |
| Demoting `.error()` to `.warn()` without cause | Only demote if user-input or transient        |
| `@ts-ignore` / `eslint-disable`                | Fix the types or the code                     |
| Guessing at the problem without logs           | Fetch logs, cite the exact error, then act    |
| Fixing only the Lambda that errored            | Trace the full chain — upstream may be broken |

## Related Skills

`planning` · `fix-lint` · `fix-types` · `standards` · `cloudwatch-archaeology` · `database` · `architecture` · `deploy-lambda`

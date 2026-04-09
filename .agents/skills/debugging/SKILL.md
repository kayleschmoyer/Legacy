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

- **Never patch database state as the fix.** Always find and fix the code path that produced the bad state. DB corrections are a temporary recovery step, not a resolution. **Why**: the defect will produce more bad state, and the patch has to be repeated — often at 2 AM.
- **Never silence error reporting to fix a bug.** Removing `LOGGER.error()`, swallowing exceptions in bare `catch` blocks, or filtering errors from Sentry hides the symptom — the defect still runs. **Why**: the next occurrence will be invisible, making the eventual fix harder to find.
- **Every `catch` must re-throw, log, or return a meaningful error.** Empty catch blocks and demoted log levels make future debugging impossible.
- **Never use `@ts-ignore` or `eslint-disable`** to work around a bug — fix the types or the code.
- **Evidence before action.** If you cannot cite the specific error message, file path, and line number — go back and get more logs.

## Decision Tree

```
What type of failure are you debugging?
│
├── CI pipeline failure (GitHub Actions)
│   → Load references/ci-failure.md
│   → Advanced: references/ci-pipeline-architecture.md, references/ci-troubleshooting-advanced.md
│
├── Distributed system failure (Lambda / SQS / EventBridge / WebSocket)
│   → Load references/distributed-debugging.md
│   → Scenarios: references/common-failure-scenarios.md
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

`planning` · `fix-lint` · `fix-types` · `standards` · `cloudwatch-logs` · `database` · `architecture` · `deploy-lambda`

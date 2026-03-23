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
2. **Identify the root cause** — trace the failure to its origin. Upstream issues cause downstream symptoms.
3. **Fix the code** — address the defect that produced the bad state. Data recovery is a separate step, not the fix.
4. **Verify the fix** — reproduce locally, run `make pc`, confirm the failure no longer occurs.

## Critical Rules

- **Never patch database state as the fix.** Always find and fix the code path that produced the bad state. DB corrections are a temporary recovery step, not a resolution.
- **Never silence error reporting to fix a bug.** Removing `LOGGER.error()`, swallowing exceptions in bare `catch` blocks, or filtering errors from Sentry hides the symptom — the defect still runs.
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

`fix-lint` · `fix-types` · `standards` · `cloudwatch-logs` · `database` · `architecture` · `deploy-lambda`

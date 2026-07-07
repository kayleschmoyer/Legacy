---
name: debugging
description: 'Debug and fix failures across the stack. Load when: a CI pipeline run fails, a PR is stuck at a merge gate, a distributed Lambda/SQS flow breaks, a production error appears in Rollbar, a bug is reported, or the dev environment misbehaves. Covers evidence-first methodology, root-cause analysis, and symptom-based routing to the right reference.'
metadata:
  scope: '**'
---

# Skill: Debugging

## Overview

Unified debugging skill for the Legacy Sports monorepo. Covers CI failures, distributed system failures, bug reports, and dev environment issues. All debugging follows the same core methodology: gather evidence first, find the root cause, fix the code — never patch symptoms.

## When to Use

- **CI pipeline failure** — GitHub Actions run failed on a PR, branch, or merge queue
- **Stuck PR** — CI is green (or absent) but the PR won't merge
- **Distributed system failure** — Draft stuck, stats not loading, SQS dead-letter messages, Lambda errors, cron jobs not firing
- **Production error** — Rollbar item, user-reported crash, or error spike in a deployed environment
- **Bug report / code defect** — Error logs, exceptions being swallowed, incorrect behavior reported by users
- **Dev environment issue** — Module not found, DB connection failures, port conflicts, Nx cache corruption, file locks

## Core Methodology

1. **Gather evidence** — read logs, error messages, stack traces. Never guess at the problem. Before deep-diving, check [failure-archaeology](../failure-archaeology/SKILL.md) for prior art on the failure class — and heed its shallow-clone warning before trusting `git log`/`git blame`.
2. **Reproduce the bug** — observe the broken behavior before writing any fix. If you can't show it's broken, you can't prove it's fixed. See [Verification by Bug Type](#verification-by-bug-type) for how to reproduce each category.
3. **Plan the fix** — after reproduction and before writing code, run the [planning reference](../plan-ticket/references/planning.md). Risk is especially important for bugs: UI/visual bugs are typically Low risk, resolver/logic bugs are Medium, distributed system bugs are High (cross-service impact), and data/query bugs are Medium-High (data integrity). The planning phase prevents "fix the symptom, miss the cause" patterns.
4. **Fix the code** — address the defect that produced the bad state. Data recovery is a separate step, not the fix.
5. **Verify the fix** — re-run the exact reproduction scenario from step 2 and confirm the broken behavior is gone. This is not optional — `make pc` passing is necessary but not sufficient. You must demonstrate the specific reported behavior is resolved.

## Verification by Bug Type

Every bug fix requires verification that matches the bug's category. Choose the method based on where the bug manifests:

| Bug category                                  | Typical Risk | Reproduce (before fix)                                                                                                                                                                               | Verify (after fix)                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI / visual**                               | Low          | `browser_dev_start` → `browser_navigate` → `browser_screenshot(name: "bug-before")`                                                                                                                  | Same navigation → `browser_screenshot(name: "bug-after")` → confirm broken behavior is gone. Upload both to PR body.                                                                                                                                             |
| **Resolver / logic**                          | Medium       | Write a failing test that exercises the broken code path (unit spec, or a DB spec named `*.db.spec.ts` under `lambdas/db/src/` — see [testing](../testing/SKILL.md) for the runner setup)            | Run the test — it must pass after the fix. The test stays as regression coverage.                                                                                                                                                                                |
| **Distributed system** (Lambda / SQS / async) | High         | Write or extend a Playwright integration test (`apps/web-e2e/src/integration/tests/`) that triggers the flow and asserts the broken state, OR use `aws_logs_tail` to capture the error in CloudWatch | Run the integration test — the flow must complete successfully. For async flows, use `expect.poll()` or `waitForStatsLoaded` helpers to confirm end-state. If reproduction used `aws_logs_tail`, re-check CloudWatch logs to confirm the error no longer occurs. |
| **Data / query**                              | Medium-High  | Use `db_query` to demonstrate the incorrect data or query result                                                                                                                                     | Re-run the same query after the fix — results must be correct.                                                                                                                                                                                                   |

**Mixed bugs** (e.g., UI caused by a resolver issue) require verification at the layer where the user experiences the bug — if the user sees a broken UI, screenshot verification is required even if the root cause is in a resolver.

> **If reproduction is not possible** (environment-specific, requires production data, mobile-only): document why in the PR body under a `## Verification` section (appended after the standard PR body template from [create-pr.md](../pr-lifecycle/references/create-pr.md)), explain what alternative evidence you gathered (logs, code analysis), and add a regression test that covers the code path even if it can't reproduce the exact user scenario. The `## Verification` section is recommended for bug-fix PRs but is not part of the standard PR template -- add it manually when needed.

## Critical Rules

- **Precondition for closing a bug: the code path that produced the bad state is fixed.** Direct DB corrections are a recovery step that runs _alongside_ the fix; on their own they leave the defect free to produce the same bad state again, repeating the patch — often at 2 AM.
- **Precondition for any fix that touches error reporting: the LOGGER.error / Rollbar / catch-block path still surfaces future occurrences.** Removing the log, swallowing the exception in a bare `catch`, or filtering it from Rollbar hides the symptom while leaving the defect running, so the next occurrence is invisible and the eventual fix takes longer to find.
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
├── Stuck PR (CI green or 'Expected' forever, merge blocked, 405 at merge)
│   → Load ../pr-lifecycle/references/ci-checks-reference.md (the merge-gate home:
│     required contexts, who writes them, per-context debug entry points)
│   → github_pr_why_blocked(prNumber) for a one-shot diagnosis
│
├── Production error (Rollbar item, deployed-code error spike)
│   → Load references/prod-errors.md (Rollbar tools + error-classification convention)
│
├── Distributed system failure (Lambda / SQS / EventBridge / WebSocket)
│   → Load references/distributed-debugging.md
│   → Scenarios: references/common-failure-scenarios.md
│   → Test stdout is opaque (n/a, stuck, timeout, silent count mismatch): cloudwatch-archaeology
│
├── Bug report / code defect (exceptions, incorrect behavior, error handling)
│   → Load references/bug-fixing.md
│
├── Test failure (a *.spec.ts is red — hermetic e2e, integration, or unit)
│   → Hermetic e2e or unit spec: load ../testing/SKILL.md
│   → *.integration.spec.ts (live backend — PR run:integration label OR nightly):
│     load ../nightly-green-campaign/SKILL.md for triage/classification,
│     ../fix-integration-tests/SKILL.md for the fix workflow
│
└── Dev environment issue (module errors, DB, ports, Nx cache, file locks)
    → Load references/environment-troubleshooting.md
```

## Quick Reference: Error Classification

| Situation                              | Level   | Reaches Rollbar? | Action                                                |
| -------------------------------------- | ------- | ---------------- | ----------------------------------------------------- |
| Unexpected exception / unhandled state | `error` | Yes              | Fix the root cause; pass the `Error` object to LOGGER |
| Auth / permission / premium gate       | n/a     | No               | Throw the typed GraphQL error constructor             |
| User input / not-found                 | n/a     | No               | Throw `UserInputError` / `NotFoundError`              |
| Transient failure, will retry          | `warn`  | No               | Retry with backoff                                    |

The full convention (typed constructors, Error-objects-to-LOGGER rule, destination-only capture) lives in [references/prod-errors.md](references/prod-errors.md#error-classification-convention).

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

- [fix-problem](../fix-problem/SKILL.md) — user-reported problem → ticket → fix, end to end
- [failure-archaeology](../failure-archaeology/SKILL.md) — has this failed before? incident index, durable-record map, shallow-clone caveat
- [ground-truth-verification](../ground-truth-verification/SKILL.md) — when observed behavior contradicts a doc, probe the claim first; the doc may be the bug
- [cloudwatch-archaeology](../cloudwatch-archaeology/SKILL.md) — server-side truth when test stdout or Rollbar payloads are opaque
- [pr-lifecycle](../pr-lifecycle/SKILL.md) — merge gates, stuck PRs, review-fix flows
- [testing](../testing/SKILL.md) — writing/running the tests used for reproduction and regression coverage
- [plan-ticket](../plan-ticket/SKILL.md) — the planning reference used in step 3
- [repo-tooling](../repo-tooling/SKILL.md) — lint/typecheck/build fix guidance
- [standards](../standards/SKILL.md) · [database](../database/SKILL.md) · [architecture](../architecture/SKILL.md) · [infrastructure](../infrastructure/SKILL.md)

## Provenance and maintenance

Refreshed 2026-07-02 by the skills audit (debugging-playbook refresh): DB spec naming corrected to `*.db.spec.ts`, stuck-PR and production-error routes added, error classification re-homed to `references/prod-errors.md`. Re-verify volatile facts:

- DB spec naming: `Glob lambdas/db/src/**/*.db.spec.ts`
- Classifier target: `grep -n "ci-classify-failure" Makefile`
- Merge-gate home exists: `ls .agents/skills/pr-lifecycle/references/ci-checks-reference.md`

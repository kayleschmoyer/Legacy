---
name: client-bug-triage
description: 'Autonomously pick up and investigate/fix client-reported bugs from the LS-1322 epic. Lists child tickets, selects the next unblocked To Do, investigates the issue, implements the fix, adds tests, validates, and ships a PR. Load when working through the client bug backlog.'
---

# Skill: Client Bug Triage

## Overview

Pick up and fix client-reported bugs from the **LS-1322** epic ("Client-Reported Bugs"). These bugs are typically reported via the in-app bug report button and contain user-provided descriptions, screenshots, and sometimes device/browser info.

## When to Use

- When the user asks to work on client-reported bugs
- When processing the LS-1322 epic backlog
- When triaging a specific client bug ticket

## Steps

### 1. Find the next ticket

List child tickets of LS-1322 filtered to "To Do":

```
jira_list_children(key: "LS-1322", status: "To Do")
```

Select the first unblocked ticket. Check blockers with `jira_check_blockers`.

### 2. Understand the bug

Read the ticket description thoroughly. Client bug reports typically include:

- **What the user was doing** when the bug occurred
- **What they expected** to happen
- **What actually happened** (the bug)
- **Screenshots or screen recordings** (if available)
- **Device/browser info** (if available)

Also check ticket comments for additional context using `jira_get_comments`.

### 3. Reproduce the bug

**Before investigating code, observe the broken behavior.** This ensures you understand the actual user experience and gives you a baseline to verify against after the fix.

Choose the reproduction method based on bug category:

| Bug category           | How to reproduce                                                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI / visual**        | `browser_dev_start({ worktreePath: $wt })` → `browser_navigate({ url: "/affected-page", port })` → `browser_screenshot({ name: "bug-before" })`. Follow the user's steps from the ticket to trigger the broken state.                                                                                       |
| **Resolver / logic**   | Write a **failing test** that exercises the broken code path — unit test or DB integration test (`lambdas/db/**/*.integration.spec.ts`). The test should assert the expected (correct) behavior and fail against the current code.                                                                          |
| **Distributed system** | Write or extend a Playwright integration test (`apps/web-e2e/src/integration/tests/`) that triggers the async flow and asserts the expected end-state. Use `expect.poll()` or `waitForStatsLoaded` helpers for async processes. Alternatively, use `aws_logs_tail` to capture the error in CloudWatch logs. |
| **Data / query**       | Use `db_query` to demonstrate the incorrect data or query result. Save the output for comparison after the fix.                                                                                                                                                                                             |

> **If reproduction is not possible** (environment-specific, production data required, mobile-only): document why in the PR body under a `## Verification` section and add a regression test covering the code path.

### 4. Investigate the root cause

#### Start with the UI layer

1. Search for the component or page mentioned in the bug report
2. Trace the user interaction path from the UI through to the data layer
3. Check for recent changes in the area using `git log -- <path>`

#### Check the GraphQL layer

1. Find the relevant query/mutation in `.graphql` files or inline `gql` usage
2. Check the resolver in `lambdas/db/src/`
3. Look for error handling gaps, null checks, or race conditions

#### Check the database layer

1. Use `db_query` to inspect relevant data if needed
2. Check Drizzle schema in `lib/db-client/` for constraint issues
3. Look at recent migrations that may have affected the area

#### Check logs

1. Use `aws_logs_tail` for CloudWatch logs if the error is backend
2. Check Rollbar/Sentry for related error reports

### 5. Implement the fix

Follow the [fix-bugs skill](../../debugging/references/bug-fixing.md) principles:

- **Fix the root cause**, not the symptom
- **Never silence error reporting** to make a bug "go away"
- **Add appropriate null guards** where data can legitimately be missing
- **Fix race conditions** with proper locking or sequencing

### 6. Verify the fix

**Re-run the exact reproduction scenario from step 3.** The broken behavior must be gone.

| Bug category           | How to verify                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI / visual**        | `browser_navigate` to the same page → `browser_screenshot(name: "bug-after")` → confirm the broken behavior is resolved. Upload before/after screenshots via `browser_screenshot_upload()` — these go in the PR body.                           |
| **Resolver / logic**   | Run the failing test from step 3 — it must now pass. The test stays as permanent regression coverage.                                                                                                                                           |
| **Distributed system** | Run the integration test — the async flow must complete successfully. For multi-step flows, verify each phase reaches the expected state. If reproduction used `aws_logs_tail`, re-check CloudWatch logs to confirm the error no longer occurs. |
| **Data / query**       | Re-run the same `db_query` — results must be correct.                                                                                                                                                                                           |

**Mixed bugs** (e.g., UI caused by a resolver issue): verify at the layer the user experiences — if the ticket reports broken UI, screenshot verification is required even if the root cause was in a resolver.

> This step is **not optional**. `make pc` passing proves the code compiles and existing tests pass — it does not prove the reported bug is fixed.

### 7. Add test coverage

- The reproduction test from step 3 may already serve as regression coverage — keep it.
- Add additional unit tests for edge cases discovered during investigation.
- For UI bugs, add a mocked E2E test case if one doesn't exist. E2E tests must be hermetic: use `route.fulfill()`, never `route.continue()`.
- For distributed system bugs, ensure the integration test covers the full async chain (trigger → process → verify end-state).

### 8. Validate

1. Run `make pc` — must pass before pushing
2. Run targeted tests: `pnpm exec nx run <project>:test -- --testPathPattern=<file>`
3. If E2E tests were changed: `pnpm exec nx run web-e2e:integration -- --grep "<test name>"`

### 9. Ship

Follow the standard workflow:

1. Commit with conventional message: `fix(scope): description`
2. Push with `--force-with-lease`
3. Create PR as draft with `github_create_pr({ draft: true })`, then mark ready with `github_mark_pr_ready` — include a `## Verification` section in the PR body with before/after evidence (screenshots, test output, or query results)
4. Transition Jira ticket to "In Review"

## Gotchas

- **Don't assume the user is wrong** — client bug reports describe real user experiences. Even if you can't reproduce, the bug may be environment-specific.
- **Check for related bugs** — similar symptoms may have a shared root cause. Search the epic for related tickets before creating a narrow fix.
- **Platform differences** — the app runs on React Native (iOS/Android) and Next.js (web). A bug on one platform may not exist on others. Check `lib/shared-components/src/platform-components/` for platform-specific code.
- **Don't fix unrelated code** — stick to the bug. If you find other issues, create separate tickets.

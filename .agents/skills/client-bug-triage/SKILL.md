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

### 3. Investigate the root cause

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

### 4. Implement the fix

Follow the [fix-bugs skill](../fix-bugs/SKILL.md) principles:

- **Fix the root cause**, not the symptom
- **Never silence error reporting** to make a bug "go away"
- **Add appropriate null guards** where data can legitimately be missing
- **Fix race conditions** with proper locking or sequencing

### 5. Add test coverage

- Add unit tests for the specific bug scenario if not already covered
- If the bug is in a UI component, consider adding an E2E test case
- E2E tests must be hermetic: use `route.fulfill()`, never `route.continue()`

### 6. Validate

1. Run `make pc` — must pass before pushing
2. Run targeted tests: `pnpm exec nx run <project>:test -- --testPathPattern=<file>`
3. If E2E tests were changed: `pnpm exec nx run web-e2e:integration -- --grep "<test name>"`

### 7. Ship

Follow the standard workflow:

1. Commit with conventional message: `fix(scope): description`
2. Push with `--force-with-lease`
3. Create PR with `gh pr create` or `github_create_pr`
4. Transition Jira ticket to "In Review"

## Gotchas

- **Don't assume the user is wrong** — client bug reports describe real user experiences. Even if you can't reproduce, the bug may be environment-specific.
- **Check for related bugs** — similar symptoms may have a shared root cause. Search the epic for related tickets before creating a narrow fix.
- **Platform differences** — the app runs on React Native (iOS/Android) and Next.js (web). A bug on one platform may not exist on others. Check `lib/shared-components/src/platform-components/` for platform-specific code.
- **Don't fix unrelated code** — stick to the bug. If you find other issues, create separate tickets.

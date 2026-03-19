---
name: review
description: 'Self-review branch changes before committing or pushing. Diffs the working branch against its parent, checks for project rule violations (console.*, @ts-ignore, eslint-disable, inline gql, missing LOGGER), reviews code quality, reuse, and efficiency, then fixes issues found. Use when: "/review", "review my changes", "check my code before commit", or between implementing and committing.'
---

# Skill: Review Branch Changes

## Overview

Run a structured self-review of all changes on the current branch before committing or pushing. This catches project-rule violations, code-quality issues, and missed reuse opportunities that `make pc` (lint/typecheck/test/build) does not cover — it focuses on **semantic** review, not mechanical validation.

## When to Use

- After implementing a ticket, before `git commit` / `git push`
- When the user says "/review", "review my changes", "self-review", or "check before commit"
- As Step 5b in the [worktree-workflow](../worktree-workflow/SKILL.md) (between implementation and commit)

## Prerequisites

- You are in a worktree (or feature branch) with uncommitted or committed-but-not-pushed changes
- The branch has a clear parent (usually `origin/main` or a stacked parent branch)

## Steps

### 1. Gather the Diff

Get all changes on the branch vs. its parent. Include both staged/unstaged and already-committed changes:

```bash
# Uncommitted changes (staged + unstaged)
git diff HEAD

# All commits on the branch vs. main
git diff origin/main...HEAD
```

If the branch is stacked on another branch, diff against that parent instead of `origin/main`.

### 2. Read Changed Files in Full

For every file with non-trivial changes, read the **full current file** (not just the diff hunk). Reviewing hunks in isolation misses context — you need to see how the change fits into the surrounding code.

### 3. Check Project Rules

Scan all changed files for violations of the rules in `AGENTS.md`. Flag and fix:

| Rule                            | What to look for                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No `console.*`**              | `console.log`, `console.warn`, `console.error`, `console.debug` — replace with `LOGGER` from `@legacy-sports/logging`. Exceptions: `lib/logging/`, `apps/cli/`, migration files, build-time scripts.                                |
| **No suppression**              | `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `eslint-disable-next-line` — generally fix the root cause instead; see [no-lint-disable](../no-lint-disable/SKILL.md) for allowed exceptions and required justification format. |
| **Prefer `.graphql` + codegen** | New queries in `apps/web` or `lib/shared-components` should use `.graphql` files, not inline `gql` template literals.                                                                                                               |
| **LOGGER usage**                | Error logging should pass the Error object directly: `LOGGER.error(error)` not `LOGGER.error({ error })` or `LOGGER.error(error.message)`.                                                                                          |
| **No `route.continue()`**       | E2E tests must use `route.fulfill()` — there is no backend in CI.                                                                                                                                                                   |
| **Commit message format**       | `type(scope): message` — verify any existing commits on the branch follow this pattern.                                                                                                                                             |

### 4. Code Quality Review

Review each changed file for:

- **Dead code**: Unused imports, unreachable branches, commented-out code, unused variables/functions
- **Duplication**: Code that duplicates existing utilities in `lib/utils`, `lib/api`, or sibling files
- **Complexity**: Deeply nested conditionals, long functions (>50 lines), unclear variable names
- **Type safety**: Loose `any` types, missing null checks, unsafe type assertions (`as unknown as X`)
- **Error handling**: Swallowed errors (empty catch blocks), missing error boundaries, unhandled promise rejections
- **Security**: Unsanitized user input, hardcoded secrets, SQL injection vectors, XSS-prone patterns

### 5. Reuse & Efficiency

Check whether the changes could leverage existing code:

- Are there existing shared components in `lib/shared-components` that do what new code is doing?
- Are there existing utility functions in `lib/utils` or `lib/api` that are being reimplemented?
- Could new shared logic be extracted to a library for reuse?
- Are there N+1 query patterns or unnecessary re-renders?

### 6. Report & Fix

For each issue found:

1. **Classify**: rule-violation | quality | reuse | efficiency
2. **Fix it** — don't just report, apply the fix directly
3. **If a fix is ambiguous or risky**, explain the tradeoff and ask the user before applying

After all fixes are applied, give a brief summary:

- Number of issues found and fixed (by category)
- Any items that need user input
- Confirmation that the code is ready for `git commit`

## What This Skill Does NOT Cover

- **Mechanical validation** (`make pc`) — lint, typecheck, test, build are separate steps
- **E2E test review** — see [e2e-testing skill](../e2e-testing/SKILL.md)
- **PR-level review** — this is pre-commit self-review, not post-PR Copilot review (see [fix-copilot-reviews](../fix-copilot-reviews/SKILL.md))

## Related Skills

- [worktree-workflow](../worktree-workflow/SKILL.md) — the full ticket workflow (review fits as Step 5b)
- [fix-lint](../fix-lint/SKILL.md) — ESLint-specific fixes
- [fix-types](../fix-types/SKILL.md) — TypeScript error fixes
- [fix-bugs](../fix-bugs/SKILL.md) — root cause analysis patterns

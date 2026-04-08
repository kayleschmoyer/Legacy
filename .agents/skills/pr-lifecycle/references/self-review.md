---
name: review
description: 'Self-review all code changes on the current branch before committing. Load when the user says "review", "check my changes", or before creating a PR.'
---

# Skill: Self-Review

You are a **code reviewer** for this project. Your job is to read all changes on the current branch, check them against project rules, identify issues, and fix them directly. Be thorough but practical — focus on issues that would fail CI or cause bugs, not style preferences.

## Steps (chain-of-thought)

1. **Gather the diff**

   ```
   git diff origin/main...HEAD --stat
   git diff origin/main...HEAD
   ```

2. **Read changed files in full** — not just diff hunks. Context matters for identifying dead code, missing imports, and type mismatches.

3. **Check project rules** (each is a hard failure):
   - No `console.*` — use `LOGGER` from `@legacy-sports/logging`
   - No `@ts-ignore` or `eslint-disable` — fix root causes
   - No `route.continue()` in E2E tests — use `route.fulfill()`
   - Prefer `.graphql` + codegen over inline `gql` in `apps/web` and `lib/shared-components`
   - **Bug-fix proof required** — if the branch name contains `fix(` or any commit uses the `fix` type, verify that before/after evidence has been collected (screenshots captured, failing test written, query results saved). If no evidence exists yet, flag this as a hard failure — the agent must collect it before proceeding to PR creation. See [bug-verification-templates.md](bug-verification-templates.md) for the required format.

4. **Code quality scan**:
   - Dead code or unused imports
   - Duplicated logic that could use an existing utility
   - Type safety gaps (any casts, missing null checks)
   - Security issues (unsanitized input, injection vectors)
   - **Input validation edge cases** — for any numeric inputs (counts, limits, indices): what happens at 0, negative, or larger-than-expected values? Missing guards here are the most common Copilot round-2 finding.
   - **Async log placement** — watch for `LOGGER.info/warn/error` calls that imply an async operation succeeded or completed before its result is known, especially inside a `db.transaction()` callback where the callback runs before the transaction commits. Success/completion logs should be emitted only after the awaited operation resolves and, for transactions, after the transaction promise completes.
   - **Stale inline comments** — after renaming a function, changing behavior, or refactoring, scan for comments that describe the old behavior. Stale comments are a consistent Copilot round-2 finding.
   - **Behavior-change documentation** — if a fix changes observable behavior (navigation, error messages, API responses), verify the PR description and any inline comments accurately describe the new behavior, not the old one.

5. **Reuse check**: Could any new component use existing ones from `lib/shared-components`? Any new utility that duplicates `lib/utils`?

6. **Fix issues directly** — apply fixes in the working tree, don't just report them. If a fix is ambiguous, explain the tradeoff and pick the safer option.

## Output

After reviewing, produce a brief summary:

- Issues found and fixed (with file:line references)
- Issues that need human decision (if any)
- "No issues found" if the code is clean

## Guardrails

- **Never** add `@ts-ignore` or `eslint-disable` to suppress issues
- **Never** skip reading the full file — diff-only reviews miss context bugs
- **Never** refactor code unrelated to the branch's changes
- If you're unsure whether something is a bug, flag it — don't silently skip it

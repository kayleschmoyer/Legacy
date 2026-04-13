---
name: review
description: 'Self-review all code changes on the current branch before pushing. This is a MANDATORY quality gate (Tier 2) — never push without completing it. Load when the user says "review", "check my changes", or before creating a PR.'
---

# Skill: Self-Review

You are a **code reviewer** for this project. Your job is to read all changes on the current branch, check them against project rules and known Copilot review patterns, identify issues, and fix them directly.

> **This is a mandatory gate.** Do NOT push until self-review is complete. Every issue you miss here becomes a Copilot review comment that costs 30–60 min to fix in a review round-trip. Thoroughness here directly eliminates review cycles.

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

6. **Check against [common review patterns](common-review-patterns.md) (MANDATORY)** — open `common-review-patterns.md` and walk through **every pattern (#1–#20)**. For each pattern, ask: "Does my diff contain code that matches this anti-pattern?" This is not a skim — read each pattern description and actively search your changed files for matches. The top patterns that cause review round-trips:
   - **#1**: `jest.doMock` targeting wrong module path (`@legacy-sports/utils` vs `@legacy-sports/utils/node`)
   - **#2**: Broad `postData.includes()` matching (use quoted `'"operationName"'` or `extractOperationName()`)
   - **#3**: Header comment overclaiming test coverage
   - **#4**: Missing UNAUTHENTICATED guard test for resolvers
   - **#5**: `route.fallback()`/`route.continue()` leaking to real network in E2E
   - **#6**: `LOGGER.error({ error })` wrapping — Rollbar needs `LOGGER.error('msg', error)`
   - **#7**: `data: null` mock response — Apollo expects `{ data: { queryName: ... } }`
   - **#8**: Wrong GraphQL field names in mocks (check actual `.graphql` files)
   - **#11**: Silent error swallowing in catch blocks
   - **#12**: Argument injection via refs/args starting with `-`
   - **#14**: `shell: true` with user input
   - **#19**: Dev/prod ternary that forgets staging
   - **#20**: Unbounded tool output without truncation

7. **Fix issues directly** — apply fixes in the working tree, don't just report them. If a fix is ambiguous, explain the tradeoff and pick the safer option.

## Output (required before pushing)

After reviewing, produce a structured summary. This summary is your proof that self-review was thorough — not a formality.

```
## Self-Review Summary
- **Files reviewed**: <list of files read in full>
- **Common patterns checked**: #1–#20 (list any that matched and were fixed)
- **Project rule violations**: <list, or "None">
- **Code quality issues fixed**: <list with file:line, or "None">
- **Issues needing human decision**: <list, or "None">
```

If the summary is empty or says only "No issues found" without listing the files reviewed, the self-review was not thorough enough — go back and read the files.

## Guardrails

- **Never** add `@ts-ignore` or `eslint-disable` to suppress issues
- **Never** skip reading the full file — diff-only reviews miss context bugs
- **Never** refactor code unrelated to the branch's changes
- If you're unsure whether something is a bug, flag it — don't silently skip it

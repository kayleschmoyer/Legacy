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

4. **Code quality scan**:
   - Dead code or unused imports
   - Duplicated logic that could use an existing utility
   - Type safety gaps (any casts, missing null checks)
   - Security issues (unsanitized input, injection vectors)

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

> Full details: [../pr-workflow/SKILL.md](../pr-workflow/SKILL.md)

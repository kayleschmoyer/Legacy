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

2. **Run mechanical review checks** (automated — catches 19 of 28 patterns):

   ```bash
   make lint-review-patterns
   # or: node scripts/lint-review-patterns.js --json  (for structured output)
   ```

   This script checks for console.\*, @ts-ignore, eslint-disable, route.continue(), LOGGER.error wrapping, empty catch blocks, git ref injection, shell:true, any types, hardcoded localhost, inline gql, dev/prod ternaries, unbounded output, plus UI patterns: role=button without tabIndex (#22), transition:all (#24), inline hex colors (#25), plain Error in GraphQL resolvers (#26), and localStorage writes (#27). This covers 18 of 28 patterns from `common-review-patterns.md`. Fix any violations it reports before proceeding.

3. **Read changed files in full** — not just diff hunks. Context matters for identifying dead code, missing imports, and type mismatches.

4. **Check project rules** (each is a hard failure — most are now caught by `make lint-review-patterns` above, but verify these specifically):
   - No `console.*` — use `LOGGER` from `@legacy-sports/logging`
   - No `@ts-ignore` or `eslint-disable` — fix root causes
   - No `route.continue()` in E2E tests — use `route.fulfill()`
   - Prefer `.graphql` + codegen over inline `gql` in `apps/web` and `lib/shared-components`
   - **Bug-fix proof required** — if the branch name contains `fix(` or any commit uses the `fix` type, verify that before/after evidence has been collected (screenshots captured, failing test written, query results saved). If no evidence exists yet, flag this as a hard failure — the agent must collect it before proceeding to PR creation. See [bug-verification-templates.md](bug-verification-templates.md) for the required format.
   - **Playwright report required for E2E/integration changes** — if the diff touches any file under `apps/web-e2e/src/` or any `apps/web-e2e/playwright*.config.ts`, a passing Playwright report covering the touched specs is required before the PR can land. The integration suite does **not** run on PRs (only nightly + manual dispatch), so the report must come from one of:
     1. **Manual workflow dispatch** — trigger `run-playwright-tests.yml` against the PR branch (`gh workflow run run-playwright-tests.yml --ref <branch> -f test-suite=<e2e|integration> -f test-file=<changed.spec.ts>`) and wait for the deployed report URL printed in the run summary (`https://bkrupa.github.io/legacy-sports-deploys/playwright-report/manual-<run_number>/`).
     2. **Local run** — `pnpm exec playwright test --config=apps/web-e2e/playwright.config.ts <changed-files>` (or `playwright.integration.config.ts` for integration specs), then `pnpm exec playwright show-report` to confirm. Capture the local HTML report path or a screenshot of the green summary.
        Paste the report URL (or local-run evidence) into the PR body under a `## Playwright Evidence` section before marking the PR ready for review. If the report shows any failures in the touched specs, this is a hard failure — fix the tests or the code under test and re-run until green.

5. **Code quality scan**:
   - Dead code or unused imports
   - Duplicated logic that could use an existing utility
   - Type safety gaps (any casts, missing null checks)
   - Security issues (unsanitized input, injection vectors)
   - **Input validation edge cases** — for any numeric inputs (counts, limits, indices): what happens at 0, negative, or larger-than-expected values? Missing guards here are the most common Copilot round-2 finding.
   - **Async log placement** — watch for `LOGGER.info/warn/error` calls that imply an async operation succeeded or completed before its result is known, especially inside a `db.transaction()` callback where the callback runs before the transaction commits. Success/completion logs should be emitted only after the awaited operation resolves and, for transactions, after the transaction promise completes.
   - **Stale inline comments** — after renaming a function, changing behavior, or refactoring, scan for comments that describe the old behavior. Stale comments are a consistent Copilot round-2 finding.
   - **Behavior-change documentation** — if a fix changes observable behavior (navigation, error messages, API responses), verify the PR description and any inline comments accurately describe the new behavior, not the old one.

6. **Reuse check**: Could any new component use existing ones from `lib/shared-components`? Any new utility that duplicates `lib/utils`?

7. **Check against [common review patterns](common-review-patterns.md) (judgment-requiring patterns only)** — Step 2's `make lint-review-patterns` already caught the regex-checkable patterns. Now manually check the patterns that require semantic understanding:
   - **#3**: Header comment overclaiming test coverage
   - **#4**: Missing UNAUTHENTICATED guard test for resolvers
   - **#7**: `data: null` mock response — Apollo expects `{ data: { queryName: ... } }`
   - **#8**: Wrong GraphQL field names in mocks (check actual `.graphql` files)
   - **#9**: Test name doesn't match assertion
   - **#21**: Nullable GraphQL field interpolated in strings or `aria-label` — check `.graphql` file: is the field `String!` or `String`? If nullable, add a null guard or fallback
   - **#23**: Collapsed/hidden content — does it use `aria-hidden` and disable `pointerEvents` when hidden? Animating height/opacity alone leaves content in the tab order
   - **#28**: Unsafe `as 'literal-union'` cast on GraphQL args or external data — should be a type guard with an allowed-values array

8. **Fix issues directly** — apply fixes in the working tree, don't just report them. If a fix is ambiguous, explain the tradeoff and pick the safer option.

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

## ⛔ After the Summary — Do NOT Stop Here

**Producing the Self-Review Summary is NOT the end of the task.** This skill is a gate, not a destination. The summary is your proof that the gate was passed; it is not a completion signal.

If you arrived here from `/work-ticket`, `/fix-pr`, `/drive-pr`, `/sweep-prs`, `/respond-to-review`, or any other workflow that opens or updates a PR, the **next mandatory action** after the summary is to return to that workflow and continue from where you left off. For a fresh ticket implementation that means, in order:

1. `worktree_commit({ message: "type(scope): LS-#### msg" })` (if there are unstaged review fixes)
2. `worktree_push({ setUpstream: true })` (first push) or `worktree_push()` (subsequent pushes)
3. `github_create_pr({ title: "LS-#### type(scope): msg", body: "...", draft: true, head: <branch-name> })`
4. `github_manage_labels({ prs: [<PR#>], add: ["agent-in-progress"] })`
5. `github_mark_pr_ready({ number: <PR#> })`
6. `github_request_review({ prs: [<PR#>] })`
7. `jira_transition({ key: "LS-####", status: "In Review" })`
8. Watch the PR through to merge — prefer native PR-event subscriptions / push notifications when the harness streams them (Claude Code on the desktop and web); fall back to a capped, explicit degraded-mode poll only when subscriptions are unavailable (e.g. some headless cloud sessions). The hard prohibition is on **unbounded polling loops** (`sleep N && gh pr view ...` repeated indefinitely, or one-shot snapshot tools called in a loop) — see the `pr-lifecycle` skill's CI-operations guidance.

**A clean Self-Review Summary with "no issues found" is the most common point at which agents incorrectly conclude the task.** It feels like an ending; it is not. If your todo list still has `commit`, `push`, `create-pr`, `mark-ready`, `watch-pr`, or `merge` items pending, they are still pending — keep going.

The only time it is correct to stop after producing the summary is when `/review` was invoked **standalone** (not as part of a ticket workflow) for the user to inspect the report.

## Guardrails

- **Never** add `@ts-ignore` or `eslint-disable` to suppress issues
- **Never** skip reading the full file — diff-only reviews miss context bugs
- **Never** refactor code unrelated to the branch's changes
- If you're unsure whether something is a bug, flag it — don't silently skip it
- **Never** treat the Self-Review Summary as a stopping point when invoked from a PR-bound workflow — see the section above

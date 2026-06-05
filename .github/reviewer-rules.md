# Reviewer Rules

## Review Philosophy

Be **thorough in a single pass**. Surface all findings in one review rather than trickling comments across multiple rounds. A comprehensive first review is far more valuable than three incremental ones — each round costs CI time and developer context switches.

**A follow-up review from you is a failure mode, not a feature.** If you add comments after a PR is updated with fixes from your previous comments, you have failed to do your job completely the first time.

### Full-Diff-First Protocol

Before writing **any** comment:

1. **Read every file in the diff** — do not comment as you read; complete the full survey first.
2. **Identify cross-file patterns** — the same bug or anti-pattern may appear in multiple files; group these into a single comment with all affected locations noted.
3. **Run the exhaustiveness checklist** (see below) — mentally check each tier before opening a review.
4. **Then write all comments at once** — submit a single comprehensive review, not a stream of incremental observations.

### Pre-Submit Exhaustiveness Checklist

Before submitting your review, confirm you have checked:

- [ ] All Tier 1 categories across every changed file
- [ ] All Tier 2 categories for files with significant logic changes
- [ ] Cross-file concerns: shared state, exported types, GraphQL schema ↔ codegen consistency
- [ ] Async correctness: `await` placement, unhandled rejections, race conditions
- [ ] Test coverage: is changed behavior exercised by a test?
- [ ] Import boundaries: does the change violate Nx module boundaries?

If any box would be unchecked, keep reviewing — do not submit until you have covered everything.

## Priority Tiers

Focus your review budget on high-impact issues. If you must limit comments, prioritize by tier:

### Tier 1 — Must Fix (always comment)

- **Security vulnerabilities**: injection, credential exposure, unsafe deserialization, path traversal, SSRF
- **Data integrity bugs**: race conditions, incorrect mutations, missing transactions, lost updates
- **Logic errors**: wrong boolean conditions, off-by-one, null/undefined dereference, unreachable code
- **Breaking changes**: API contract violations, backwards-incompatible schema changes, removed exports

### Tier 2 — Should Fix (comment if significant)

- **Error handling gaps**: unhandled promise rejections, swallowed errors hiding failures, missing cleanup on error paths
- **Resource leaks**: unclosed handles, missing cleanup (temp files, connections, event listeners)
- **Type safety**: unsafe casts, overly broad types that defeat type checking, missing null checks at system boundaries
- **Test gaps**: changed behavior without corresponding test updates

### Tier 3 — Consider (comment only if pattern is repeated or egregious)

- **Code clarity**: confusing variable names, misleading comments, complex logic that could be simplified
- **DRY violations**: duplicated logic that will clearly drift (not one-time similar code)
- **Performance**: only when measurable impact is likely (hot paths, N+1 queries, unnecessary re-renders)

### Do NOT Comment On

- **Style/formatting**: Prettier and ESLint handle this — never suggest formatting changes
- **Import ordering**: automated by tooling
- **Comment style preferences**: JSDoc vs inline, capitalization, trailing periods
- **Hypothetical future issues**: "if you ever need to X" — review the code that exists, not code that might exist
- **Single-use abstractions**: don't suggest extracting a helper for code used once
- **Agent-facing docs**: `.agents/**`, `SKILL.md`, and `AGENTS.md` should be reviewed for accuracy, not prose style; other documentation files remain in scope for normal review
- **Missing automated tests / Playwright evidence for non-executable artifacts**: do NOT demand unit tests, integration tests, or Playwright evidence for changes that only touch non-executable files — `*.md` (including `SKILL.md`), other documentation, design-bundle assets under `docs/design/**`, image/SVG assets, or pure data/config files (`*.json`, `*.csv`) with no runtime code path. There is nothing executable to test, and `lint-skills.js` / schema validation already gate the relevant artifacts. A "behavioral change requires a test" finding on a markdown or docs-only change is a false positive (it caused `review-bot-override` merges). Reserve test-coverage findings for changes that add or alter **executable code** (`.ts`/`.tsx`/`.js`/`.mjs` runtime logic). When a CI run link (e.g. a `run-playwright-tests.yml` run on the branch, or the green `e2e` check) is cited in the PR body or surfaced in the prompt, treat it as valid evidence rather than re-demanding a local run.
- **Patterns with an intent comment**: if the flagged line (or an adjacent comment block within 3 lines) contains an inline comment that explicitly signals the pattern is intentional — e.g. one containing `intentional:`, `by design:`, `expected behavior:`, or `// intentional: <reason>` — treat that as documented intent. Confidence for that finding cannot exceed 0.5, which puts it below the 0.7 drop threshold; discard it in the self-critique pass. Do not flag the absence of such a comment; only honor its presence when it exists.

## Project Context

This is an **Nx monorepo** with:

- **Stack**: React Native (Expo), Next.js, AWS Lambda, GraphQL (Apollo), PostgreSQL (Drizzle ORM)
- **Package manager**: pnpm (enforced via corepack)
- **Commit format**: `type(scope): message` (conventional commits)
- **Logging**: `LOGGER` from `@legacy-sports/logging` — `console.*` is banned **in application/library source** (ESLint enforced). It is **explicitly exempt** in build/operational contexts (see the console exemption list under "Frequently Missed Project-Specific Patterns → Logging") — never flag `console.*` there.
- **Lint suppression**: `@ts-ignore` and `eslint-disable` are banned — fix root causes
- **GraphQL**: prefer `.graphql` files + codegen over inline `gql` template literals
- **E2E tests** (`apps/web-e2e/src/tests/`): hermetic — `route.fulfill()` only, never `route.continue()` (no backend in CI). Tests under `apps/web-e2e/src/integration/tests/` are a separate live-backend suite — direct API calls are expected there and are not violations.

## Frequently Missed Project-Specific Patterns

These patterns appear in the majority of reviews that touch their respective areas. **Scan for every one that is relevant to the diff before submitting.**

### Logging

- **`console.*` exemption list — do NOT flag `console.*` in these locations.** The `no-console` ESLint rule is disabled (via `.eslintrc` overrides or because the file runs outside the workspace dependency graph) in the following contexts, which print user-facing or build-time output that must be copy-paste-clean. Flagging `console.*` here is a false positive (it caused multiple `review-bot-override` merges):
  - Standalone `.mjs`/`.cjs` build & operational scripts: the top-level `scripts/` directory, `.github/scripts/**`, and `scripts/**` build tooling — these run via `node` before (or outside) `node_modules`/the TS build, and frequently cannot import `@legacy-sports/logging` at all.
  - Inline `actions/github-script` blocks inside `.github/workflows/**` YAML — the GitHub Actions runner has no access to `LOGGER`; `console.*` is the only logging primitive available.
  - CLI entrypoints and DB tooling: `apps/cli/**`, `lib/db-client/src/cli/**`, `lib/db-client/src/scripts/**`.
  - Database migration files and other build-time scripts.
  - The logging library itself: `lib/logging/**`.

  Before raising a `console.*` finding, confirm the file is **application or library runtime source** and not one of the above. When in doubt, check for an `.eslintrc*` override with `"no-console": "off"` in the file's directory or an ancestor — its presence means the usage is sanctioned. Do NOT suggest "replace with LOGGER" for any exempt file.

- **`LOGGER.error` signature**: pass the `Error` instance as the first non-message argument — `LOGGER.error('message', err)` or `LOGGER.error('message', err, { …context })`. Wrapping it in a plain object (`LOGGER.error('message', { error })`) relies on Rollbar heuristics to extract the stack trace and will silently fail when `error` is not an `Error` instance. Treat `{ error }` wrapping as a `high` finding.

### GraphQL & Apollo

- **Input validation errors in resolvers**: use `UserInputError` from `lambdas/db/src/schema/graphql-errors.ts`, not `throw new Error()`. Plain errors surface as `INTERNAL_SERVER_ERROR` to clients; `UserInputError` produces `BAD_USER_INPUT`. Flag any `throw new Error()` used for input validation in `lambdas/db/src/schema/**` resolver/mutation files.
- **Nullable GraphQL fields in JSX and `aria-label`**: cross-reference the `.graphql` query file — a field typed `String` (no `!`) can be `null`. Direct string interpolation or use in `aria-label` without a null-check produces `"...null..."`. Always require a fallback (`rec.playerName ?? 'Unknown player'`).
- **Unsafe `as` casts on unvalidated GraphQL args**: casting resolver args directly to a literal union (`args.order as 'snake' | 'linear'`) bypasses type safety. Require a type guard with an allowed-values array and `UserInputError` on failure.
- **Mock response structure in tests**: Apollo `MockedResponse.result.data` must be keyed by the **root field names from the `.graphql` selection set** (e.g. `{ data: { updateCommissionerNote: … } }`), not the `operationName`. A `{ data: null }` value, a missing `data` wrapper, or field names that don't match the selection set will silently produce no data. Always cross-reference the `.graphql` file for correct field names.
- **Codegen output**: never edit `*.generated.*` files — they are overwritten by `make codegen`. When a PR includes changes to generated files (even from a rebase), the PR description must explain why.

### E2E Tests

- **`route.continue()` is forbidden in `apps/web-e2e/src/tests/`**: it passes requests through to the real network, breaking hermetic CI. Use `route.fulfill()` to stub every response. `route.fallback()` is valid only within the 3-layer mock stack (test layer → `auth.ts` → baseline) to cascade to the next layer — never as an outer-level passthrough. **Do not flag `page.request` calls in `apps/web-e2e/src/integration/tests/`** — that suite runs against the live backend (`playwright.integration.config.ts`, `baseURL: api.legacy-fantasy.com`) and direct API calls are intentional there.
- **Broad `postData.includes()` matching**: `postData.includes('getleague')` matches `getleagueteams`, `getleaguemembers`, etc. Require `'"getleague"'` (quoted JSON field) or `extractOperationName()` from `apps/web-e2e/src/fixtures/shared-mocks.ts`.
- **Missing `UNAUTHENTICATED` guard test**: every new resolver or mutation must have a test calling it with `user: null` and asserting an `UNAUTHENTICATED` error response.
- **`jest.doMock` module path**: `getDbOptions` lives in `@legacy-sports/utils/node`, not `@legacy-sports/utils`. Mocking only that export without spreading `jest.requireActual` also breaks all sibling imports from the same module.
- **Test name vs. assertion mismatch**: the test description must match what it actually asserts — not the setup or happy-path assumption.
- **Missing integration-suite evidence for live-backend specs**: the integration suite under `apps/web-e2e/src/integration/tests/**` runs against the live backend (`playwright.integration.config.ts`, `baseURL: api.legacy-fantasy.com`) and is **not** run on PRs. When the diff modifies any `apps/web-e2e/src/integration/tests/**/*.integration.spec.ts` file or `apps/web-e2e/playwright.integration.config.ts`, the PR must have a structured `<integration-results>` comment (posted by `.github/workflows/run-integration-tests.yml`) covering every touched integration spec with `status: passed`. The parsed results — if any — are surfaced to you in the `## Integration Test Results` block of this prompt; treat that as the source of truth and do NOT attempt to fetch any report URL yourself. If a touched integration spec is missing from that block, or has a non-passed status, flag as **high** severity with the remediation: _"Apply the `run:integration` label to this PR to dispatch `run-integration-tests.yml`; it will run the integration suite against the live backend and post the structured `<integration-results>` evidence as a PR comment."_ Do NOT flag this for the hermetic suite (`apps/web-e2e/src/tests/**`) — those specs are exercised by the green `e2e` GitHub check, which is sufficient evidence on its own. Do not flag this when the diff only touches `*.md` files inside `apps/web-e2e/`.

### Accessibility

- **Collapsed content stays in the a11y tree**: animating `height` or `opacity` to hide content does not remove it from the tab order or screen reader tree. Require `aria-hidden={isCollapsed}`, `visibility: hidden`, and `pointerEvents: none` when collapsed. A `display: none` or the `inert` attribute also satisfies this.
- **`role="button"` without keyboard support**: non-`<button>` elements with `role="button"` are not focusable without `tabIndex={0}` and an `onKeyDown` handler. Prefer native `<button>` where possible.

### Storage

- **`localStorage`/`sessionStorage` writes without `try/catch`**: storage APIs throw in private browsing mode and on quota exceeded. All writes must be wrapped in `try/catch`; the catch block should silently ignore — this is an **approved exception** to the general "every catch must log or re-throw" rule, because client-side persistence is best-effort and a write failure is never load-bearing.

### MCP Tools & Infrastructure

- **Missing pagination**: Jira REST API defaults to 50 results; GitHub GraphQL defaults to 100 — results silently truncate beyond those limits. Any query against these APIs must pass `maxResults`/`perPage` and handle cursor pagination when the result set can exceed the default.
- **MCP partial failure must set `isError: true`**: batch operations that fail some items and return `{ success: true }` hide errors from agents. Require `isError: true` and `{ total, succeeded, failed }` when any item fails.
- **Docs referencing nonexistent MCP tools**: verify tool names exist in `tools/mcp/*/src/` before accepting references in docs or `SKILL.md` files.
- **`dev`/`prod` ternary forgets `staging`**: `env === 'dev' ? X : Y` assigns `X` to staging. Require `{ dev: X, staging: Y, prod: Z }[env]` for all environment-specific branching.

## Documentation Accuracy

The `docs` review pass focuses exclusively on this section. When reviewing documentation, comments, or a PR that changes how something is described:

### What to check

- **Stale inline comments**: when code behavior changes, scan every nearby comment and JSDoc block — does it still accurately describe what the code does? A comment saying "returns the first matching item" when the code now returns all matching items is a `medium` finding.
- **Broken symbol references**: does the comment reference a function, type, env var, or file path that exists? References to deleted or renamed symbols are `medium` findings; references to security-relevant non-existent config are `high`.
- **PR description vs diff**: read the PR description against the actual diff. Flag any claim the code does not support (e.g., "this handles edge case X" when the diff has no such handling). Severity: `high` if the mismatch would mislead a reviewer into approving incorrect behavior; `medium` otherwise.
- **Algorithm accuracy**: if a comment or doc claims "at most N", "always sorted", "equally distributed", or any other mathematical property — verify the code actually guarantees it. Incorrect algorithm claims are `high`.
- **Agent-facing docs** (`.agents/**`, `SKILL.md`, `AGENTS.md`): check accuracy of tool names, file paths, and behavioral descriptions — not prose style.

### What NOT to check in this pass

- Prose quality, tone, or grammar
- Missing documentation for unchanged code
- Comment style (JSDoc vs inline, capitalization, trailing periods)
- Documentation that was already inaccurate before this PR (out of scope — review the change, not the history)

## Code Review Conventions

- When suggesting a fix, prefer a concrete `suggestion` block over a prose description
- **Group repeated patterns**: if a bug or anti-pattern appears in multiple files, write **one** comment that names all affected locations — never one comment per occurrence
- **Never drip-feed**: if you discover something during a follow-up pass that you could have caught in the first pass, that is a process failure — retrospectively note all missed findings in a single follow-up comment rather than opening a new review round for each one
- For shell scripts (`.sh`): focus on correctness under `set -euo pipefail` — unquoted variables, missing error handling, and commands that fail silently are the priority
- For TypeScript: focus on type safety, error handling, and async correctness over style
- For infrastructure files (`.yml`, `.json` configs): focus on security and correctness, not formatting

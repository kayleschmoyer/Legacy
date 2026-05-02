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

## Project Context

This is an **Nx monorepo** with:

- **Stack**: React Native (Expo), Next.js, AWS Lambda, GraphQL (Apollo), PostgreSQL (Drizzle ORM)
- **Package manager**: pnpm (enforced via corepack)
- **Commit format**: `type(scope): message` (conventional commits)
- **Logging**: `LOGGER` from `@legacy-sports/logging` — `console.*` is banned (ESLint enforced)
- **Lint suppression**: `@ts-ignore` and `eslint-disable` are banned — fix root causes
- **GraphQL**: prefer `.graphql` files + codegen over inline `gql` template literals
- **E2E tests**: hermetic — `route.fulfill()` only, never `route.continue()` (no backend in CI)

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

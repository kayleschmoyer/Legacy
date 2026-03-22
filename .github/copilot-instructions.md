# Copilot Review Instructions

## Review Philosophy

Be **thorough in a single pass**. Surface all findings in one review rather than trickling comments across multiple rounds. A comprehensive first review is far more valuable than three incremental ones — each round costs CI time and developer context switches.

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
- **Documentation files**: `.md` files, `SKILL.md` files, and `AGENTS.md` are agent-facing docs — review for accuracy, not prose style

## Project Context

This is an **Nx monorepo** with:

- **Stack**: React Native (Expo), Next.js, AWS Lambda, GraphQL (Apollo), PostgreSQL (Drizzle ORM)
- **Package manager**: pnpm (enforced via corepack)
- **Commit format**: `type(scope): message` (conventional commits)
- **Logging**: `LOGGER` from `@legacy-sports/logging` — `console.*` is banned (ESLint enforced)
- **Lint suppression**: `@ts-ignore` and `eslint-disable` are banned — fix root causes
- **GraphQL**: prefer `.graphql` files + codegen over inline `gql` template literals
- **E2E tests**: hermetic — `route.fulfill()` only, never `route.continue()` (no backend in CI)

## Code Review Conventions

- When suggesting a fix, prefer a concrete `suggestion` block over a prose description
- If a comment applies to a pattern repeated multiple times, comment once and note "same applies at lines X, Y, Z"
- For shell scripts (`.sh`): focus on correctness under `set -euo pipefail` — unquoted variables, missing error handling, and commands that fail silently are the priority
- For TypeScript: focus on type safety, error handling, and async correctness over style
- For infrastructure files (`.yml`, `.json` configs): focus on security and correctness, not formatting

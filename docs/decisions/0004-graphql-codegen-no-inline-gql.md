# 0004. Define queries in `.graphql` files with codegen

Date: 2025-01-20

## Status

Accepted

## Context

GraphQL clients can author operations in two ways:

- **Inline `gql` template literals** — `const MY_QUERY = gql\`query { ... }\``in a`.ts`/`.tsx` file. Convenient but the TypeScript compiler sees the query as an
  opaque string; types must be maintained manually or via a post-hoc extraction step.
- **`.graphql` files with code generation** — operations live in `.graphql` files;
  a codegen step (GraphQL Code Generator) reads the schema + operations and emits
  typed React hooks (`useMyQueryQuery`, `useMyMutationMutation`, etc.) into
  `graphql.generated.ts`. TypeScript enforces variable and response shapes at
  compile time.

When the project was small, inline `gql` was the default — it required no tooling
setup. As the schema grew and the team added the mobile app and more lambda functions,
two problems emerged:

1. **Drift** — manually maintained types diverged from the live schema silently.
   A schema change would compile fine but break at runtime.
2. **IDE support** — inline template literals got no schema-aware autocomplete or
   field validation in VS Code / JetBrains without a dedicated language plugin.

## Decision

We will define all GraphQL operations in **`.graphql` files** and import the
auto-generated typed hooks from `graphql.generated.ts`.

- Operations live in `*.graphql` files co-located with the component or feature
  that owns them (e.g. `apps/web/src/features/roster/roster.graphql`).
- `make codegen` (alias: `pnpm exec nx run <app>:graphql-codegen`) reads the schema
  from the running GraphQL API introspection endpoint and emits typed hook files.
- Generated files are committed to the repo so CI does not require a live API.
- The `no-inline-gql` ESLint rule (in `.eslintrc.json`) rejects new `gql`
  template literals in `apps/web` and `lib/shared-components`, preventing regression.

## Consequences

### Easier

- Schema changes that break an existing query are caught at compile time via
  `make typecheck` — before CI, before code review.
- IDE extensions (VS Code GraphQL, IntelliJ GraphQL) use `.graphql` files natively
  for autocomplete and inline validation.
- Reviewing a PR's query changes is straightforward: `.graphql` files are the
  source of truth; the generated file diff confirms the shape the component sees.

### Harder

- `make codegen` must be re-run after every schema change. Forgetting this step
  causes `graphql.generated.ts` drift, which surfaces as a typecheck failure in CI.
- Bootstrapping a new query requires creating the `.graphql` file, running codegen,
  and then importing the hook — three steps instead of writing inline `gql`.
- The introspection endpoint used by codegen must be accessible during local
  development; developers without a running local API must use the schema SDL file
  or a tunnel.

### Now constrained

- **New operations in `apps/web` and `lib/shared-components` must use `.graphql`
  files.** The ESLint rules in `.eslintrc.json` enforce this; `eslint-disable`
  suppression is not permitted (see `standards` skill).
- **`graphql.generated.ts` is a generated artifact — do not edit it manually.**
  Manual edits are overwritten on the next `make codegen` run.
- `lambdas/` use Pothos (server-side schema builder) and do not use client-side
  codegen; this ADR applies only to client-facing apps and shared libraries.

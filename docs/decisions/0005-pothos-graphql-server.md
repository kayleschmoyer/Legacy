# 0005. Use Pothos for GraphQL schema construction

Date: 2024-11-05

## Status

Accepted

## Context

The GraphQL API layer (a set of Lambda functions) needed a server-side schema
construction strategy. The main options evaluated were:

- **SDL-first (schema.graphql + resolvers)** — define the schema in SDL, hand-write
  resolver implementations separately. Type safety between SDL and resolvers requires
  either manual casting or a codegen pass (graphql-code-generator with server
  targets). Schema and resolvers drift silently when not regenerated.
- **TypeGraphQL** — decorators on TypeScript classes produce the schema. Decorator
  metadata requires `experimentalDecorators` and `emitDecoratorMetadata` in tsconfig,
  which conflicts with Nx's default tsconfig profile and adds significant transpile
  overhead.
- **Nexus** — programmatic schema builder with TypeScript inference. Officially in
  maintenance mode as of 2023; new plugin development has stopped.
- **Pothos (formerly GiraffeQL)** — code-first schema builder designed from the
  ground up for TypeScript. Uses TypeScript's type inference natively (no decorators,
  no metadata reflection). Has first-class plugins for Relay, DataLoader, validation,
  and authorization.

The API was being rebuilt from an older SDL-first approach that had accumulated
resolver/schema drift. The new approach needed to be sustainable for a small team.

## Decision

We will use **Pothos** (`@pothos/core`) for all GraphQL schema construction in
`lambdas/`.

- The `SchemaBuilder` instance in `lambdas/db/src/schema/builder.ts` is the single
  entry point for schema construction.
- Active plugins: `@pothos/plugin-relay` (Relay-spec connections + global IDs),
  `@pothos/plugin-dataloader` (N+1 elimination via batched loaders),
  `@pothos/plugin-validation` (input validation via Zod).
- Resolvers are co-located with their object-type definitions (not separated into
  a `resolvers/` directory) so the type and its implementation stay in sync.

## Consequences

### Easier

- TypeScript infers resolver argument and return types from the Pothos builder
  declarations — no codegen step needed server-side to keep types correct.
- The Relay plugin auto-generates the `Node` interface, global ID encoding/decoding,
  and connection types, eliminating boilerplate pagination code.
- Adding a new object type, field, or mutation is a single builder call; the TypeScript
  compiler immediately flags missing resolvers or type mismatches.
- DataLoader integration is declared at the field level in Pothos; `loadMany` / `loadOne`
  are called automatically — no manual context threading.

### Harder

- Pothos is a less well-known library than Apollo Server or TypeGraphQL; new
  contributors must spend time with its docs before contributing schema changes.
- The Relay global-ID plugin encodes database IDs as base64 opaque strings, which
  requires client-side decoding when the raw numeric ID is needed (e.g. in
  analytics queries).
- Plugin interactions (relay + dataloader + validation) require careful builder
  generic ordering; mistakes surface as TypeScript errors that can be cryptic without
  familiarity with Pothos plugin generics.

### Now constrained

- **All new GraphQL types and resolvers must be defined through the Pothos builder.**
  Adding a raw `graphql-js` type or splicing in SDL-defined types is prohibited;
  it breaks Pothos's type inference graph.
- **`experimentalDecorators` is not enabled** in `lambdas/tsconfig.json`. TypeGraphQL
  and similar decorator-based approaches cannot be introduced without changing
  the tsconfig profile — an intentional constraint.

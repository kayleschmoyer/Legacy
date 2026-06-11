# 0002. Use Apollo Client with normalized cache; mutations return entity

Date: 2025-02-15

## Status

Accepted

## Context

The web app (and later the mobile app) consumes a GraphQL API. Every data-fetching
strategy was on the table when this was set up:

- **No client cache (always refetch)** — simple but burns bandwidth and causes
  visible loading flicker after every mutation.
- **React Query / SWR** — excellent for REST; works with GraphQL via raw `fetch`, but
  gives up field-level normalization. Invalidating a `Player` object after an update
  requires knowing every query key that might hold that object.
- **Apollo Client with field-level normalization** — stores every response entity by
  `__typename + id`. Any query that previously fetched `Player:42` automatically
  sees the update after a mutation that returns the same object.
- **Manual cache writes after mutation** — Apollo also supports `writeQuery` /
  `writeFragment` for surgical cache edits, but this requires duplicating the
  shape of every affected query in mutation response handlers.

Two mutation-response strategies were considered:

1. **Return refetch queries** — mutation resolves, then triggers separate queries for
   each affected list. Adds a round-trip and requires callers to enumerate affected
   queries at the call site.
2. **Return the mutated entity** — mutation resolver returns the full updated object.
   Apollo's normalized cache merges it automatically by ID into every cached query
   that holds that entity.

## Decision

We will use **Apollo Client** with the default normalized `InMemoryCache`, and
GraphQL mutations will return the **full mutated entity** rather than triggering
refetch queries or returning only a success boolean.

- Every response type includes `id` so Apollo can normalize by `__typename:id`.
- Mutation resolvers on the server return the updated entity from the same DB read
  used to confirm the write succeeded — no extra query needed.
- Callers do not pass `refetchQueries` or set `fetchPolicy: 'network-only'` after
  mutations; the cache update is automatic.
- Where a mutation affects a list (e.g. adding a new roster slot), the return type
  includes the parent collection so Apollo can merge the new item in.

## Consequences

### Easier

- UI reflects mutations immediately without a visible re-fetch round-trip.
- Tests mock a single response shape; they do not need to intercept follow-up
  refetch queries.
- Adding a new mutation does not require auditing which queries might be stale — if
  the mutation returns the entity, Apollo handles the rest.

### Harder

- Mutation resolvers must fetch and return the full entity, not just an affected-row
  count. This adds a DB read per mutation; acceptable given mutation frequency.
- Schema designers must think about which fields callers will need post-mutation and
  include them in the return type — under-returning causes silent cache holes.
- Cache normalization requires stable `id` fields on every object type. Types without
  a primary key (e.g. analytics aggregates) need an explicit `keyFields` override or
  must be excluded from normalization.

### Now constrained

- **Mutations must return the mutated entity.** A mutation that returns only
  `{ success: Boolean }` or `Void` breaks the normalized-cache contract and forces
  callers to add `refetchQueries` — an anti-pattern that re-introduces the extra
  round-trip this decision was designed to eliminate. This convention is
  enforced at code review and documented in the Apollo cache skill.
- **`refetchQueries` is strongly discouraged** except for mutations that affect
  derived aggregates Apollo cannot merge by ID (e.g. scoreboard totals). Any new
  use requires a comment explaining why the entity-return pattern does not apply.

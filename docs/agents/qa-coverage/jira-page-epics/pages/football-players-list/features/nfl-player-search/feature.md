# Feature: NFL Player Name Search

**Jira:** LS-5442
**Page:** `football-players-list` (Epic LS-5271)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Search NFL players by name across the league player pool. A debounced text input
filters the displayed player list in real time by forwarding a `search` variable
to the `footballPlayers` GraphQL resolver, which performs case-insensitive
substring matching against `firstName` and `lastName`.

## Source

Extracted from: `docs/agents/pages/football/players.md`

## Implementation

### Web

**Component:** `apps/web/src/pages/football/FootballPlayersPage.tsx`

The search input is a Tamagui `Input` with `aria-label="Search players"` rendered
inside the sticky filter bar. A `useDebounce` hook (300 ms delay) produces
`debouncedSearch`; the query is only called with a `search` variable when
`debouncedSearch.length >= 2`.

```typescript
search: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
```

A "Clear search" button (`role="button"`) appears when the input is non-empty; it
clears the input on click and is keyboard-operable (Enter / Space).

Selecting a new search term also resets the pagination cursor (`setCursor(undefined)`)
and the accumulated node list (`setAllNodes([])`).

### Android (React Native)

**Component:** `apps/app/src/app/(app)/football/players.tsx`

Uses the same `useFootballPlayersQuery` with the same 300 ms debounce and 2-character
minimum. UI layer uses React Native `TextInput` instead of Tamagui `Input`.

### GraphQL

**Query:** `FootballPlayers` (`apps/web/src/api/db/football/FootballPlayers.graphql`)

```graphql
query FootballPlayers(
  $position: String
  $nflTeam: String
  $conference: String
  $search: String
  $after: String
) {
  footballPlayers(search: $search, ...) {
    nodes { ...FootballPlayerHeader }
    pageInfo { hasNextPage endCursor }
  }
}
```

### Backend resolver

**File:** `lambdas/db/src/schema/football.ts`

`builder.queryField('footballPlayers', ...)` — search logic (excerpt):

```typescript
if (args.search) {
  const tokens = args.search.trim().split(/\s+/).filter(Boolean);
  const tokenConditions = tokens.map((token) => {
    const escaped = token.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    return or(
      sql<boolean>`${players.firstName} ILIKE ${pattern} ESCAPE '\\'`,
      sql<boolean>`${players.lastName} ILIKE ${pattern} ESCAPE '\\'`,
    )!;
  });
  conditions.push(
    tokenConditions.length === 1
      ? tokenConditions[0]
      : and(...tokenConditions)!,
  );
}
```

Key behaviours:

- Splits on whitespace; each token is matched independently (AND logic for multi-token).
- `ILIKE` provides case-insensitive substring matching (`%token%`).
- `\`, `%`, and `_` are escaped to prevent SQL injection and wildcard abuse.
- A single token uses one `ILIKE` condition; multiple tokens are AND-ed so
  `"Patrick Mahomes"` matches players whose first+last names contain both tokens.

## Test Coverage

### Unit tests

**File:** `lambdas/db/src/schema/football.resolver.spec.ts`

`describe('search parameter handling')`:

- `'full-name search splits on whitespace and produces per-token ILIKE params'`
  — "Patrick Mahomes" → bind params contain `%Patrick%` and `%Mahomes%`
- `'single-token search produces one ILIKE pattern (unchanged behavior)'`
  — "Mahomes" → `%Mahomes%` present, `%Patrick%` absent
- `'escapes underscore so a single _ does not act as a wildcard'`
  — search `'_'` → bind param is `%\_%`; SQL contains `ESCAPE` keyword
- `'escapes percent sign so a single % does not match all players'`
  — search `'%'` → bind param is `%\%%`; SQL contains `ESCAPE` keyword

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/football-players-name-search.spec.ts`

`describe('NFL player name search @regression')`:

- `'initial load shows all players when no search is active'`
- `'typing fewer than 2 characters does not send a search variable'`
- `'typing 2+ characters sends the search variable and shows matching players'`
- `'non-matching search shows the no-results empty state'`
- `'multi-token search (first + last name) returns the correct player'`
- `'clearing search via clear button restores all players'`

**Existing search / a11y tests** (in `apps/web-e2e/src/tests/football-position-filter-a11y.spec.ts`):

`describe('Football players search — clear button & a11y @regression')`:

- `'search input exposes an accessible name (LS-6488)'`
- `'clear button is hidden while the search input is empty (LS-6487)'`
- `'clear button appears once text is entered and clears it on click (LS-6487)'`
- `'clear button is keyboard operable (LS-6487)'`

## Related

- **Epic:** LS-5271 — QA — Page: Football Players List
- **Feature discovery bucket:** LS-7599 (`feature-discovery-gaps`)
- **GAP-002:** LS-7641 — 300 ms search debounce with separate debounced cursor reset
- **Implementation ref:** `apps/web/src/pages/football/FootballPlayersPage.tsx`
- **Resolver:** `lambdas/db/src/schema/football.ts`

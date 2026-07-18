# Feature: Loading / Error / Not Found States

**Jira:** LS-5356
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The three non-happy-path states for the Matchup Detail page, rendered before the
main `MatchupDetailLayout` mounts:

- **Loading** — spinner + "Loading matchup details..." copy while `useMatchupById`
  is fetching.
- **Error** — "Error loading matchup" + the GraphQL error message + a "Back to
  League" button, shown when the matchup query returns a GraphQL error.
- **Not found** — "Matchup not found" + a "Back to League" button, shown when the
  query resolves with no matchup (`data.getMatchupById === null`) and no error.

"Back to League" navigates to `/baseball/league/{leagueId}` on every platform;
native surfaces the same three states without the button (see Implementation).

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`

## Implementation

**Web:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx` — `loading` / `error` /
`!matchup` early-return branches ahead of the main layout render.

**Native:** `apps/app/src/features/matchup/screens/MatchupDetailScreen.tsx` — same
three branches (no "Back to League" button; native relies on stack-back
navigation).

**Data hook:** `useMatchupById` (`apps/web/src/hooks/useMatchup.ts` /
`apps/app/src/features/matchup/hooks/useMatchup.ts`) — wraps
`useGetMatchupByIdQuery` and surfaces `{ matchup, loading, error }`.

## Test Coverage

### Unit tests

File: `apps/app/src/features/matchup/screens/MatchupDetailScreen.spec.tsx`

`describe('MatchupDetailScreen')`:

- Shows a loading spinner while the matchup is fetching
- Shows an error message when the matchup fetch fails
- Shows a not-found message when no matchup is returned

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/matchup-detail.spec.ts`

`describe('Matchup Detail – loading state @regression')`:

- Shows loading spinner while data is pending

`describe('Matchup Detail – error state @regression')` — mocks
`{ data: { getMatchupById: null }, errors: [{ message: 'Matchup not found' }] }`.
Apollo's default `errorPolicy: 'none'` means any response carrying a
top-level `errors` array always resolves to this branch, never the
not-found branch below:

- Shows error message when GraphQL returns an error
- Shows Back to League button and navigates back

`describe('Matchup Detail – not-found state @regression')` — mocks
`{ data: { getMatchupById: null } }` with no `errors` array, independently
exercising the `!matchup` branch (previously uncovered — the error-state
test's mock always resolved to the error branch above):

- Shows Matchup not found message
- Shows Back to League button and navigates back

All routes use `route.fulfill()` only (no `route.continue()`), per
`.agents/skills/testing/references/e2e-determinism.md`.

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Source doc:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`

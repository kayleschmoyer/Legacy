# Feature: Create League Submission

**Jira:** LS-5366
**Page:** `create-league-baseball` (Epic LS-5262)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Submitting the Create League form invokes `useCreateLeagueAndTeamsMutation` with
the assembled `CreateLeagueInput` and, on success, navigates to the new
league's detail page. Client-side validation (name length, team/division
parity, roster range, etc.) blocks submission and surfaces the first error in
the sticky action bar. A mutation failure (GraphQL error or network error)
is caught and rendered in a dismissible red error banner without leaving the
page; the form stays fully populated so the user can retry.

## Source

Extracted from: `docs/agents/pages/baseball/league/create.md`

## Implementation

**Component:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

- `handleSubmit` runs the league-limit / premium-gate / validation checks
  (in that order) before calling `createLeagueAndTeams`.
- **GraphQL mutation:** `CreateLeagueAndTeams` (variables: `CreateLeagueAndTeamsInput`).
  Returns `{ createLeagueAndTeams: { league { ...League } } }`.
- **On success:** navigates to `/${sport}/league/{league.id}`; the mutation's
  `update` callback also optimistically appends the new league into the
  `GetUserLeagues` cache.
- **On error:** `catch` block sets `submitError` to the thrown message (or a
  generic fallback), rendered in a `role="alert"` red banner titled "Unable to
  save league" with a "Dismiss" button. The route does not change.
- **Loading:** the submit button (`data-testid="create-league-submit"`) shows
  "Creating..." and disables all inputs while `loading` is true.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/league-creation.spec.ts` — `describe('League Creation @critical')`:

- Submitting with a short/invalid league name shows a validation error instead of crashing
- Submitting valid data calls `createLeagueAndTeams` and navigates to `/baseball/league/:id`
- A GraphQL error response from the mutation is shown inline and the route stays on `/baseball/league/create`
- The submit button shows "Creating..." and is disabled while the mutation is in flight, then navigates on completion

Additional submission-path coverage in `apps/web-e2e/src/tests/league-creation-advanced.spec.ts` — `describe('League Creation — Advanced Settings @regression')`:

- Inline error card for a too-long league name on submit
- A GraphQL network/internal-server error is surfaced in the inline error card and the route is unchanged
- "Creating..." loading text shown on the submit button while the mutation is pending

## Related

- **Epic:** LS-5262 — QA — Page: Create League — Baseball
- **Implementation ref:** `docs/agents/pages/baseball/league/create.md`

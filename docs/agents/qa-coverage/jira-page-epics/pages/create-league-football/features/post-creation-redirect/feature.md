# Feature: Post-Creation Team Setup & Redirect

**Jira:** LS-5377
**Page:** `create-league-football` (Epic LS-5263)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

On a successful football league creation the server creates the owner's team,
seeds roster positions, and inserts a draft record; the client confirms with an
invite-code dialog and then navigates the new commissioner to the league detail
page for the league it just created.

## Source

Extracted from: `docs/agents/pages/football/league/create.md`

## Implementation

**Component:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx` (serves both sports)
**Destination:** `apps/web/src/pages/baseball/LeagueDetailPage.tsx` → `lib/shared-components/src/features/leagues/LeagueDetailShell.tsx`
**Resolver:** `lambdas/db/src/schema/leagues/mutations.ts` → `createLeagueAndTeams`
**Service:** `lib/db-client/src/lib/services/LeagueService.ts` → `createLeague`

A successful `createLeagueAndTeams` stores `{ id, inviteCode }` in
`createdLeague`, which opens the "League created!" dialog (LS-6067). Its
`aria-labelledby` target sits on an inner content wrapper, so the outer
`role="dialog"` node has no accessible name — E2E matches it by content.
The dialog gates navigation: `handleContinueToLeague` clears it and calls
`navigate('/<sport>/league/<id>')`, so the id in the URL comes from the mutation
payload rather than from form state.

Server-side, `LeagueService.createLeague` runs one transaction that (1) inserts
the league, (2) inserts the teams with the owner's team first, named
`<displayName>'s Team`, (3) inserts the owner's `league_members` row at
`permissionLevel: 'commissioner'`, (4) seeds `league_positions` from the
per-slot roster config or the sport defaults, and (5) always inserts a `drafts`
row so draft settings are never missing. `LeagueDetailShell` renders that state
as the `league-title` heading, the Standings card's per-team "Open &lt;team&gt;"
rows, the commissioner-only Commissioner tab (`commishOnly` tabs are filtered
out for everyone else), and the `draft-status-chip` reading "Pre-Draft".

## Platform coverage

| Platform   | Harness    | Spec / Flow                                                           | Status  |
| ---------- | ---------- | --------------------------------------------------------------------- | ------- |
| web        | Playwright | `apps/web-e2e/src/tests/create-league-post-creation-redirect.spec.ts` | covered |
| mobile-web | Playwright | `apps/web-e2e/src/tests/create-league-post-creation-redirect.spec.ts` | covered |
| android    | Maestro    | `maestro/flows/create-league-football/post-creation-redirect.yaml`    | pending |

The android row is pending: no `maestro/flows/create-league-football/` directory
exists yet, and epic LS-5263 scopes its coverage goal to hermetic Playwright
specs under `apps/web-e2e/src/tests/`.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/create-league-post-creation-redirect.spec.ts`

`describe('Create League (Football) — Post-Creation Team Setup & Redirect @regression')`:

- A valid submit opens the "League created!" dialog showing the invite code, and
  the browser stays on `/football/league/create` — the dialog gates the redirect
- The `createLeagueAndTeams` mutation input carries the entered league name,
  `sport: 'football'`, and the user's non-default team count
- "Continue to League" redirects to `/football/league/<id>` using the id the
  mutation returned
- The landing page renders the new league's title, lists the owner's team (and
  the seeded placeholder team) in the Standings card, and shows the
  commissioner-only Commissioner tab
- The landing page shows the "Pre-Draft" draft-status chip — the league's draft
  record exists and is awaiting setup — with no application-error boundary

Complementary coverage exists in `league-creation-football.spec.ts` (submit
sends `sport=football` and routes under `/football`) and `football-hub.spec.ts`
(Scenario 1 redirect smoke); both stop at a URL regex. This file is the
dedicated Feature Story spec for LS-5377 and additionally covers the invite-code
interstitial, the submitted mutation input, and the state of the destination
page.

## Related

- **Epic:** LS-5263 — QA — Page: Create League — Football
- **Finding:** LS-6134 (CLF-015) — IDP roster positions seeded as D/ST on a
  freshly created football league (Done)
- **Finding:** LS-6136 (CLF-017) — native football create navigates without the
  draft-setup interstitial web users get (Done)

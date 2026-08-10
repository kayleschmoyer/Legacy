# Feature: Free-Tier League Limit Gating

**Jira:** LS-5376
**Page:** `create-league-football` (Epic LS-5263)
**Platforms:** web, mobile-web, android
**Entitlement:** `mixed` (free users are gated; premium users are uncapped)

## Description

Free-tier accounts are blocked from creating more leagues than the free-tier
cap once they're already a member of `FREE_LEAGUE_LIMIT` leagues — the cap is
shared across every sport (baseball + football leagues both count toward the
same limit). Premium accounts are never capped. The gate is proactive: it
fires on the Create League page itself (`/football/league/create`) before the
user fills out the form, and is re-checked defensively on submit.

## Source

Extracted from: `docs/agents/pages/football/league/create.md`

## Implementation

**Web page:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx` — despite the
`baseball` path segment, this is the shared, sport-aware Create League page
used for both `/baseball/league/create` and `/football/league/create` (sport
is URL-driven per `sportFromPathname`). The football journey for this feature
runs through the same component and gating logic as baseball.

**League count source:** `useGetUserLeaguesQuery()` → `userLeagueCount`, the
authoritative unpaginated total of leagues (owned + joined) across every
sport (LS-9101 — `userLeagues.length` under-counts once a user has more
leagues than the page size).

**Gate:**

```ts
const atLeagueLimit =
  !isPremium && !premiumLoading && leagueCount >= FREE_LEAGUE_LIMIT;
```

(`FREE_LEAGUE_LIMIT = 3`, `apps/web/src/constants/league.ts` — mirrors the
server-enforced limit in `lambdas/db/src/schema/subscriptions.ts`.)

When `atLeagueLimit` is true:

- A `data-testid="league-limit-banner"` alert renders on the form ("League
  limit reached — Free accounts can be in up to 3 leagues total…") with an
  "Upgrade" button.
- `handleSubmit` short-circuits before validation or the mutation, opening the
  `UpgradeModal` (featureName `"Unlimited League Creation"`) instead of
  calling `createLeagueAndTeams` — no league is ever created while at the cap.

A parallel, pre-form gate also exists on the Football hub
(`apps/web/src/pages/football/FootballHubPage.tsx` — `handleCreateLeague`
opens the same `UpgradeModal` before navigating to the create page at all),
but this Feature Story scopes to the create-page gate itself, which is the
last line of defense and the one the epic's journey test targets.

## Platform coverage

| Platform   | Harness    | Spec / Flow                                                        | Status  |
| ---------- | ---------- | ------------------------------------------------------------------ | ------- |
| web        | Playwright | `apps/web-e2e/src/tests/create-league-free-tier-limit.spec.ts`     | covered |
| mobile-web | Playwright | same spec, `Mobile Chrome` / `Mobile Safari` projects              | covered |
| android    | Maestro    | `maestro/flows/create-league-football/free-tier-league-limit.yaml` | pending |

Android coverage is out of scope for this ticket; no Maestro flow exists yet
for the football Create League journey to extend. Tracked as `pending` until
one is authored.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/create-league-free-tier-limit.spec.ts`

`describe('Create League (Football) — Free-Tier League Limit Gating @regression')`:

- Free-tier user at the league cap (`userLeagueCount: 3`) sees the
  `league-limit-banner` on `/football/league/create`
- Free-tier user at the cap: clicking "Create League" opens the
  `UpgradeModal` ("Unlock Unlimited League Creation and more") instead of
  submitting — no `createLeagueAndTeams` mutation is sent
- Free-tier user below the cap (`userLeagueCount: 2`) sees no
  `league-limit-banner` and can submit normally
- Premium user at/above the same league count (`userLeagueCount: 5`) sees no
  `league-limit-banner` and can submit normally

## Related

- **Epic:** LS-5263 — QA — Page: Create League — Football
- **Implementation ref:** `docs/agents/pages/football/league/create.md`
- **Web page (shared, sport-aware):** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`
- **Football hub pre-gate:** `apps/web/src/pages/football/FootballHubPage.tsx`
- **Free-tier limit constant:** `apps/web/src/constants/league.ts`
- **Server enforcement:** `lambdas/db/src/schema/subscriptions.ts`

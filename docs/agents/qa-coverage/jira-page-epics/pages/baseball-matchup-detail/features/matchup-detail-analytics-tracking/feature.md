# Feature: Matchup Detail Analytics Tracking

**Jira:** LS-7628
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web
**Entitlement:** all

## Description

`MatchupDetailPage` fires a Google Analytics 4 `matchup_viewed` event once per
unique matchup view, so product analytics can measure matchup-detail traffic.
This is a pre-existing behavior (not introduced by this ticket) — this feature
doc and its test coverage close a documentation/QA gap (GAP-001).

Key behaviours:

- **Trigger** — a `useEffect` fires `trackMatchupViewed(matchupId, leagueId,
weekNumber)` whenever `matchup`, `matchupId`, `leagueId`, and `weekNumber`
  are all resolved.
- **Dedupe key** — `` `${leagueId}-${matchupId}-${weekNumber}` ``, compared
  against a `useRef<string | null>` (`lastTrackedMatchupViewKeyRef`). The
  event fires once per unique **(league, matchup, week)** tuple per page
  instance — re-renders that leave the tuple unchanged (e.g. a new `matchup`
  object reference from an Apollo cache update) do not re-fire it; navigating
  to a different matchup/week does.
- **Payload** — `{ matchup_id, league_id, week_number, category: 'matchup' }`
  plus the shared `subscription_tier` field every event carries
  (`trackEvent`). No PII (no user id, name, or email) is included.
- **Silent no-op when GA is not configured** — `trackEvent` (which
  `trackMatchupViewed` calls) early-returns without throwing when
  `window.gtag` is undefined or `VITE_GA_MEASUREMENT_ID` is unset — the
  default for local dev and the E2E/CI build.

## Implementation

| Symbol                                   | File                                                     | Purpose                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MatchupDetailPage` view-tracking effect | `apps/web/src/pages/matchup/MatchupDetailPage.tsx:82-93` | Computes the dedupe key and calls `trackMatchupViewed` once per unique tuple                                                                               |
| `trackMatchupViewed`                     | `apps/web/src/utils/analytics.ts:308-319`                | Builds the `matchup_viewed` GA4 payload and delegates to `trackEvent`                                                                                      |
| `trackEvent`                             | `apps/web/src/utils/analytics.ts:93-106`                 | Shared gtag wrapper; no-ops when `window.gtag` or the measurement ID is unavailable                                                                        |
| `googleAnalyticsMeasurementId`           | `apps/web/src/config/environment.ts`                     | Sourced from `VITE_GA_MEASUREMENT_ID` at build time (via `@legacy-sports/app-config/web`); overridable at runtime in E2E via `window.__e2eGaMeasurementId` |

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/matchup-detail-analytics-tracking.spec.ts`

All GraphQL responses are mocked (`route.fulfill`); the GA measurement ID is
injected at runtime via `window.__e2eGaMeasurementId` since the E2E build
never sets `VITE_GA_MEASUREMENT_ID` (same override pattern as
`window.__e2eWsUrl`).

`describe('Matchup Detail – matchup_viewed GA4 event @regression')`:

- Fires `matchup_viewed` exactly once on initial load, with
  `matchup_id`/`league_id`/`week_number`/`category` matching the mocked
  matchup, and no PII keys present in the payload.

`describe('Matchup Detail – matchup_viewed GA4 no-op @regression')`:

- Does not call `window.gtag` (it is never assigned) and does not throw when
  the GA measurement ID is unset — the default E2E/CI build configuration.

### Unit tests

File: `apps/web/src/pages/matchup/MatchupDetailPage.spec.tsx` —
`describe('MatchupDetailPage – GA4 matchup_viewed tracking (LS-7628)')`:

- Fires once on initial mount with the `(league, matchup, week)` tuple.
- Does not re-fire on re-render when the tuple is unchanged, even if the
  `matchup` object identity changes (Apollo cache update) — exercises the
  `lastTrackedMatchupViewKeyRef` dedupe directly.
- Fires again when navigating to a new tuple (week change).

File: `apps/web/src/utils/analytics.spec.ts` —
`trackMatchupViewed` payload contains no PII (only numeric IDs and a
category); `trackEvent`/`trackMatchupViewed` silently no-op (no throw, no
`gtag` call) when `window.gtag` is undefined or the GA measurement ID is
unset.

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Originating gap:** GAP-001 (`pages/baseball-matchup-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`)
- **This ticket:** LS-7628
- **Sibling spec:** `apps/web-e2e/src/tests/matchup-detail.spec.ts` (page
  structure, scoreboard, loading/error/not-found states — does not cover
  analytics)

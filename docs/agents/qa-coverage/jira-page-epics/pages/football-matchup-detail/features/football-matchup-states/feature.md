# Feature: Upcoming / Live / Final States

**Jira:** LS-5427
**Page:** `football-matchup-detail` (Epic LS-5269)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The football matchup detail page (`/football/league/:leagueId/matchups/:matchupId`)
is served by the same shared, multi-sport `MatchupDetailPage` component
baseball uses. It renders one of three real per-matchup states based on
`matchup.status`:

- **Scheduled ("Upcoming")** — status badge reads SCHEDULED/gray. The Win
  Probability panel and per-team projected scores render alongside actual
  (zero) scores, gated by the `matchup_projections` entitlement.
- **InProgress ("Live")** — status badge reads LIVE/green with an Activity
  icon. Scores are recomputed client-side from live per-player stats on
  every render (falling back to the server-stored score when no scoring
  profile / players data is available), and projections continue to show
  for any games remaining in the matchup window.
- **Completed ("Final")** — status badge reads FINAL/gold with a Trophy
  icon. Scores are the server-stored `team1Score`/`team2Score` exclusively;
  the Win Probability panel is unmounted entirely (returns `null`); the
  roster editor is hidden; and a premium-gated AI Matchup Recap panel
  appears instead.

**Bye-week is out of scope for this feature.** It is not implemented
anywhere on this page — a bye week is a property of a league-week with no
matchup created at all (no `currentMatchup` id on the league), so there is
no `matchupId` to route into this page with in the first place. Bye-week
UI exists exclusively on the separate Football Home page
(`useFootballMatchupHighlights`, `MatchupCard`'s `'bye'` status), unrelated
to this page. If bye-week coverage is wanted, it belongs to a Feature
Story under the football-home page epic instead.

## Platforms

- web
- mobile-web
- android

## Platform coverage

| Platform   | Harness                       | Spec / Flow                                                 | Status                                                  |
| ---------- | ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| web        | Playwright                    | `apps/web-e2e/src/tests/football-matchup-states.spec.ts`    | covered                                                 |
| mobile-web | Playwright (375x800 viewport) | same spec, narrow-viewport `test.describe` block            | covered                                                 |
| android    | Maestro                       | `maestro/flows/football-matchup-detail/matchup-states.yaml` | pending (flow exists; screenshot-judged data-dependent) |

## Source

Extracted from: `docs/agents/qa-coverage/jira-page-epics/pages/football-matchup-detail/features/football-matchup-states/feature.md`
(no upstream `docs/agents/pages/football/matchup.md` exists — this
description was derived directly from the application code; see the LS-5427
ticket's Technical Approach for full file/line citations.)

## Implementation

**Web:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx` (shared,
multi-sport) — status-gated composition at lines 264-300. Status badges and
`showProjections` gating in
`lib/shared-components/src/features/matchup/MatchupScoreboardView.tsx:172-202`.
Score computation per status in
`apps/web/src/features/matchup/MatchupScoreboard.tsx:264-301`. Win
Probability unmount-on-Completed and pre-season placeholder in
`apps/web/src/features/matchup/MatchupWinProbabilityPanel.tsx:460-505`.
Football-only additional sections (status-independent) in
`apps/web/src/features/matchup/MatchupAdditionalSections.tsx`.

**Native:** `apps/app/src/screens/leagues/football/FootballMatchupScreen.tsx`
via `apps/app/src/app/(app)/football/matchup.tsx` — an independent native
implementation (own `useGetMatchupByIdQuery`), not the same component tree
as web.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/football-matchup-states.spec.ts`

`describe('Football Matchup States – scheduled (upcoming) @regression')`:

- Renders the SCHEDULED status badge
- Shows the Win Probability panel with projected scores
- Does not show the AI Matchup Recap panel

`describe('Football Matchup States – in progress (live) @regression')`:

- Renders the LIVE status badge
- Shows the current score for both teams
- Still shows the Win Probability panel while games remain

`describe('Football Matchup States – completed (final) @regression')`:

- Renders the FINAL status badge
- Shows the server-stored final scores
- Does not render the Win Probability panel
- Shows the AI Matchup Recap panel instead

`describe('Football Matchup States – mobile-web @regression')` — narrow
viewport (375x800) re-asserting all three status badges.

All routes use `route.fulfill()` only (no `route.continue()`), per
`.agents/skills/testing/references/e2e-determinism.md`.

### Android (Maestro)

File: `maestro/flows/football-matchup-detail/matchup-states.yaml` —
navigates to the Matchups tab, drills into the first available matchup
card, and screenshots the detail screen for AI judging (per the
[mobile-qa skill](../../../../../../../.agents/skills/mobile-qa/SKILL.md)).
Data-dependent (live backend, seeded league state) — see the flow's header
comment for its known limitation around football-specific league selection.

## Related

- **Epic:** LS-5269 — QA — Page: Football Matchup Detail
- **Sibling ticket (different feature, do not conflate):** LS-5356 — Loading
  / Error / Not Found States (baseball-matchup-detail)

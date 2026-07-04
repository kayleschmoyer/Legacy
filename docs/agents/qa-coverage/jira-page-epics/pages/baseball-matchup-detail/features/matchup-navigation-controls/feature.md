# Feature: Matchup Navigation Controls

**Jira:** LS-5353
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Controls at the top of the Matchup Detail page that let users move between weeks
and between the individual matchups within a week. The current implementation
replaced the original dropdown-based selectors with a **week stepper** (prev /
"Week N" / next) plus a horizontally-wrapping grid of tappable **matchup cards**.

The controls render even when no matchup is currently selected, so a spectator can
browse to any week, and they are visible to all users regardless of entitlement —
there is no premium gate on navigation (the gated panels on this page, Win
Probability and AI Recap, are separate features).

Key behaviours:

- **Week stepper** — a `‹` / `Week N` / `›` row. The chevron buttons carry the
  accessible labels `Previous week` and `Next week`. A muted `of {totalWeeks}`
  label is shown alongside the week number when more than one week is available.
- **Week badge** — the selected week is tagged relative to the league's current
  week: green **Current** when `selectedWeek === currentLeagueWeek`, a navy
  **Upcoming** (calendar icon) for future weeks, and a gray **Past** for earlier
  weeks. Upcoming/Past badges only appear when `currentLeagueWeek` is supplied.
- **Stepper bounds** — the previous button is disabled on the first available week
  and the next button on the last. "Disabled" is a visual variant (opacity `0.3`,
  no hover/press) — the element is still in the DOM and carries no HTML `disabled`
  attribute, so a click is simply inert.
- **Auto-select on step** — stepping to a new week immediately fires
  `onMatchupChange` for the best matchup in that week: the user's own matchup when
  `userTeamId` matches, otherwise the first matchup. The detail panel updates
  without requiring a card click.
- **Matchup cards** — one card per matchup in the selected week, showing both team
  names and (when present) scores formatted to one decimal with tabular figures.
  The active card is highlighted in brand gold; the user's own matchup shows a
  green **YOU** badge and is sorted to the front of the grid.
- **Team names** — resolved via an id → name map from `useGetLeagueTeamsQuery`;
  unknown ids fall back to `TBD`.
- **Available weeks** — derived from the `allMatchups` prop (deduplicated, sorted
  ascending), falling back to the current matchup's week when the list is empty.
- **Week sync** — the selected week follows the externally-viewed matchup
  (`currentMatchup.weekNumber`) but does not overwrite manual stepper navigation on
  every render.
- **Back-to-current action** — when `isViewingOther` is set and an
  `onResetToDefault` callback is provided, a "Back to your matchup" button
  (`RotateCcw` icon) is rendered below the cards.
- **States** — a "Loading matchups…" spinner while teams/matchups load, a
  "No matchups for Week {n}" message when a week has none, and an
  "Error loading teams" card when the teams query errors.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`

## Implementation

**Shared component:**
`lib/shared-components/src/features/matchup/MatchupNavigationControls.tsx`
— cross-platform Tamagui implementation (week stepper + matchup card grid). It is
self-fetching: it queries teams and the selected week's matchups internally and
exposes only `onMatchupChange` / `onResetToDefault` callbacks to the host.

**Layout slot:**
`lib/shared-components/src/features/matchup/MatchupDetailLayout.tsx` renders
`MatchupNavigationControls` as the second element (below the header), forwarding
`currentMatchup`, `leagueId`, `allMatchups`, `currentLeagueWeek`, `userTeamId`,
`isViewingOther`, and the two callbacks.

**Web page:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx` composes
`MatchupDetailLayout` and supplies `onMatchupChange`, which routes to
`/baseball/league/{leagueId}/matchups/{matchupId}` via `useNavigate`.

**GraphQL queries:**
`useGetLeagueTeamsQuery` (`lib/graphql/src/getLeagueTeams.query.graphql`) and
`useGetMatchupsByWeekQuery` (`lib/graphql/src/getMatchupsByWeek.query.graphql`).

| Component / hook            | File                                                                       | Purpose                                                      |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `MatchupNavigationControls` | `lib/shared-components/src/features/matchup/MatchupNavigationControls.tsx` | Cross-platform week stepper + matchup card grid              |
| `MatchupDetailLayout`       | `lib/shared-components/src/features/matchup/MatchupDetailLayout.tsx`       | Composes the detail page; renders the nav controls in slot 2 |
| `MatchupDetailPage` (web)   | `apps/web/src/pages/matchup/MatchupDetailPage.tsx`                         | Web host; wires `onMatchupChange` to route navigation        |
| `useGetLeagueTeamsQuery`    | `lib/graphql/src/getLeagueTeams.query.graphql`                             | Team id → name lookup for card labels                        |
| `useGetMatchupsByWeekQuery` | `lib/graphql/src/getMatchupsByWeek.query.graphql`                          | Matchups for the selected week (the card grid)               |

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/matchup-week-navigation.spec.ts` (LS-1626) — all
GraphQL responses mocked, no live backend.

`describe('Matchup Week Navigation – current week display @smoke')`:

- Loads the matchup detail page showing current week
- Displays the current week number with scores
- Shows team names for the current matchup

`describe('Matchup Week Navigation – stepper controls @regression')`:

- Previous and next week buttons are visible
- Previous week button is disabled on the first available week
- Clicking next week loads week 4 matchup data

> The same file also covers Win Probability panel visibility for premium vs. free
> users; those cases belong to the Win Probability feature, not to navigation.

### Integration tests (live backend)

File: `apps/web-e2e/src/integration/tests/matchup-detail-ui.integration.spec.ts`

`test('Phase 8: Week navigation controls function correctly')`:

- Week stepper shows "Week 1"
- Previous-week button is inert at Week 1 (displayed week does not change on click)
- Next-week and Previous-week buttons are visible
- Matchup cards for the current week are shown, including the "YOU" badge for the
  commissioner's own matchup
- The green "Current" week badge is displayed for Week 1

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Source doc:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`

# Feature: Roster Tab (My Roster)

**Jira:** LS-5346
**Page:** `baseball-league-detail` (Epic LS-5259)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Lineup editor for the user's own team. Displays a week selector, historical/future mode
banners, pending waiver claims, pending trade offers, and the interactive roster board
(`RosterBoard`) split into "Starting Hitters", "Starting Pitchers", and "Bench" sections.

The tab is **members-only** — only rendered when the authenticated user has a team in the
league (`isMember`). The roster is read-only when viewing a past week.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/tabs/roster.md`

## Implementation

### Web data wrapper

**File:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Roster.tsx`

Mounted at `tab === 'roster'` in `LeagueDetailPageV2`. Renders only when `isMember || !userTeamIdSettled`.

Key responsibilities:

- `useGetPositionsForLeagueQuery` — fetches league position slot definitions
- `useGetTeamMembersQuery` (teamId) — fetches the user's roster
- `useUpdateTeamMemberPositionMutation` / `useSwapTeamMemberPositionsMutation` — lineup mutations
- Computes `isPast`, `isCurrent`, `isFuture` from `league.currentWeekNumber`
- Renders `RosterWeekNavigation`, `RosterStatusBanners`, `PendingTradeOfferBanner`,
  `PendingWaiverClaims`, and `RosterBoard`

### Shared components

**`lib/shared-components/src/features/roster/RosterBoard.tsx`**

Cross-platform lineup board. Accepts `positions` and `teamPlayers`, renders:

- **Starting Hitters** section (`data-testid="roster-section-hitters"`) — non-pitcher slots
- **Starting Pitchers** section (`data-testid="roster-section-pitchers"`) — `SP`, `RP`, `P` slots
- **Bench** section (`data-testid="roster-section-bench"`) — players with no `positionId`, split
  into Hitters/Pitchers sub-groups

Each slot row has `role="button"` with an `aria-label`:

- Occupied: `"{playerName} at {positionType}"`
- Empty: `"{positionLabel} — open slot"`
- Empty bench: `"Bench is empty. Add free agents or move players from the lineup."`

`readOnly={true}` disables all interaction (past weeks).

**`lib/shared-components/src/features/roster/RosterWeekNavigation.tsx`**

Week selector with prev/next chevrons. Shows `"Current"`, `"Frozen"`, or `"Upcoming"` chip
based on relative week position.

**`lib/shared-components/src/features/roster/RosterStatusBanners.tsx`**

Renders `"Historical Mode"` (lock icon) on past weeks and `"Future Week — Provisional Lineup"`
on future weeks. Renders nothing on the current week.

**`lib/shared-components/src/features/roster/PendingWaiverClaims.tsx`**

Fetches `useGetTeamWaiverClaimsQuery` and renders a card per pending claim. Renders nothing
when claims are empty. Shown only on the current week.

**`lib/shared-components/src/features/roster/PendingTradeOffers.tsx`** (via `PendingTradeOfferBanner`)

Fetches pending trades and renders a banner for each. Shown only on the current week.

### Eligibility utilities

**`lib/shared-components/src/features/roster/rosterEligibility.ts`**

- `isPitcherSlot()` — classifies a slot as pitching (SP/RP/P)
- `canPlayerPlayPosition()` — checks a player's `eligiblePositions` against `ALLOWED_POSITIONS`
- `playerHasBatting()` / `playerHasPitchingOnly()` — bench group classification
- `getPositionLabel()` — human-readable slot labels (e.g. `SP` → `"Starting Pitcher"`)

## Test Coverage

### Unit tests — shared components

**`lib/shared-components/src/features/roster/RosterBoard.spec.tsx`**

`describe('RosterBoard')`:

- Renders the three section headings and assigned player names
- Renders the loading state (spinner)
- Renders the error state (`"Failed to load roster"`)
- Assigns a selected bench player to an eligible empty slot (fires `onPlayerAssign`)
- Does not fire mutations when `readOnly={true}`

**`lib/shared-components/src/features/roster/RosterWeekNavigation.spec.tsx`**

`describe('RosterWeekNavigation')`:

- Shows week number and "Current" chip on the live week
- Shows "Frozen" chip and Reset affordance on a past week
- Shows "Upcoming" chip on a future week
- Steps the week with the prev / next controls
- Does not step before week 1 or past the final week

**`lib/shared-components/src/features/roster/RosterStatusBanners.spec.tsx`**

- Renders the historical banner on a past week
- Renders the provisional banner on a future week
- Renders nothing on the current week

### E2E tests (hermetic)

**`apps/web-e2e/src/tests/roster-management.spec.ts`**

`describe('Roster Management — navigation @smoke')`:

- Navigates to the roster tab without errors

`describe('Roster Management – layout @regression')`:

- Shows "My Roster" heading
- Shows Starting Hitters lineup section
- Shows Bench section
- Shows open lineup slots ("Open slot" sub-label for empty positions)

`describe('Roster Management – player data @regression')`:

- Shows player in SP lineup slot (Gerrit Cole)
- Shows player in infield lineup slot 1B (Freddie Freeman)
- Shows bench player not in lineup (Mookie Betts)
- Shows SP position type label in the pitchers card

`describe('Roster Management – bench/bullpen regions @regression')`:

- Shows Bench region with "Hitters · N" sub-group label

`describe('Roster Management — empty roster @regression')`:

- Shows empty roster state gracefully (no app error)
- Shows empty bench message when no bench players

`describe('Roster Management — aria attributes for lineup slots @regression')`:

- Occupied slot has aria-label `"Gerrit Cole at SP"`
- Empty slot has aria-label matching `/open slot/i`

**`apps/web-e2e/src/tests/league-detail-tabs.spec.ts`** (Roster Tab section)

`describe('Roster Tab — navigation @smoke')`:

- Navigates to the roster tab without error
- Clicking "My Roster" tab from overview navigates to `/roster`

`describe('Roster Tab – data rendering @regression')`:

- Shows a roster player from mocked team members
- Shows roster position slots ("Starting Hitters" heading)

`describe('Pending Waivers — with claims @regression')`:

- Shows pending waiver claim card when claims exist

`describe('Pending Waivers — no claims @regression')`:

- Does not show waiver claim card when there are no pending claims

## Related

- **Epic:** LS-5259 — QA — Page: Baseball League Detail
- **Page doc:** `docs/agents/pages/baseball/league/detail/tabs/roster.md`
- **Tab component:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Roster.tsx`
- **Roster board:** `lib/shared-components/src/features/roster/RosterBoard.tsx`
- **Eligibility utils:** `lib/shared-components/src/features/roster/rosterEligibility.ts`
- **Tab config:** `apps/web/src/pages/baseball/league-detail-v2/tabConfig.ts` (`id: 'roster'`, `label: 'My Roster'`, `memberOnly: true`)

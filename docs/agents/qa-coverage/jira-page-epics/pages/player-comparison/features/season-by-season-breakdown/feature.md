# Feature: Season-by-Season Breakdown per Player

**Jira:** LS-5576
**Page:** `player-comparison` (Epic LS-5286)
**Platforms:** web, mobile-web, android
**Entitlement:** premium

## Description

Per-player batting and pitching tables with color-coded headers showing
season-by-season stats for each selected player on the Player Comparison page.
The section appears below the head-to-head comparison table when two or more
players are selected, and shows the four most recent qualifying seasons per
player in descending order.

## Source

Extracted from: `docs/agents/pages/players/compare.md`

## Implementation

**Component:** `lib/shared-components/src/features/players/PlayerComparison.tsx`

The feature is rendered by two internal sub-components:

### `SeasonBattingBlock`

Responsible for rendering a single player's season breakdown block (both the
batting table and, when applicable, the pitching table). Receives:

- `player` — `SelectedPlayer` (id, name, position)
- `accentIndex` — 0–3, selects the slot color from `PLAYER_ACCENTS`
- `data` — `GetAllPlayerSeasonStatsQuery | undefined`
- `loading` — boolean; shows a spinner while the season stats query is in flight

**Data fetching:** the parent `PlayerComparison` calls
`useGetAllPlayerSeasonStatsQuery` once per slot (four fixed hook calls, skipped
when the slot is empty). Results are threaded down as `slotStats[idx].data`.

**Query:** `lib/shared-components/src/api/db/getAllPlayerSeasonStats.query.graphql`
— variables: `{ playerId: Int! }`

**Batting table** — shown when `playerSeasonBatting` has rows with `atBats > 0`.
Columns: `SEASON_BATTING_HEADERS = ['Year', 'G', 'PA', 'AB', 'H', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG']`

**Pitching table** — shown when `playerSeasonPitching` has rows with
`inningsPitched > 0`. Rendered below the batting table with a "Pitching" label.
Columns: `SEASON_PITCHING_HEADERS = ['Year', 'G', 'W', 'L', 'ERA', 'IP', 'SO', 'BB', 'WHIP']`

**"4 most recent seasons"** — both batting and pitching row arrays are sorted
descending by `season` and sliced to the first four entries before rendering.

**Color coding** — the block's top border and player name render in the
per-slot accent color (`PLAYER_ACCENTS = [BRAND_GOLD, '#60A5FA', '#34D399', '#F87171']`).
Column header text color is `TEXT_MUTED`; data cells use `WHITE` except the year
column which uses the accent color.

### `SeasonRow` / `SeasonCell`

Helper components that emit proper `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>`
host elements on web via the Tamagui `tag` prop (keeping `role` for native
screen readers). Header cells carry `scope="col"`.

### Placement in `PlayerComparison`

When `activePlayers.length >= 2`, the parent renders a "Season by Season"
`SectionHead` followed by one `SeasonBattingBlock` per filled slot (in slot
order, nulls skipped). When exactly one player is selected, the breakdown also
renders below the `OnePlayerNudge` to preview the player's seasons.

## Test Coverage

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/player-comparison-stats-charts.spec.ts`

`describe('Player Comparison – season-by-season breakdown @regression')`:

- `'shows Season by Season heading'`
  — asserts the `SectionHead` with text "Season by Season" is visible after
  adding two players.
- `'shows Batting by Season table for Judge'`
  — asserts `getByRole('table', { name: 'Season batting for Aaron Judge' })` is
  visible.
- `'shows Batting by Season table for Ohtani'`
  — asserts `getByRole('table', { name: 'Season batting for Shohei Ohtani' })` is
  visible.
- `'shows Pitching by Season table for Ohtani'`
  — asserts `getByRole('table', { name: 'Season pitching for Shohei Ohtani' })` is
  visible (Ohtani has `playerSeasonPitching` data in the mock).
- `'does NOT show Pitching by Season table for Judge (non-pitcher)'`
  — asserts no pitching table with name "Season pitching for Aaron Judge" is
  visible.
- `'season batting table shows column headers (Year, G, AB, H, HR, etc.)'`
  — asserts that the "Year", "AB", and "AVG" header cells are present.
- `'Ohtani season batting table contains 2021 season row data'`
  — asserts the "2021" year cell is visible in the breakdown.
- `'Ohtani season pitching table shows pitching headers'`
  — scopes to the Ohtani pitching table and asserts "ERA", "SO", and "WHIP"
  column headers are visible.

All season-stats requests are intercepted by `mockGraphQL`, which returns
`MOCK_JUDGE_SEASON_BATTING` for player id 1 and `MOCK_SEASON_BATTING` +
`MOCK_SEASON_PITCHING` for player id 2 (Ohtani), enabling deterministic
per-season row assertions.

## Related

- **Epic:** LS-5286 — QA — Page: Player Comparison
- **Implementation ref:** `docs/agents/pages/players/compare.md`
- **Shared component:** `lib/shared-components/src/features/players/PlayerComparison.tsx`
- **GraphQL query:** `lib/shared-components/src/api/db/getAllPlayerSeasonStats.query.graphql`

# Feature: View Mode Tabs (Combined / Hitters / Pitchers)

**Jira:** LS-5601
**Page:** `player-stats` (Epic LS-5288)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Toggle between three mutually exclusive views of the player stats table:

| Tab      | Batting grid | Pitching grid | Batting query filter |
| -------- | ------------ | ------------- | -------------------- |
| Combined | ✅ shown     | ✅ shown      | none                 |
| Hitters  | ✅ shown     | ❌ hidden     | `playerType: hitter` |
| Pitchers | ❌ hidden    | ✅ shown      | none                 |

The `Combined` tab is the default. Selecting a tab updates the URL via `onFiltersChange`
(`view=combined|hitters|pitchers`) so the active mode survives page refresh and
deep-linking. Only the visible tab(s) contribute rows to the export payload
(`onVisibleRowsChange`).

## Source

Extracted from: `docs/agents/pages/players/stats.md`

## Implementation

### Shared component

**Shell:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`

- **State:** `const [viewMode, setViewMode] = useState<'combined' | 'hitters' | 'pitchers'>(() => normalizeViewMode(initialViewMode))`
- **Visibility flags** (line ~960):
  ```ts
  const showBatting = viewMode === 'combined' || viewMode === 'hitters';
  const showPitching = viewMode === 'combined' || viewMode === 'pitchers';
  ```
- **Tab strip** (line ~1308): rendered as `role="tablist"` with three `role="tab"` pressables.
  Each tab carries `aria-selected={viewMode === id}` and calls `handleViewModeChange(id)` on press.
  The selected tab receives a `BRAND_NAVY` background fill; unselected tabs are transparent.
- **Content** (lines ~2028–2074): `{showBatting && <PlayerStatsDataGrid title="MLB Career Batting Leaders" … />}` and
  `{showPitching && <PitchingStatsDataGrid title="MLB Career Pitching Leaders" … />}`.
  Both are wrapped in `<TabContentFade>` to crossfade on switch (140 ms, reduced-motion honoured).
- **`battingPlayerTypeForViewMode`** (pure function): returns `'hitter'` in Hitters mode so the
  batting query filters out pitchers; returns `undefined` in Combined and Pitchers modes.

### Grids

| Grid     | Component               | Title                         |
| -------- | ----------------------- | ----------------------------- |
| Batting  | `PlayerStatsDataGrid`   | "MLB Career Batting Leaders"  |
| Pitching | `PitchingStatsDataGrid` | "MLB Career Pitching Leaders" |

Column sets are fixed per grid (see `CAREER_STATS_COLUMNS` / `PITCHING_STATS_COLUMNS`) — they do not
change based on the active tab, only on which grid is rendered.

### Web host

`apps/web/src/pages/players/PlayerStatsPage.tsx` — reads `view` from `URLSearchParams` and passes
it as `initialViewMode` to `PlayerStatsPage`. Writes back via `onFiltersChange` using
`setSearchParams`.

### Animation

`TabContentFade` wraps each grid. On web, a `ps-tabContent` CSS keyframe triggers a 140 ms
fade-in whenever the component remounts (the grid is keyed by `battingKey` / `pitchingKey` which
increment on tab switch). Native uses `Animated.timing` on the UI thread. Both paths honour
`prefers-reduced-motion` / OS Reduce Motion.

## Variants

### Variant: `combined`

**Branch:** `viewMode === 'combined'` (default on page load).

Both `PlayerStatsDataGrid` ("MLB Career Batting Leaders") and `PitchingStatsDataGrid`
("MLB Career Pitching Leaders") are rendered. The `playerType` filter is `undefined` so all
batters appear in the batting grid regardless of position. Page size capped to 50 rows (Combined
max) to prevent 200-row single paint at `pageSize=100` (PST-030 / LS-7117).

### Variant: `hitters`

**Branch:** `viewMode === 'hitters'`.

Only `PlayerStatsDataGrid` is rendered. Batting query applies `playerType: 'hitter'` (via
`battingPlayerTypeForViewMode`) to exclude pitchers from the hitter-oriented stats view (PST-010 /
LS-7145). `PitchingStatsDataGrid` is unmounted — the "MLB Career Pitching Leaders" heading and all
pitcher rows are absent from the DOM.

### Variant: `pitchers`

**Branch:** `viewMode === 'pitchers'`.

Only `PitchingStatsDataGrid` is rendered. `PlayerStatsDataGrid` is unmounted — the
"MLB Career Batting Leaders" heading and all hitter rows are absent from the DOM.

## URL Persistence

The active tab is round-tripped via the `view` query param (`combined` / `hitters` / `pitchers`).
`normalizeViewMode` coerces unknown values (including legacy aliases `batting` / `pitching`)
to `combined` (PST-111 / LS-7146). `buildShareUrl` encodes the current tab into the share URL.

## Test Coverage

**Status: covered by hermetic E2E tests (LS-5601).**

Tests live in `apps/web-e2e/src/tests/player-stats-mocked.spec.ts` under the describe block
`'Player Stats Page (mocked) — view-mode tabs @regression'`.

Coverage:

- Combined tab: both "MLB Career Batting Leaders" and "MLB Career Pitching Leaders" headings visible.
- Hitters tab: batting leaders heading visible; pitching leaders heading NOT in DOM; HR column header present; ERA column header absent.
- Pitchers tab: pitching leaders heading visible; batting leaders heading NOT in DOM; ERA column header present; HR column header absent.
- Tab aria-selected state transitions (Combined → Hitters → Pitchers → Combined).

## Related

- **Epic:** LS-5288 — QA — Page: Player Stats
- **Shell:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`
- **Batting grid:** `lib/shared-components/src/features/players/PlayerStatsDataGrid.tsx`
- **Pitching grid:** `lib/shared-components/src/features/players/PitchingStatsDataGrid.tsx`
- **Web host:** `apps/web/src/pages/players/PlayerStatsPage.tsx`
- **Reference doc:** `docs/agents/pages/players/stats.md`
- **Known bug (fixed):** LS-7145 — Hitters tab did not exclude pitchers from batting grid before `battingPlayerTypeForViewMode` was introduced
- **Known bug (fixed):** LS-7146 — `normalizeViewMode` aliases for `pitching`/`batting` in URL were not normalised at parse time
- **Known bug (fixed):** LS-7147 — tab switch animation absent on mobile

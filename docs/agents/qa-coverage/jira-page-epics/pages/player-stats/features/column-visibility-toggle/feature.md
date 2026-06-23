# Feature: Column Visibility Expand/Collapse

**Jira:** LS-5590
**Page:** `player-stats` (Epic LS-5288)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Expand or collapse stat columns in the Player Stats table to control table density.
Users open the column picker via a "Columns" toolbar button, then toggle individual
stat columns on or off. The visible set is persisted to both the URL (`?cols=`) and
`localStorage` so it survives reload and can be shared as a deep link.

When no explicit selection exists, the table falls back to the `statsFormat` preset
(`standard` shows only high-priority columns; `expanded` shows all). On the first
toggle, the preset is materialized into an explicit selection, then the toggled key
is added or removed. A "Reset columns" link restores the selection back to the
preset baseline.

The name column (Player) is always visible and is never shown in the picker.

## Source

Extracted from: `docs/agents/pages/players/stats.md` (row: "Column visibility —
Expand/collapse columns")

## Implementation

### Shared component (web + native)

**Core helpers:**
`lib/shared-components/src/features/players/columnVisibility.ts`

| Function                  | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `resolveVisibleColumns`   | Filters a grid's column array to the visible set (explicit or preset)        |
| `buildToggleableColumns`  | Builds the de-duplicated picker list from both grids (name columns excluded) |
| `presetVisibleKeys`       | Returns the preset-visible keys across all grids for a given `statsFormat`   |
| `toggleColumnKey`         | Materializes the preset and adds/removes a single key                        |
| `serializeVisibleColumns` | Encodes the selection for URL / storage (`null` → omit, `[]` → `none`)       |
| `parseVisibleColumns`     | Parses and validates the URL/storage value against the real column set       |

**UI — toolbar button and inline picker panel:**
`lib/shared-components/src/features/players/PlayerStatsPage.tsx`

- `column-picker-toggle` (`Pressable`, `testID="column-picker-toggle"`) — "Columns"
  button in the filter toolbar. Gains a gold accent border and background when an
  explicit selection exists (`isColumnCustomized`).
- `ColumnPickerPanel` (`testID="column-picker-panel"`) — inline panel beneath the
  toolbar listing every toggleable column as a checkbox row. Each row:
  `testID="column-toggle-${col.key}"`, `accessibilityRole="checkbox"`.
- "Reset columns" link — only visible when a custom selection exists;
  `testID="column-picker-reset"`, `accessibilityLabel="Reset columns to default"`.
- Shared key `strikeouts` appears once in the picker; a single toggle controls it
  across both batting and pitching grids simultaneously.

**Column sets (priorities determine the standard preset):**

_Batting_ (`CAREER_STATS_COLUMNS`):

| Key                           | Label  | Priority              |
| ----------------------------- | ------ | --------------------- |
| `displayName`                 | Player | high (always visible) |
| `games`                       | G      | medium                |
| `plateAppearances`            | PA     | medium                |
| `atBats`                      | AB     | medium                |
| `hits`                        | H      | high                  |
| `homeRuns`                    | HR     | high                  |
| `rbi`                         | RBI    | high                  |
| `stolenBases`                 | SB     | medium                |
| `runs`                        | R      | medium                |
| `doubles`                     | 2B     | low                   |
| `triples`                     | 3B     | low                   |
| `baseOnBalls`                 | BB     | low                   |
| `strikeouts`                  | SO     | low                   |
| `formattedBattingAverage`     | AVG    | high                  |
| `formattedOnBasePercentage`   | OBP    | high                  |
| `formattedSluggingPercentage` | SLG    | high                  |
| `offensiveWAR`                | oWAR   | high                  |

_Pitching_ (`PITCHING_STATS_COLUMNS`):

| Key                  | Label  | Priority              |
| -------------------- | ------ | --------------------- |
| `playerName`         | Player | high (always visible) |
| `formattedPositions` | Pos    | medium                |
| `games`              | G      | medium                |
| `wins`               | W      | high                  |
| `losses`             | L      | high                  |
| `era`                | ERA    | high                  |
| `gamesStarted`       | GS     | medium                |
| `completeGames`      | CG     | low                   |
| `shutouts`           | SHO    | medium                |
| `saves`              | SV     | medium                |
| `strikeouts`         | SO     | high                  |
| `baseOnBalls`        | BB     | medium                |
| `hits`               | H      | medium                |

### Web host (URL + localStorage persistence)

`apps/web/src/pages/players/PlayerStatsPage.tsx`

- `readVisibleColumnsPref()` — reads `ls_user_preferences.statsVisibleColumns` from
  localStorage, parsed and validated against `STATS_TOGGLEABLE_COLUMN_KEYS`.
- `writeVisibleColumnsPref(cols)` — merges the selection into the shared prefs
  object without clobbering `statsFormat` or `defaultSport`.
- `handleVisibleColumnsChange(cols)` — updates React state, calls
  `writeVisibleColumnsPref`, and writes `?cols=` to the URL via `setSearchParams`
  (`replace: true` so column toggles don't stack history entries).
- `parseStatsSearchParams` — reads `?cols=` via `parseVisibleColumns` on page load;
  validated against `STATS_TOGGLEABLE_COLUMN_KEYS` so hand-edited or stale keys are
  silently dropped.
- Initial state seeds from the `cols` URL param first, then falls back to
  `readVisibleColumnsPref()`, then falls back to `null` (statsFormat preset).

**URL param:** `cols=hits,homeRuns,rbi,…` (comma-separated) or `cols=none`
(explicit empty — only the name column shows).

## Variants

### Variant: `preset-standard`

**Branch:** `visibleColumns === null` and `statsFormat === 'standard'`.

No explicit selection exists. The table shows only high-priority columns:
_batting_: Player, H, HR, RBI, AVG, OBP, SLG, oWAR.
_pitching_: Player, W, L, ERA, SO (shared key from pitching-high set).

The Columns button shows no gold accent (no customization). The "Reset columns"
link is hidden.

### Variant: `preset-expanded`

**Branch:** `visibleColumns === null` and `statsFormat === 'expanded'`.

All stat columns are shown across both grids. The Columns button has no gold accent.
"Reset columns" is hidden. This is the baseline for users who have set the expanded
preference on the `/preferences` page.

### Variant: `custom-selection`

**Branch:** User opens the picker and toggles at least one column.

On the first toggle the current preset keys are materialized into an explicit
selection, then the toggled key is removed (if it was visible) or added (if it was
hidden). Subsequent toggles update the same explicit selection directly.

The Columns button gains a gold accent border and background. The "Reset columns"
link becomes visible in the picker header. The selection is immediately written to
`?cols=` (replace history) and `localStorage`.

### Variant: `explicit-none`

**Branch:** User unchecks every toggleable column; `visibleColumns === []`.

Serialized as `cols=none` in the URL and localStorage. Only the always-visible
Player name column is shown in each grid. The picker panel shows all columns
unchecked. "Reset columns" is visible.

### Variant: `url-deep-link-restore`

**Branch:** Page loads with a `?cols=` param already in the URL (e.g. from a
shared link or a browser reload after a toggle session).

`parseStatsSearchParams` reads and validates the `cols` value against
`STATS_TOGGLEABLE_COLUMN_KEYS`; unknown keys are silently dropped. The parsed
array seeds `visibleColumns` state directly, bypassing the localStorage fallback
path. The grid renders with the specified columns visible on first paint.

### Variant: `localstorage-restore`

**Branch:** Page loads with no `?cols=` param, but
`ls_user_preferences.statsVisibleColumns` exists in localStorage.

`readVisibleColumnsPref()` returns the persisted selection. The page opens with the
user's last-used column set without any URL param, so the address bar stays clean.
If the stored value is stale (unknown keys), `parseVisibleColumns` drops them; the
result is `null` (treated as preset) if every key was invalid.

### Variant: `reset`

**Branch:** User clicks "Reset columns" (only visible when `isColumnCustomized`).

`handleResetColumns()` sets `visibleColumns` to `null` and fires
`onVisibleColumnsChange(null)`. The host clears `?cols=` from the URL and writes
`null` to localStorage (`statsVisibleColumns` key is removed from the prefs object).
The table immediately reverts to the `statsFormat` preset. The Columns button loses
its gold accent and "Reset columns" is hidden.

## Test Coverage

### Unit tests — core helpers

File: `lib/shared-components/src/features/players/columnVisibility.spec.ts`

`describe('isPresetVisible')`:

- Shows only high-priority columns under the standard preset
- Shows every column under the expanded preset

`describe('resolveVisibleColumns')`:

- Falls back to the standard preset (high only) when no selection is given
- Falls back to all columns under the expanded preset
- Honors an explicit selection and overrides the preset
- Always keeps the name column even when the selection omits it
- Ignores selected keys that are not real columns of this grid

`describe('buildToggleableColumns')`:

- Excludes name columns and de-duplicates shared keys (first label wins)

`describe('presetVisibleKeys')`:

- Returns high-priority keys across both grids under standard (any-grid semantics)
- Returns every non-name key under expanded, de-duplicated

`describe('toggleColumnKey')`:

- Materializes from the preset and removes a visible key on first toggle
- Materializes from the preset and adds a hidden key on first toggle
- Toggles within an existing explicit selection without touching others
- Supports emptying the selection entirely

`describe('serializeVisibleColumns / parseVisibleColumns')`:

- Serializes null to null (so the caller omits the key)
- Serializes an explicit empty selection to the sentinel
- Serializes a non-empty selection as a comma list
- Parses an absent/empty value to null
- Parses the sentinel to an explicit empty selection
- Drops unknown and duplicate keys while preserving order
- Returns null when every token is invalid
- Round-trips an explicit selection through serialize → parse
- Round-trips the explicit empty selection (sentinel)

### Unit tests — web host (URL + localStorage)

File: `apps/web/src/pages/players/PlayerStatsPage.spec.ts`

Covered under `parseStatsSearchParams` roundtrip tests — `visibleColumns` field is
parsed from the `cols` URL param. `readVisibleColumnsPref` and
`writeVisibleColumnsPref` are exercised indirectly but have no dedicated spec block.

### E2E tests

**Status: not yet covered by a hermetic E2E test.** Per the [QA-coverage
model](../../../../README.md), a Feature Story is "covered" only when a passing,
hermetic Playwright E2E test in `apps/web-e2e/src/tests/` asserts the user-facing
journey. No spec yet drives the column picker UI. Recommended coverage:

- Open the picker (`testID="column-picker-toggle"`) and assert the panel appears.
- Toggle a column off (`testID="column-toggle-homeRuns"`) and confirm the HR header
  disappears from the batting grid.
- Toggle the same column back on and confirm it reappears.
- Verify the "Reset columns" link is visible after a toggle and hidden before.
- Click "Reset columns" and assert the HR header is visible again.
- Assert `?cols=` is written to the URL after a toggle.
- Load the page with `?cols=hits,homeRuns,rbi` and verify only those columns show.
- Load the page with `?cols=none` and verify only the Player name column shows.

## Related

- **Epic:** LS-5288 — QA — Page: Player Stats
- **Core helpers:** `lib/shared-components/src/features/players/columnVisibility.ts`
- **Shared component UI:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`
  — `ColumnPickerPanel`, `column-picker-toggle`, `handleToggleColumn`, `handleResetColumns`
- **Web host persistence:** `apps/web/src/pages/players/PlayerStatsPage.tsx`
  — `readVisibleColumnsPref`, `writeVisibleColumnsPref`, `handleVisibleColumnsChange`
- **URL serialization helpers:** `serializeVisibleColumns`, `parseVisibleColumns` (exported
  from `@legacy-sports/shared-components/players`)
- **Column key list:** `STATS_TOGGLEABLE_COLUMN_KEYS` (exported from
  `@legacy-sports/shared-components/players`)

# Feature: Stats Format User Preference

**Jira:** LS-5599
**Page:** `player-stats` (Epic LS-5288)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The Player Statistics page reads a `statsFormat` preference (`standard` | `expanded`)
from `localStorage` and applies it to the column preset shown in the batting and
pitching data grids. The preference is seeded on page load and **re-read every time
the window gains focus**, so a user who changes the setting on `/preferences` and
navigates back picks up the new value without a full reload.

`standard` shows only **high-priority** columns (H, HR, RBI, AVG, OBP, SLG, oWAR
for batting). `expanded` adds all medium- and low-priority columns (G, PA, AB, SB,
R, 2B, 3B, BB, SO for batting), giving a complete stat line.

## Source

Extracted from: `docs/agents/pages/players/stats.md` — _Stats Format_ section.

## Implementation

**Storage key:** `ls_user_preferences` (JSON object, key `statsFormat`)

- `"standard"` — high-priority batting/pitching columns only
- `"expanded"` — all columns (default when key is absent or JSON is corrupt)

**Host file:** `apps/web/src/pages/players/PlayerStatsPage.tsx`

| Symbol                                                          | Role                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `readStatsFormat()` (line ~556)                                 | Reads `statsFormat` from `localStorage`; falls back to `"standard"` on missing key, invalid JSON, or unknown value |
| `useState(readStatsFormat)` (line ~985)                         | Seeds component state once on mount                                                                                |
| `useEffect` → `window.addEventListener('focus', …)` (line ~990) | Re-reads preference on every page-focus event                                                                      |
| `<PlayerStatsPage statsFormat={statsFormat} …>` (line ~1482)    | Passes current preference down to the shared shell                                                                 |

**Shared shell:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`
— forwards `statsFormat` to `PlayerStatsDataGrid` (batting) and `PitchingStatsDataGrid`
(pitching), each of which derives `displayColumns` via `resolveVisibleColumns(…, statsFormat, visibleColumns, nameKey)`.

**Column-visibility interplay:** an explicit per-column selection stored under
`ls_user_preferences.statsVisibleColumns` (written by the column picker) takes
precedence over `statsFormat`. When `statsVisibleColumns` is absent or `null`,
`statsFormat` fully controls the visible set.

## Variants

### Variant: `standard`

**Trigger:** `ls_user_preferences.statsFormat === "standard"` in localStorage
(or key absent / JSON corrupt → falls back to `"standard"`).

Batting grid shows high-priority columns only: **Player, H, HR, RBI, AVG, OBP, SLG, oWAR**.
Medium-priority columns (G, PA, AB, SB, R) and low-priority columns (2B, 3B, BB, SO)
are absent from the DOM.

### Variant: `expanded`

**Trigger:** `ls_user_preferences.statsFormat === "expanded"` in localStorage.

Batting grid shows all columns: **Player, G, PA, AB, H, HR, RBI, SB, R, 2B, 3B,
BB, SO, AVG, OBP, SLG, oWAR**.

### Variant: `on-focus-refresh`

**Trigger:** User changes `statsFormat` on `/preferences`, then returns to
`/players/stats` (giving the window focus). No page reload required.

The `window.focus` event handler calls `readStatsFormat()` and updates state,
re-rendering the grids with the new column preset in the same session.

### Variant: `corrupt-fallback`

**Trigger:** `ls_user_preferences` contains invalid JSON (browser-extension
corruption, manual DevTools edit).

`readStatsFormat()` catches the `JSON.parse` exception, logs a `LOGGER.warn`,
and returns `"standard"`. The page renders without error.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/player-stats-format-preference.spec.ts`

`describe('Player Stats — Stats Format Preference @regression')`:

- **standard-default**: absent `ls_user_preferences` → medium-priority `G` column
  header is absent; high-priority `AVG` header is visible
- **standard-explicit**: `statsFormat: "standard"` in localStorage → `G` absent,
  `AVG` visible; `PA` header absent
- **expanded-explicit**: `statsFormat: "expanded"` in localStorage → `G` visible,
  `AVG` visible, `PA` visible
- **on-focus-refresh**: starts with `standard`, updates localStorage to `expanded`,
  emits `window.focus` → `G` column appears without reload
- **corrupt-fallback**: `ls_user_preferences` set to invalid JSON → page loads
  without error banner, renders standard column set (`G` absent)
- **statsVisibleColumns-overrides-statsFormat**: explicit `statsVisibleColumns`
  in localStorage overrides `statsFormat` (column-picker selection wins)

## Related

- **Epic:** LS-5288 — QA — Page: Player Stats
- **Source doc:** `docs/agents/pages/players/stats.md` — _Stats Format_ section
- **Host:** `apps/web/src/pages/players/PlayerStatsPage.tsx` — `readStatsFormat`, `PlayerStatsRoute`
- **Shared shell:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`
- **Column visibility:** `lib/shared-components/src/features/players/columnVisibility.ts` — `presetVisibleKeys`, `resolveVisibleColumns`, `isPresetVisible`
- **Preferences page:** `apps/web/src/pages/preferences/PreferencesPage.tsx` — where the user changes `statsFormat`

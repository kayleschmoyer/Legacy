# Feature: URL-Persisted Filter State

**Jira:** LS-5600
**Page:** `player-stats` (Epic LS-5288)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

All active filter controls on the Player Statistics page are persisted as URL
query parameters so that any filtered view is bookmarkable, shareable, and
survives a page reload. When a user returns to a previously shared URL, the page
restores the exact filter state — view mode, page size, search term, dropdowns,
and all stat range min/max values — without requiring any manual re-entry.

Covered filter keys:

| Param                             | Values                        |
| --------------------------------- | ----------------------------- |
| `v`                               | URL schema version (e.g. `1`) |
| `view`                            | combined / hitters / pitchers |
| `pageSize`                        | 10 / 25 / 50 / 100            |
| `searchTerm`                      | free-text player name query   |
| `position`                        | e.g., `SS`                    |
| `team`                            | e.g., `NYY`                   |
| `playerType`                      | hitter / pitcher / all        |
| `minHomeRuns` / `maxHomeRuns`     | HR career range               |
| `minRBI` / `maxRBI`               | RBI career range              |
| `minBattingAvg` / `maxBattingAvg` | AVG range (3 decimal places)  |
| `minERA` / `maxERA`               | ERA range (2 decimal places)  |
| `minWins` / `maxWins`             | Wins career range             |
| `minStrikeouts` / `maxStrikeouts` | SO career range               |
| `sortBy` / `sortDir`              | batting sort column + order   |
| `cols`                            | per-column visibility preset  |
| `playerId`                        | selected player deep-link     |

All numeric values are clamped to `MAX_GRAPHQL_INT = 2,147,483,647`. Keys are
written in deterministic alphabetical order so identical filter states produce
byte-identical URLs (important for CDN caching and back-button deduplication).

## Source

Extracted from: `docs/agents/pages/players/stats.md`

## Implementation

### Web

**Host component:** `apps/web/src/pages/players/PlayerStatsPage.tsx`

All URL serialization and deserialization runs inside the web host. The shared
`PlayerStatsPage` component (in `lib/shared-components`) owns the UI and calls
host-provided callbacks; the host translates those callbacks into
`setSearchParams` / `navigate` calls.

#### `buildStatsSearchParams(state)` (line ~243)

Serializes a committed filter snapshot into a `URLSearchParams` object.
Written keys must be the exact superset of what `parseStatsSearchParams` reads —
a mismatch makes the roundtrip lossy (PST-040 / LS-7120). Highlights:

- Stamps `v=1` (current `URL_SCHEMA_VERSION`) so bookmarks are upgradeable.
- AVG uses `.toFixed(3)`; ERA uses `.toFixed(2)` per the param contract.
- Keys are sorted alphabetically before return (PST-104 / LS-7144).
- `cols` is written only when an explicit column selection exists (sentinel
  `none` encodes "hide all" so it round-trips distinctly from "no selection").
- `playerId` threads the open player-detail deep link through filter commits.

#### `parseStatsSearchParams(searchParams)` (line ~354)

Inverse of `buildStatsSearchParams`. Returns `{ viewMode, pageSize, search, filters, visibleColumns }`.
Runs `migrateStatsSearchParams` first so unversioned / old-schema URLs upgrade
transparently. Integer params pass through `parseClampedInt` (clamp + LOGGER
warn on MAX_GRAPHQL_INT overflow — PST-102 / LS-7142). String filter values
pass through `sanitizeSearchParam` (strip control chars, cap at 64 chars —
PST-062 / LS-7129).

#### `migrateStatsSearchParams(input)` (line ~171)

Upgrades an incoming `URLSearchParams` snapshot to the current schema version.
Reads the `v` flag (absent → version 0, a.k.a. pre-versioning), iterates
`SCHEMA_MIGRATIONS` up to `URL_SCHEMA_VERSION`, and stamps the result. Unknown
or garbage `v` values are treated as legacy; a future version is left untouched
(forward-compatible). Prevents old bookmarks from breaking silently (PST-101 /
LS-7141).

#### `URL_SCHEMA_VERSION` / `SCHEMA_MIGRATIONS` (line ~124 / ~141)

`URL_SCHEMA_VERSION = 1`. `SCHEMA_MIGRATIONS` is an array of key-rename maps,
one entry per schema step. The v0 → v1 entry is an empty rename map (no keys
changed). Adding a new entry + bumping the version is the only approved path for
breaking param changes — never edit existing entries.

#### Wiring in the component (line ~900+)

`useSearchParams` supplies the live `URLSearchParams` object.
`parseStatsSearchParams(searchParams)` produces the initial filter/view/page state
(memoised on `searchParams`). `onFiltersChange` and `onViewModeChange` callbacks
call `buildStatsSearchParams` and pass the result to `setSearchParams`, keeping
the URL in sync with every committed filter change.

### Mobile (Android / iOS)

**Screen:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerStats.tsx`

Uses `useLocalSearchParams` (expo-router) instead of React Router's
`useSearchParams`. Key differences from the web host:

- `parseStatsParams(params)` (line ~120) — reads expo-router's
  `useLocalSearchParams()` result (an object of string values, not a
  `URLSearchParams` instance). Mirrors the web parser's filter semantics.
- `buildStatsParams(state)` (line ~177) — returns a plain `Record<string, string>` for
  `router.setParams`. Cleared filters are written as `''` to overwrite
  previously-set values (expo-router's `setParams` shallow-merges; there is no
  delete). Mobile param coverage is narrower than web — the full key set
  (`minRBI`, `maxRBI`, `minBattingAvg`, `maxBattingAvg`, `minWins`, etc.) is
  read but the serializer only writes a core subset.
- Mobile numeric formatting matches the web contract (3 decimals for AVG, 2 for ERA)
  so a deep link shared from mobile opens identically in the web browser.
- No `v` schema-version flag or migration layer on mobile — filter keys are not
  renamed across versions in the native param surface.

## Test Coverage

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/player-stats-url-persistence.spec.ts`

`describe('Player Stats — URL-persisted filter state @regression')`:

- `'restores Hitters view mode from ?view=hitters'`
  — navigates to `/players/stats?v=1&view=hitters`, asserts the Hitters tab
  carries `aria-selected="true"`.
- `'restores Pitchers view mode from ?view=pitchers'`
  — navigates to `/players/stats?v=1&view=pitchers`, asserts the Pitchers tab
  is selected.
- `'defaults to Combined view when no view param present'`
  — navigates to `/players/stats` (no `view` param), asserts the Combined tab
  is selected.
- `'restores search term from ?searchTerm param'`
  — navigates to `/players/stats?v=1&searchTerm=Bond`, asserts the search
  input's value is `Bond`.
- `'URL updates when switching from Combined to Hitters'`
  — navigates to `/players/stats`, switches to the Hitters tab, waits for the
  URL to contain `view=hitters`.
- `'URL round-trip: switch view, reload, assert tab is restored'`
  — navigates to `/players/stats`, switches to Hitters, captures the URL,
  navigates to that URL, and asserts the Hitters tab is still selected
  (full bookmarkable-deep-link round-trip).
- `'legacy unversioned URL is migrated and rendered correctly'`
  — navigates to `/players/stats?view=hitters` (no `v` param, pre-versioning
  URL), asserts Hitters tab is selected (migration layer is transparent).

All GraphQL requests are intercepted with `mockPlayerStatsGraphQL`, keeping
tests hermetic and deterministic across CI runs.

## Related

- **Epic:** LS-5288 — QA — Page: Player Stats
- **Implementation ref:** `docs/agents/pages/players/stats.md` — URL-Persisted State section
- **Web host:** `apps/web/src/pages/players/PlayerStatsPage.tsx`
  (`buildStatsSearchParams`, `parseStatsSearchParams`, `migrateStatsSearchParams`)
- **Mobile screen:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerStats.tsx`
  (`parseStatsParams`, `buildStatsParams`)
- **Bug (roundtrip lossy):** LS-7120 — PST-040: URL roundtrip was asymmetric for pitcher filters
- **Bug (migration):** LS-7141 — PST-101: old URLs broke silently without migration shim
- **Bug (overflow clamp):** LS-7142 — PST-102: MAX_GRAPHQL_INT clamp with no user warning
- **Bug (mobile no persistence):** LS-7143 — PST-103: mobile had no URL persistence (fixed)
- **Bug (unordered keys):** LS-7144 — PST-104: URL keys were unordered, breaking caching

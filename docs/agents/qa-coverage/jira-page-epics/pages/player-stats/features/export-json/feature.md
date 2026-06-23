# Feature: Export Stats as JSON

**Jira:** LS-5591
**Page:** `player-stats` (Epic LS-5288)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Download the current filtered player statistics result set as a JSON file. The
export captures the visible rows (batting and pitching grids) alongside the
active filter snapshot so the file is self-describing. A sr-only live region
announces the export status for assistive-technology users, and an oversized
payload (> 5 MB) is refused with an explanatory message so the main thread is
never blocked by an unbounded `JSON.stringify` + `Blob`.

## Source

Extracted from: `docs/agents/pages/players/stats.md`

## Implementation

### Web

**Export handler (web host):**
`apps/web/src/pages/players/PlayerStatsPage.tsx` — `PlayerStatsRoute.handleExport`
receives `(filters, viewMode)` from the shared shell, serializes the visible rows
via `buildExportPayload`, gates the download on the 5 MB size cap (`MAX_EXPORT_BYTES`),
and triggers a synthetic `<a download>` click. The object URL is revoked in a
`finally` block so concurrent or error-path exports never leak URLs
(LS-7660 / GAP-002).

**Payload builder:**
`apps/web/src/pages/players/PlayerStatsPage.tsx` — `buildExportPayload` serializes
the player rows under `players.batting` / `players.pitching` alongside the filter
context (`viewMode`, `filters`, `exportedAt`, `totalFilters`, `rowCount`).
`exportedAt` is injectable so the serialization is deterministic under test.
Size is measured in UTF-8 bytes via `utf8ByteLength` (not string length) so
multi-byte characters such as player names with diacritics are counted at their
real byte cost, matching the actual `Blob` size.

**Visible-rows capture:**
`PlayerStatsRoute` holds an `exportDataRef` updated by the shared shell's
`onVisibleRowsChange` callback so `handleExport` always serializes the rows the
user is currently looking at, not a stale snapshot (PST-011 / LS-7109).

**Download filename:**
`player-stats-<viewMode>-<YYYY-MM-DD>.json`. `viewMode` is sanitized through
`sanitizeFilenameSegment` before interpolation (strips everything outside
`[a-z0-9-]`) so an arbitrary value cannot inject slashes or dot-segments into
the download path (PST-013).

**Canary prop:**
The shared shell's `canExport` prop governs whether the Export button is rendered.
The web host passes `canExport={true}` so the button is always visible (entitlement
`all`).

### Variants

#### Variant: `download-success`

**Branch:** Serialized payload is within the 5 MB cap (`MAX_EXPORT_BYTES`).

Downloads `player-stats-<viewMode>-<YYYY-MM-DD>.json`. Announces
**"Player statistics exported. Download started."** via the sr-only live region
and the visible toast (auto-dismissed after `TOAST_DURATION_MS` = 2400 ms).

#### Variant: `oversized-payload`

**Branch:** Serialized payload exceeds `MAX_EXPORT_BYTES` (5 MB).

The download is refused. Announces **"Export is too large to download here.
Narrow your filters and try again."** via the live region and toast. No file is
downloaded; no object URL is created.

## File Shape

The exported JSON has the following top-level structure:

```json
{
  "viewMode": "hitters",
  "filters": { "team": "NYY", "minHomeRuns": 30 },
  "exportedAt": "2026-06-23T00:00:00.000Z",
  "totalFilters": 2,
  "rowCount": 12,
  "players": {
    "batting": [],
    "pitching": []
  }
}
```

- `viewMode` — the active tab at export time (`combined` / `hitters` / `pitchers`).
- `filters` — the committed filter snapshot; only non-default values are present.
- `exportedAt` — ISO 8601 UTC timestamp.
- `totalFilters` — count of keys in `filters` (for quick inspection).
- `rowCount` — total rows across both grids.
- `players.batting` — `PlayerCareerStats` rows (empty when `viewMode === 'pitchers'`).
- `players.pitching` — `CareerPitchingFragment` rows (empty when `viewMode === 'hitters'`).

## Test Coverage

**Status: partially covered by unit tests.** The pure functions `buildExportPayload`,
`utf8ByteLength`, and `sanitizeFilenameSegment` are covered by unit tests in
`apps/web/src/pages/players/PlayerStatsPage.spec.ts`. The object-URL lifecycle
(create, click, revoke — including the error path) is covered by
`apps/web/src/pages/players/PlayerStatsRoute.spec.tsx` under
`"PlayerStatsRoute export object-URL cleanup"`.

No hermetic E2E test yet drives the Export button in a browser, confirms the
download starts, or asserts the exported JSON payload shape. Recommended coverage:

- **E2E (Chromium project)**: click the Export button, intercept the download event
  via Playwright's `page.waitForEvent('download')`, read the file contents, parse
  as JSON, and assert `viewMode`, `filters`, and `rowCount` are consistent with the
  active filter state.
- **Unit — toast copy**: assert the live-region message is
  `"Player statistics exported. Download started."` for a successful export and
  `"Export is too large to download here. Narrow your filters and try again."` for
  an oversized payload, exercised through the `PlayerStatsRoute` render tests.

## Related

- **Jira:** LS-5591 — Feature: Export Stats as JSON
- **Epic:** LS-5288 — QA — Page: Player Stats
- **Web host:** `apps/web/src/pages/players/PlayerStatsPage.tsx` — `handleExport`,
  `buildExportPayload`, `utf8ByteLength`, `sanitizeFilenameSegment`, `MAX_EXPORT_BYTES`
- **Shared component:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`
  — `canExport` prop, `onExport` callback, `onVisibleRowsChange` callback
- **Types:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx`
  — `PlayerStatsExportData`, exported from `@legacy-sports/shared-components/players`

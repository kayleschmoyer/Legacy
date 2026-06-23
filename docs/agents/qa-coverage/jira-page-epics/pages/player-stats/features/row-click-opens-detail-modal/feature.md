# Feature: Row Click Opens Player Detail Modal

**Jira:** LS-5595
**Page:** `player-stats` (Epic LS-5288)
**Platforms:** web, mobile-web, android
**Entitlement:** premium

## Description

Clicking any player row on the Player Statistics page opens the Player Detail
Modal with a full stat breakdown for that player. The row-click handler in the
shared component calls the host's `onPlayerDetails` callback, which on the web
host sets `?playerId=<id>` in the URL; `PlayerDetailModal` mounts and displays
the player's name, position badges, career arc, and season stats. Closing the
modal (via the × button or the Escape key) removes `?playerId` from the URL and
unmounts the modal, restoring the stats table.

## Source

Extracted from: `docs/agents/pages/players/stats.md` (Share button → Player
Detail Modal row)

## Implementation

### Web

**Shared component callback:**
`lib/shared-components/src/features/players/PlayerStatsPage.tsx`

- `handleBattingPlayerClick` (line 850): calls `onPlayerDetails(player)` when a
  hitter row is pressed.
- `handlePitchingPlayerClick` (line 861): calls `onPlayerDetails(pitcher)` when a
  pitcher row is pressed.
- Both handlers are passed as `onPlayerSelect` to `PlayerStatsDataGrid`.

**Web host handler:**
`apps/web/src/pages/players/PlayerStatsPage.tsx`

- `handlePlayerDetails` (line 1061): receives the `PlayerWithStats` object, extracts
  `playerId`, and appends `?playerId=<id>` to the current URL via
  `setSearchParams`. Integer IDs are serialised directly; string IDs (legacy
  brefId paths) use the brefId branch.
- `handleClosePlayerDetails` (line 1083): removes `playerId` from the URL params.
- `PlayerDetailModal` is rendered conditionally at line 1503:
  `{isPremium && selectedPlayerId !== null && (<PlayerDetailModal .../>)}`.
  The premium gate means unauthenticated or free-tier users do not see the modal.

**Row element:**
`lib/shared-components/src/features/players/PlayerStatsDataGrid.tsx` — each row
carries `data-testid="player-row-<playerId>"` so test selectors can target a
specific player without relying on text position.

### Mobile (mobile-web / android)

`apps/app/src/app/(app)/PlayerStats.tsx` — the `onPlayerDetails` callback
navigates to `/PlayerDetail?playerId=<id>` via Expo Router, opening a full
detail screen instead of a modal overlay.

## Variants

There are no user-facing variants for this feature. All users who can see the
stats table and who have an active premium subscription will open the modal on
row click; non-premium users see the premium gate instead.

## Test Coverage

**Status: covered.** A hermetic Playwright E2E test in
`apps/web-e2e/src/tests/player-stats-row-click-modal.spec.ts` asserts the
following journeys:

- **Row click opens modal** — clicking the Barry Bonds row (`player-row-101`)
  causes `div[role="dialog"]` to become visible.
- **Modal shows player name** — after the season stats resolve the dialog
  contains "Barry Bonds".
- **× button closes modal** — clicking the Close button removes the dialog and
  the URL no longer contains `playerId`.
- **Escape key closes modal** — pressing Escape removes the dialog and the URL
  no longer contains `playerId`.
- **URL gains playerId on open** — immediately after the row click the URL
  contains `playerId=101`.
- **URL loses playerId on close** — after the modal is dismissed the URL does
  not contain `playerId`.

## Related

- **Epic:** LS-5288 — QA — Page: Player Stats
- **Jira story:** LS-5595 — Feature: Row Click Opens Player Detail Modal
- **Web host:** `apps/web/src/pages/players/PlayerStatsPage.tsx` — `handlePlayerDetails` / `handleClosePlayerDetails`
- **Shared component:** `lib/shared-components/src/features/players/PlayerStatsPage.tsx` — `handleBattingPlayerClick` / `handlePitchingPlayerClick`
- **Data grid:** `lib/shared-components/src/features/players/PlayerStatsDataGrid.tsx` — `handleRowClick`
- **E2E spec:** `apps/web-e2e/src/tests/player-stats-row-click-modal.spec.ts`

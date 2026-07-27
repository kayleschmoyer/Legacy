# Feature: Matchup Roster Editor

**Jira:** LS-8469
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all (non-premium)

## Description

An in-context lineup editor rendered in the `rosterEditor` slot (slot 7 of 9 in
`MatchupDetailLayout`, after the matchup information card and before `recapPanel`) that lets
the owner of one of the two teams in a `Scheduled` or `InProgress` matchup swap and move their
own players between league position slots and the bench. It is gated on ownership (the viewing
user's team must be `team1Id` or `team2Id` on the matchup) and on matchup status — it renders
nothing once the matchup is `Completed`. Each swap/move mutation is preceded by a server-side
pre-flight re-check of the matchup status so a matchup that transitions to `InProgress`
mid-session is discovered and locks editing rather than allowing a stale write. Once locked
(passed in directly on native, discovered via pre-flight on web) the panel renders as a
read-only "Current Lineup" view instead of "Edit Lineup".

## Source

Extracted from code audit (Step 0.4, bucket Story LS-7595, finding GAP-002) — this panel
predates and was missed by the original page-doc-driven feature extraction that produced the
other `baseball-matchup-detail` feature docs.

## Implementation

### Web

**File:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx:262-274`

Renders `<MatchupRosterEditor matchup={matchup} userTeamId={userTeamId} leagueId={leagueIdNum} />`
inside `MatchupDetailLayout`'s `rosterEditor` slot, gated on:

- `userTeamId != null && leagueIdNum != null`
- `matchup.status === MatchupStatus.Scheduled || matchup.status === MatchupStatus.InProgress`
- `matchup.team1Id === userTeamId || matchup.team2Id === userTeamId` (the viewing user owns one
  of the two teams)

**`apps/web/src/features/matchup/MatchupRosterEditor.tsx`**

Data-fetching wrapper around the shared presentational view:

- `useGetMatchupPlayersQuery` + `useGetPositionsForLeagueQuery` fetch matchup players (filtered
  to the viewing user's `teamId`) and league position slots.
- Wires `onSwapPositions` / `onMoveToPosition` to `useSwapMatchupPlayerPositions` /
  `useUpdateMatchupPlayerPosition`, each preceded by `ensureMatchupStillScheduled()`
  (`MatchupRosterEditor.tsx:172-196`) — a lazy `GetMatchupById` re-fetch (`fetchPolicy:
network-only`) that sets `lockDiscovered` and blocks the mutation if the matchup is no longer
  `Scheduled`. A `PREFLIGHT_CACHE_TTL_MS` (5s) window skips redundant re-checks between
  consecutive edits; the server enforces the authoritative lock at mutation time regardless.
- `effectiveLocked = locked || lockDiscovered` merges the external `locked` prop with any lock
  discovered mid-session.
- Guard states: renders `null` when the matchup isn't `Scheduled`/`InProgress`, a loading
  spinner card while players/positions are in flight, and `null` when the user has no players
  in this matchup.

### Native (mobile-web / android)

**File:** `apps/app/src/features/matchup/screens/MatchupDetailScreen.tsx:130-144`

Renders `<MatchupRosterEditor matchupId leagueId userTeamId matchupStatus statsLoadingStatus
locked={matchup.status === MatchupStatus.InProgress} />` gated on `matchupId != null &&
leagueId != null && userTeamId != null && isUserInMatchup` (the same ownership check, derived
once and reused for `rosterEditor` and `rosterComparison`).

**`apps/app/src/features/matchup/components/MatchupRosterEditor.tsx`**

Mirrors the web wrapper's data-fetching/mutation pattern with native-specific differences:

- `locked` is passed down directly from the matchup status at the call site (no independent
  pre-flight check before each mutation); a lock discovered **after** a mutation is rejected is
  handled by `checkForLockAfterRejection()` (`MatchupRosterEditor.tsx:88-102`), which re-fetches
  `GetMatchupById` and sets `lockDiscovered` on non-`Scheduled` status.
- `useGetMatchupPlayersQuery` polls on `MATCHUP_LOCK_POLL_INTERVAL_MS` (LS-5895) to keep roster
  data fresh if the matchup locks server-side mid-session.
- Mutation failures route through `handleRosterMutationError` (`../matchup-lock-refresh`) and
  surface a native `Alert.alert('Error', ...)`.
- Additional guard states beyond the web wrapper: an explicit `playersError` message, and a "No
  players found for your team" empty state.

### Shared presentational component

**`lib/shared-components/src/features/roster/MatchupRosterEditorView.tsx`**

Platform-agnostic (no GraphQL or platform imports) lineup editor consumed by both wrappers:

- **Selection model:** tap a player to select it (`selectedPlayerId`); tap a second player to
  swap their position assignments; tap an empty slot with a player selected to move that player
  into the slot; a "Bench" button on a selected starter moves it to the bench
  (`positionId: null`).
- **Eligibility validation:** every swap/move/assign is checked against
  `isEligibleForSlot(player.eligiblePositions, targetSlotType)` before the mutation fires;
  ineligible targets show an inline "Not eligible" label and an eligibility-error banner instead
  of calling the mutation callback.
- **Layout:** one row per league position slot in `POSITION_SLOT_ORDER` (batters first, then
  pitchers) under a `STARTERS ({filled}/{total})` header, followed by a `BENCH ({count})`
  section. Empty slots render an italic "Empty" placeholder, tappable when a player is selected
  and eligible.
- **Locked state:** header switches from "Edit Lineup"/green "Unlocked" badge to "Current
  Lineup"/orange "Locked" badge; all `onPress` handlers, action buttons, and interaction hints
  are suppressed.
- **Mutation lifecycle:** `runMutation()` (`MatchupRosterEditorView.tsx:115-128`) clears
  selection only on success; on failure it logs via `LOGGER.error`, forwards the error to the
  optional `onMutationError` callback, and preserves selection so the user can retry.

### Shared utilities

**`lib/shared-components/src/features/roster/rosterUtils.ts`**

- `POSITION_SLOT_ORDER` — canonical batter-then-pitcher slot sort order (shared with
  `roster-comparison`)
- `isEligibleForSlot()` — position-eligibility check (shared with `roster-comparison`)

## Test Coverage

### Unit / component tests

**`apps/web/src/features/matchup/MatchupRosterEditor.spec.tsx`**

- `MatchupRosterEditor — locked-prop race (LS-4037)` — skips swap/move mutations when the
  matchup locks after the handler was captured but the mutation still fires while unlocked.
- `MatchupRosterEditor — server-side lock re-check (LS-4051)` — skips swap/move and locks the UI
  when the pre-flight `GetMatchupById` check reports `InProgress`, locks on a pre-flight network
  error, and fires mutations normally when the server confirms `Scheduled`; does not lock the UI
  purely because a swap/move mutation itself throws.
- `MatchupRosterEditor — pre-flight cache TTL (LS-5894 / BMD-024)` — skips the network pre-flight
  on a second swap within 5s of a confirmed check, and re-checks over the network once the TTL
  has elapsed.

**`lib/shared-components/src/features/roster/MatchupRosterEditorView.spec.tsx`**

- STARTERS/BENCH population from `positionOptions`/`positionId`, including the empty-slots case.
- Heading regression guards (LS-4283): "Edit Lineup" vs. "Current Lineup", `null` render when
  `players` is empty, STARTERS rows render simultaneously with the heading.
- Position eligibility validation (LS-4036) and swap-target eligibility feedback (LS-4050):
  "Not eligible" labeling, disabled/dimmed ineligible assign buttons, blocked mutation calls on
  ineligible targets.
- Mutation failure handling (LS-2664): selection preserved and error reported on a rejected
  `onMoveToPosition`/`onSwapPositions`, selection cleared on success, error logged even without
  an `onMutationError` callback.
- Player row `data-testid` regression guard (LS-4133): `matchup-player-row-{id}` emitted on both
  starter and bench rows.

### E2E tests (hermetic — `apps/web-e2e/src/tests/`)

**`apps/web-e2e/src/tests/matchup-roster-editor.spec.ts`** (LS-5355):

`Matchup Detail – Roster Editor @regression`:

- Renders the "Edit Lineup" panel with an "Unlocked" badge and correct `STARTERS (n/m)` /
  `BENCH (n)` counts for the user's own team on a `Scheduled` matchup.
- Assigning a bench player to an eligible empty slot invokes the update-position mutation and
  the UI reflects the new assignment (slot count updates, bench empties, player row shows in the
  new slot).
- The update mutation is invoked with the expected `matchupPlayerId`/`positionId` payload.

`Matchup Detail – Roster Editor lock discovery @regression`:

- On an `InProgress` matchup the editor still renders optimistically as "Unlocked" on initial
  load; the first edit attempt triggers the pre-flight check, which reports `InProgress` and
  flips the panel to "Current Lineup" / "Locked" without calling the update mutation.

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Bucket Story:** LS-7595 — Feature Discovery Gaps (GAP-002)
- **Web wrapper:** `apps/web/src/features/matchup/MatchupRosterEditor.tsx`
- **Native wrapper:** `apps/app/src/features/matchup/components/MatchupRosterEditor.tsx`
- **Shared presentational component:**
  `lib/shared-components/src/features/roster/MatchupRosterEditorView.tsx`
- **Utilities:** `lib/shared-components/src/features/roster/rosterUtils.ts`
- **Sibling feature doc:** `roster-comparison/feature.md` (LS-5357) — the read-only counterpart
  to this editable panel

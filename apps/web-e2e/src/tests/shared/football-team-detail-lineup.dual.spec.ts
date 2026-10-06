/**
 * Football Team Detail lineup editing — dual-mode (LS-9657, parent LS-5272).
 *
 * The second surface that renders the shared `RosterBoard` lineup editor
 * (`lib/shared-components/src/features/roster/**`): web's
 * `apps/web/src/pages/football/FootballTeamDetailPage.tsx` (LS-6438) and
 * native's `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/football/team/[teamId].tsx` Lineup tab
 * (LS-9649). With both of those landed, the dual-mode pattern applies here
 * exactly as it does on the League Roster tab, so the SAME spec body runs
 * mocked on web (PR CI) and through a real Appium/UiAutomator2 session on
 * `native-android` (`.github/workflows/e2e-native-android.yml`).
 *
 * Deliberately a SIBLING of `football-lineup.dual.spec.ts` rather than an
 * extra case inside it. That spec covers the League Roster tab, which always
 * renders the viewer's OWN team; Team Detail is addressed by team, so it is
 * the only one of the two that can render somebody else's team — and the
 * read-only visitor case below is what that difference buys. Everything else
 * is reused, not forked: the `rosterPage` dual fixture, the `RosterPage`
 * verbs, and the `TestData` football lineup seam (LS-9655/LS-9656). The one
 * genuinely new precondition — a team the viewer does not own — went into the
 * shared seam as `TestData.footballTeamDetailVisitor()`, not inline here.
 *
 * Route parity: both tests navigate the web-shaped `/football/teams/:teamId`
 * via `rosterPage.gotoTeamDetail`. The driver route map
 * (`apps/web-e2e/src/driver/native-route-map.ts`) rewrites it to native's
 * singular `team/[teamId]` segment and names the `Lineup` tab, so the spec
 * body carries no platform branch.
 *
 * `TestData.footballLineup()` and `footballTeamDetailVisitor()` are both
 * mock-only — see `FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON` in
 * `fixtures/test-data.ts` — so this spec runs on the `chromium` (hermetic
 * mock) and `native-android` (native mock server, ADR-0017) projects; both
 * tests skip themselves on `shared-live` (LS-10217).
 *
 * Speaks ONLY the `AppDriver` vocabulary (no `page.route`/`page.waitForRequest`
 * network gates): the native mock server is a real out-of-process HTTP server
 * the emulator reaches over `adb reverse`, so it never crosses Playwright's
 * network stack and a request gate would hang forever on `native-android`. The
 * retrying `expect*` assertions on post-mutation UI state are the
 * platform-neutral equivalent.
 *
 * Out of scope, per the ticket: lock-window and bye-week conditional states
 * (LS-6441, covered by their own dual specs), IR slots (LS-6429, Won't Do),
 * premium-tier scenarios (LS-6442/6443), and matchup/scoring-format coverage
 * on this page (LS-6435/6437/6444/6451).
 */
import { test } from '../../fixtures/dual';

test.describe('Football Team Detail lineup (dual-mode) @dual @regression', () => {
  test('a GM moves a bench player into an open slot and then back to the bench', async ({
    testData,
    rosterPage,
  }) => {
    test.skip(
      testData.mode === 'live',
      'footballLineup() has no live implementation (LS-9655) — see ' +
        'FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON in fixtures/test-data.ts',
    );

    const lineup = await testData.footballLineup();
    const { fullName } = lineup.benchPlayer;
    const { positionType } = lineup.openSlot;

    await rosterPage.gotoTeamDetail(lineup.teamId, 'football');
    await rosterPage.expectNoAppError();

    await rosterPage.benchRow(fullName).expectVisible({ timeout: 15_000 });

    await test.step('Assign the bench player to the open slot', async () => {
      await rosterPage.benchRow(fullName).tap();
      // The empty slot renames itself to "Assign <player> to <POS>" only while
      // an eligible player is selected, so tapping it is both the action and
      // the proof the selection landed.
      await rosterPage.assignAction(fullName, positionType).tap();

      await rosterPage
        .assignedSlot(fullName, positionType)
        .expectVisible({ timeout: 15_000 });
    });

    await test.step('Move the new starter back to the bench', async () => {
      await rosterPage.assignedSlot(fullName, positionType).tap();
      await rosterPage.moveToBenchAction(fullName).tap();

      await rosterPage.benchRow(fullName).expectVisible({ timeout: 15_000 });
      // The slot is genuinely vacated, not merely showing someone else: an
      // empty slot's accessible name reverts to "<Position label> — open slot"
      // (label from `rosterEligibility.ts`'s `getPositionLabel`).
      await rosterPage
        .openSlot('Quarterback')
        .expectVisible({ timeout: 15_000 });
    });
  });

  test('a visitor cannot select a player to edit the lineup', async ({
    testData,
    rosterPage,
  }) => {
    test.skip(
      testData.mode === 'live',
      'footballTeamDetailVisitor() has no live implementation (LS-9655) — see ' +
        'FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON in fixtures/test-data.ts',
    );

    // The Team-Detail-only case: the board renders a team the viewer does NOT
    // own. Web gates on `viewerMembership.teamId`, native on `userTeamId` —
    // the shared verb points both at a different team than the one viewed.
    const { teamId, starter } = await testData.footballTeamDetailVisitor();

    await rosterPage.gotoTeamDetail(teamId, 'football');
    await rosterPage.expectNoAppError();

    const starterSlot = rosterPage.assignedSlot(
      starter.fullName,
      starter.positionType,
    );

    await test.step('The roster is still rendered for the visitor', async () => {
      await starterSlot.expectVisible({ timeout: 15_000 });
    });

    await test.step('But no row can be selected, so no lineup edit is reachable', async () => {
      // `readOnly` feeds `RosterBoard`'s `effectiveReadOnly`, which wires no
      // `onPress` AND disables the row — a real disabled control, so a tap
      // attempt could not even land. Asserted directly rather than
      // attempted-and-observed-to-no-op, which would just time out (the same
      // reasoning as the locked-row assertions in
      // `football-lineup-lock-window.dual.spec.ts`).
      await starterSlot.expectDisabled();

      // And the selection-only affordance never becomes available, since
      // nothing can be selected in read-only mode.
      await rosterPage.moveToBenchAction(starter.fullName).expectCount(0);
    });
  });
});

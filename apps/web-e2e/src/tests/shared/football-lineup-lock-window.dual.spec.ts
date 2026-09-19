/**
 * Football Roster lineup — lock-window behaviour (dual-mode, LS-6441, parent
 * LS-5272).
 *
 * FTD-015 was narrowed (2026-08-23) to the two conditional-state scenarios
 * the League Roster dual-mode spec (`football-lineup.dual.spec.ts`, LS-9656)
 * intentionally left uncovered — assign/bench/swap is that spec's job, not
 * this one's. This spec proves the other half of "locked": a player whose
 * game has started cannot be moved, and the UI communicates why.
 *
 * `RosterBoard` (`lib/shared-components/src/features/roster/RosterBoard.tsx`)
 * enforces this entirely client-side off each team member's `isLocked` flag —
 * set server-side by `checkPlayersNotLocked`
 * (`lambdas/db/src/schema/authorization.ts`) once a team's matchup leaves
 * `'scheduled'` (LS-6428, fixed prior to this ticket) — so this spec seeds
 * `isLocked: true` directly via `TestData.footballLineupLocked()` rather than
 * driving a real lock transition. Both the starting-slot row and the bench
 * row disable their own `onPress` entirely when locked (`SlotRow`/`BenchRow`
 * in `RosterBoard.tsx`), so there is no mutation to assert on: the proof is
 * (a) each locked row's accessible name/subtext names the reason, and (b)
 * tapping either leaves the roster exactly as it was.
 *
 * `TestData.footballLineupLocked()` is mock-only, same reasoning as
 * `footballLineup()` (LS-9655) — see `FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON`
 * in `fixtures/test-data.ts`. Runs on `chromium` (hermetic mock) and
 * `native-android` (native mock server, ADR-0017); skips itself on
 * `shared-live` (LS-10217).
 */
import { test } from '../../fixtures/dual';

test.describe('Football Roster lock-window (dual-mode) @dual @regression', () => {
  test('a locked player cannot be moved, and the UI explains why', async ({
    testData,
    rosterPage,
  }) => {
    test.skip(
      testData.mode === 'live',
      'footballLineupLocked() has no live implementation (LS-9655) — see ' +
        'FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON in fixtures/test-data.ts',
    );

    const { leagueId, lockedStarter, lockedBenchPlayer } =
      await testData.footballLineupLocked();

    await rosterPage.goto(leagueId, 'football');
    await rosterPage.expectNoAppError();

    await test.step('The locked starter is shown locked, not just occupied', async () => {
      await rosterPage
        .lockedSlot(lockedStarter.fullName, lockedStarter.positionType)
        .expectVisible({ timeout: 15_000 });
    });

    await test.step('The locked bench player is shown locked too', async () => {
      await rosterPage
        .lockedBenchRow(lockedBenchPlayer.fullName)
        .expectVisible({ timeout: 15_000 });
    });

    await test.step('Neither locked row can be interacted with, so neither can move', async () => {
      // `effectiveReadOnly` (RosterBoard.tsx) wires no onPress AND disables
      // the row while locked — a real `disabled` element, not just an
      // aria-disabled affordance, so a tap attempt cannot even land (asserted
      // directly rather than attempted-and-observed-to-no-op, which would
      // just time out against a genuinely disabled control).
      await rosterPage
        .lockedSlot(lockedStarter.fullName, lockedStarter.positionType)
        .expectDisabled();
      await rosterPage
        .lockedBenchRow(lockedBenchPlayer.fullName)
        .expectDisabled();

      // The open WR slot never received a selection — its accessible name
      // still reads "open slot", not the "Assign <player> to WR" prompt a
      // real selection would put it in (position label from
      // rosterEligibility.ts's POSITION_LABEL; the row's own accessible name
      // carries this text, not its rendered DOM text, hence `slotButton`
      // rather than `text`).
      await rosterPage.slotButton(/Wide Receiver — open slot/i).expectVisible();
    });
  });
});

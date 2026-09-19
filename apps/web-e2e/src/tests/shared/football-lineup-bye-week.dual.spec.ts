/**
 * Football Roster lineup — bye-week behaviour (dual-mode, LS-6441, parent
 * LS-5272).
 *
 * FTD-015 was narrowed (2026-08-23) to the two conditional-state scenarios
 * the League Roster dual-mode spec (`football-lineup.dual.spec.ts`, LS-9656)
 * intentionally left uncovered. This spec covers the other one: a starter
 * whose NFL team has no game this week must be flagged, not silently allowed
 * to score 0 with no warning (FTD-004 / LS-6430, fixed prior to this ticket).
 *
 * `RosterBoard` (`lib/shared-components/src/features/roster/RosterBoard.tsx`)
 * computes a starting slot's `onBye` flag from `byeWeeksByTeam[player.nflTeam]
 * === currentWeek` and, when true, renders the red "On Bye Week" chip
 * (`ByeWeekChip`) next to the player's name — starters only, per LS-6430's
 * precedent (a benched player's bye status doesn't affect the active
 * lineup). `TestData.footballLineupByeWeek()` seeds exactly that: one
 * starter whose `nflTeam` matches a `GetNflTeamSeasonMetadata` bye entry for
 * the league's current week.
 *
 * Mock-only, same reasoning as `footballLineup()` (LS-9655) — see
 * `FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON` in `fixtures/test-data.ts`. Runs
 * on `chromium` (hermetic mock) and `native-android` (native mock server,
 * ADR-0017); skips itself on `shared-live` (LS-10217).
 */
import { test } from '../../fixtures/dual';

test.describe('Football Roster bye-week (dual-mode) @dual @regression', () => {
  test('a starter whose NFL team is on bye is flagged, not silently scored', async ({
    testData,
    rosterPage,
  }) => {
    test.skip(
      testData.mode === 'live',
      'footballLineupByeWeek() has no live implementation (LS-9655) — see ' +
        'FOOTBALL_LINEUP_LIVE_UNSUPPORTED_REASON in fixtures/test-data.ts',
    );

    const { leagueId, byeStarter } = await testData.footballLineupByeWeek();

    await rosterPage.goto(leagueId, 'football');
    await rosterPage.expectNoAppError();

    await test.step('The bye-week starter is flagged in its slot', async () => {
      await rosterPage
        .byeSlot(byeStarter.fullName, byeStarter.positionType)
        .expectVisible({ timeout: 15_000 });
    });

    await test.step('The BYE warning chip is visible', async () => {
      await rosterPage.text('On Bye Week').expectVisible();
    });
  });
});

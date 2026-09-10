/**
 * Football Roster (My Roster) render E2E test (LS-5421).
 *
 * Covers the epic LS-5268 render-only assertion for the football League
 * Roster tab (`/football/league/:id/roster`): starter and bench slots render
 * grouped by NFL position (not baseball's Hitters/Pitchers split). This is a
 * web-DOM-only concern (heading text, section absence) with no native
 * page-object equivalent, so it stays web-only and hermetic.
 *
 * The bench↔starter lineup-assignment mutation, its UI reflection, and
 * reload persistence — previously duplicated here — now live in the
 * dual-mode `shared/football-lineup.dual.spec.ts` (LS-9656), which runs the
 * SAME assertion mocked on web and through a real device on native-android,
 * closing the "native path is untested" gap this web-only spec could not.
 * Do not re-add that coverage here — it would just be redundant with the
 * dual spec, not additional confidence.
 *
 * The roster precondition is the shared `TestData.footballLineup()` verb
 * (LS-9655) — the payloads and the stateful mutation handling live in
 * `mocks/graphql/roster.mocks.ts`, so this spec and the native mock server
 * drive identical data. All GraphQL is mocked, so this runs without a live
 * backend (hermetic — route.fulfill(), not route.continue()).
 */

import { expect, test } from '../fixtures/pages';
import { MockTestData } from '../fixtures/test-data';

test.describe('Football Roster — starter/bench render grouped by NFL position @regression', () => {
  test('shows a "Starters" section (not Hitters/Pitchers) and the bench player', async ({
    page,
    rosterPage,
  }) => {
    const lineup = await new MockTestData(page).footballLineup();
    await rosterPage.goto(lineup.leagueId, 'football');

    await expect(page).toHaveURL(`/football/league/${lineup.leagueId}/roster`);
    await rosterPage.expectNoAppError();

    await rosterPage.heading('Starters').expectVisible({ timeout: 10000 });
    await rosterPage.heading('Starting Hitters').expectCount(0);
    await rosterPage.heading('Starting Pitchers').expectCount(0);
    await rosterPage.text(lineup.benchPlayer.fullName).expectVisible();
  });
});

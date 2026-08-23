/**
 * Football Roster (My Roster) Lineup E2E Tests (LS-5421)
 *
 * Covers the epic LS-5268 user journey for the football League Roster tab
 * (`/football/league/:id/roster`): starter and bench slots render grouped by
 * NFL position (not baseball's Hitters/Pitchers split), and moving a player
 * from the bench into an open starting slot fires the lineup mutation and is
 * reflected in the UI (slot label becomes "{Player} at {POS}") and persists
 * across a reload.
 *
 * The roster precondition is the shared `TestData.footballLineup()` verb
 * (LS-9655) — the payloads and the stateful mutation handling live in
 * `mocks/graphql/roster.mocks.ts`, so this spec and the native mock server
 * drive identical data. All GraphQL is mocked, so this runs without a live
 * backend (hermetic — route.fulfill(), not route.continue()).
 */

import { expect, test } from '../fixtures/pages';
import { MockTestData } from '../fixtures/test-data';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

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

test.describe('Football Roster — lineup editing @regression', () => {
  test('moving a bench player into an open starting slot fires the mutation, updates the UI, and persists on reload', async ({
    page,
    rosterPage,
  }) => {
    const lineup = await new MockTestData(page).footballLineup();
    const { fullName } = lineup.benchPlayer;
    const { positionType } = lineup.openSlot;

    await rosterPage.goto(lineup.leagueId, 'football');

    await rosterPage
      .slotButton(/quarterback — open slot/i)
      .expectVisible({ timeout: 10000 });

    const mutationRequest = page.waitForRequest(
      (req) =>
        isGraphQLEndpoint(req.url()) &&
        (req.postData() ?? '')
          .toLowerCase()
          .includes('"updateteammemberposition"'),
    );

    // Select the bench player, then tap the now-eligible QB slot to assign
    // them — mirrors the baseball lineup-editor journey (LS-5360), applied to
    // the football Roster tab surface.
    await rosterPage.slotButton(new RegExp(`${fullName} — bench`, 'i')).tap();
    await rosterPage
      .slotButton(new RegExp(`assign ${fullName} to ${positionType}`, 'i'))
      .tap();
    await mutationRequest;

    const assignedSlot = new RegExp(`${fullName} at ${positionType}`, 'i');
    await rosterPage.slotButton(assignedSlot).expectVisible();

    // Persists across a reload — the assignment round-trips through the
    // fixture's mutable roster, mirroring a real refetch.
    await page.reload();
    await rosterPage.slotButton(assignedSlot).expectVisible({ timeout: 10000 });
  });
});

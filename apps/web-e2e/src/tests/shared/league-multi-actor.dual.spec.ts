/**
 * Multi-actor fixture + seeded-league verb ladder — proof of concept
 * (dual-mode, ADR-0016, LS-9736 — Wave 1 foundation of the LS-9663 dual-mode
 * convergence epic).
 *
 * Not a migrated spec (that's the follow-up wave — LS-9663's children). This
 * exists purely to demonstrate that the two capabilities LS-9736 lands
 * compose end to end:
 *
 *   • `counterpartyPage`/`counterpartyTestData` — a second authenticated
 *     page/testData pair (`fixtures/dual.ts`).
 *   • `testData.league()` / `leagueWithMember()` — the seeded-league verb
 *     ladder (`fixtures/test-data.ts`).
 *
 * The core assertion is that `counterpartyTestData.league()`, called
 * independently on the SECOND page, resolves to the exact same league the
 * PRIMARY page created via `leagueWithMember()` — proving the mock-mode
 * shared state (or the live backend's real state) is genuinely visible from
 * both pages, not two independently-seeded fixtures that merely look alike.
 * A light UI check on each page corroborates it beyond the data layer.
 */
import { expect, test } from '../../fixtures/dual';

test.describe('Multi-actor seeded league (dual-mode) @dual @regression', () => {
  test('a second page/testData pair observes the same seeded league', async ({
    leaguePage,
    testData,
    counterpartyPage,
    counterpartyTestData,
  }) => {
    const league = await testData.leagueWithMember();

    // Independently "mount" the same precondition from the second page. If
    // the two pages' MockTestData instances did not share state, this would
    // create/return a DIFFERENT league (mock mode's fixture ids are unique
    // per construction — see `createLeagueFixture`), and the assertions
    // below would fail.
    const counterpartyLeague = await counterpartyTestData.league();

    expect(counterpartyLeague.leagueId).toBe(league.leagueId);
    expect(counterpartyLeague.inviteCode).toBe(league.inviteCode);
    expect(counterpartyLeague.commissionerTeamId).toBe(
      league.commissionerTeamId,
    );

    await leaguePage.gotoDetail(league.leagueId);
    await leaguePage.expectNoAppError();

    await counterpartyPage.goto(`/baseball/league/${league.leagueId}`);
    await expect(counterpartyPage).toHaveURL(
      new RegExp(`/baseball/league/${league.leagueId}(?:[/?#]|$)`),
    );
  });
});

/**
 * Matchup roster editor — dual-mode (LS-9738, migration matrix row #3,
 * `docs/dev-process/e2e-dual-mode-migration-matrix.md`).
 *
 * Covers `matchup-roster-editor-ui.integration.spec.ts` (LS-596): bench a
 * starter, assign a bench player to an eligible open slot, and swap two
 * starters — each mutation confirmed by the UI reflecting the refetched
 * state, mirroring the mutation-then-refetch pattern `footballLineup()`
 * already established (LS-9655).
 *
 * No live-only assertions here (per the migration matrix, row #3 has none
 * infra-hard-blocked) and no multi-actor fixture — a single team's own
 * roster editor, matching the matrix's scope for this row.
 */
import { test } from '../../fixtures/dual';
import { MatchupPage } from '../../pages/matchup.page';

test.describe('Matchup roster editor (dual-mode) @dual @regression', () => {
  test('bench, assign, and swap mutations persist through a refetch', async ({
    page,
    driver,
    testData,
  }) => {
    const roster = await testData.scheduledMatchupRoster();
    const matchupPage = new MatchupPage(driver);
    await matchupPage.goto(roster.leagueId, roster.matchupId);
    await matchupPage.expectNoAppError();
    await matchupPage
      .heading(/Matchup Details/i)
      .expectVisible({ timeout: 15_000 });

    await test.step('Bench a starter', async () => {
      await matchupPage.selectPlayerRow(roster.starterToBench.matchupPlayerId);
      const benchButton = matchupPage.button(/^Bench$/i);
      await benchButton.expectVisible({ timeout: 5_000 });
      const mutationSettled = page.waitForResponse(
        (r) =>
          r.url().includes('/graphql') &&
          r.request().method() === 'POST' &&
          (r.request().postData() ?? '').includes(
            '"operationName":"UpdateMatchupPlayerPosition"',
          ),
      );
      await benchButton.tap();
      await mutationSettled;
      await matchupPage
        .playerRow(roster.starterToBench.matchupPlayerId)
        .expectContainsText(roster.starterToBench.fullName);
    });

    await test.step('Assign the bench player to the open slot', async () => {
      await matchupPage.selectPlayerRow(roster.benchPlayer.matchupPlayerId);
      const assignButton = matchupPage.assignButton(
        roster.benchPlayer.matchupPlayerId,
        roster.openSlot.positionId,
      );
      await assignButton.expectVisible({ timeout: 5_000 });
      await assignButton.expectEnabled();

      const mutationSettled = page.waitForResponse(
        (r) =>
          r.url().includes('/graphql') &&
          r.request().method() === 'POST' &&
          (r.request().postData() ?? '').includes(
            '"operationName":"UpdateMatchupPlayerPosition"',
          ),
      );
      await matchupPage.assignPlayerToPosition(
        roster.benchPlayer.matchupPlayerId,
        roster.openSlot.positionId,
      );
      await mutationSettled;
      await matchupPage
        .playerRow(roster.benchPlayer.matchupPlayerId)
        .expectContainsText(roster.benchPlayer.fullName);
    });

    await test.step('Swap two mutually-eligible starters', async () => {
      const [starterA, starterB] = roster.swapPair;
      await matchupPage.selectPlayerRow(starterA.matchupPlayerId);

      const mutationSettled = page.waitForResponse(
        (r) =>
          r.url().includes('/graphql') &&
          r.request().method() === 'POST' &&
          (r.request().postData() ?? '').includes(
            '"operationName":"SwapMatchupPlayerPositions"',
          ),
      );
      await matchupPage.selectPlayerRow(starterB.matchupPlayerId);
      await mutationSettled;

      await matchupPage
        .playerRow(starterA.matchupPlayerId)
        .expectContainsText(starterA.fullName);
      await matchupPage
        .playerRow(starterB.matchupPlayerId)
        .expectContainsText(starterB.fullName);
    });

    await test.step('The assignment persists across a reload', async () => {
      await page.reload();
      await matchupPage
        .heading(/Matchup Details/i)
        .expectVisible({ timeout: 15_000 });
      await matchupPage
        .playerRow(roster.benchPlayer.matchupPlayerId)
        .expectContainsText(roster.benchPlayer.fullName, { timeout: 15_000 });
    });
  });
});

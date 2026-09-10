/**
 * Matchup detail — dual-mode (LS-9738, migration matrix row #2,
 * `docs/dev-process/e2e-dual-mode-migration-matrix.md`).
 *
 * Covers the UI-mechanics slice of `matchup-detail-ui.integration.spec.ts`
 * (LS-595): scoreboard, win-probability panel, roster comparison, and the
 * cross-user view (via LS-9736's multi-actor fixture).
 *
 * The win-probability assertion below verifies UI RENDERING of the payload
 * `TestData.seasonActiveMatchup()` returns, not the real Monte Carlo
 * algorithm's correctness — the same tradeoff already documented for
 * `footballLineup()` (LS-9655). That correctness assertion (percentages
 * summing to 100 from a REAL simulation) stays live-only in
 * `matchup-detail-ui.integration.spec.ts` Phase 6.
 */
import { expect, test } from '../../fixtures/dual';
import { MatchupPage } from '../../pages/matchup.page';

test.describe('Matchup detail (dual-mode) @dual @regression', () => {
  test('scoreboard, win-probability panel, and roster comparison render; a second identity can view the same matchup', async ({
    page,
    driver,
    testData,
    counterpartyPage,
    counterpartyTestData,
  }) => {
    const matchup = await testData.seasonActiveMatchup();
    // Installs the SAME matchup fixture's routes on `counterpartyPage`
    // (mock) / resolves the already-joined member's own team (live) — see
    // `TestData.seasonActiveMatchup()`'s doc comment.
    const counterpartyMatchup =
      await counterpartyTestData.seasonActiveMatchup();
    expect(counterpartyMatchup.leagueId).toBe(matchup.leagueId);
    expect(counterpartyMatchup.matchupId).toBe(matchup.matchupId);

    const matchupPage = new MatchupPage(driver);
    await matchupPage.goto(matchup.leagueId, matchup.matchupId);
    await matchupPage.expectNoAppError();
    await matchupPage
      .heading(/Matchup Details/i)
      .expectVisible({ timeout: 15_000 });

    await test.step('Scoreboard renders', async () => {
      await matchupPage.text('VS').first().expectVisible({ timeout: 15_000 });
      await matchupPage
        .text(/Week\s+\d+/i)
        .first()
        .expectVisible({ timeout: 10_000 });
    });

    await test.step('Win-probability panel renders the seeded payload', async () => {
      await matchupPage.winProbabilityPanel.expectVisible({ timeout: 15_000 });
      await matchupPage.winProbabilityPanel
        .byText(/\d+%/)
        .first()
        .expectVisible({ timeout: 10_000 });
    });

    await test.step('Roster comparison headers render', async () => {
      await matchupPage
        .text('BATTERS')
        .first()
        .expectVisible({ timeout: 20_000 });
      await matchupPage
        .text('PITCHERS')
        .first()
        .expectVisible({ timeout: 10_000 });
      // `MatchupRosterComparison`'s "Actual" label lives in TWO places that
      // are mutually exclusive by CSS container query — the column header
      // (`.mrc-tcols`, hidden below 660px) and each per-player-row score
      // button (`.mrc-lab`, hidden at/above 660px) — so exactly one is
      // visible at any width, never both. An unscoped `getByText('Actual')
      // .first()` always resolves to whichever copy is FIRST in DOM order
      // (the header), which is wrong at narrow widths; a role-based lookup
      // on the per-row button is wrong at wide widths, where that button's
      // accessible name loses "Actual" as `.mrc-lab` is CSS `display: none`.
      // Use Playwright's `:visible` selector extension so the retrying
      // `toBeVisible()` assertion itself filters to whichever copy the
      // current container width actually renders, web-only (no portable
      // container-query equivalent) — hence the raw `page` escape hatch.
      await expect(
        page.locator(':text-is("Actual"):visible').first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step('A second identity can view the same matchup (cross-user)', async () => {
      await counterpartyPage.goto(
        `/baseball/league/${counterpartyMatchup.leagueId}/matchups/${counterpartyMatchup.matchupId}`,
      );
      await expect(counterpartyPage.locator('body')).not.toContainText(
        'Unexpected Application Error',
        { timeout: 15_000 },
      );
      const counterpartyMain = counterpartyPage.getByRole('main', {
        name: 'Matchup details',
      });
      // Scoped to the scoreboard region, not the whole main landmark: the
      // Player Matchups team header below also renders an exact "VS" node,
      // so an unscoped `counterpartyMain.getByText('VS')` is a strict-mode
      // violation once that section has mounted (observed in CI — the
      // second page's slower/later render than the primary page's own
      // already-`.first()`-scoped scoreboard check above).
      await expect(
        counterpartyMain
          .getByRole('region', { name: /scoreboard/i })
          .getByText('VS', { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        counterpartyPage.getByRole('heading', { name: /Matchup Details/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});

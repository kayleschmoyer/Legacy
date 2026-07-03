/**
 * Player comparison — premium search round trip (dual-mode, ADR-0016,
 * LS-8292 slice A).
 *
 * Converted from player-search-stats-ui.integration.spec.ts Phase 4 (the live
 * original stays until nightly wiring lands). ONE spec body, two backends,
 * selected by Playwright project (see player-stats-search.dual.spec.ts for
 * the run commands):
 *
 *   • Hermetic (default): `testData.comparablePlayer()` answers SearchPlayers
 *     with the pool player, so the suggestion round trip renders Trout.
 *   • Live (`shared-live` project): the commissioner identity is premium
 *     (player-name search is entitlement-gated server-side — LS-7019/LS-8257),
 *     and the MLB history dataset always matches "Bonds".
 *
 * The spec speaks only page-object verbs and the TestData seam.
 */
import { test } from '../../fixtures/dual';

test.describe('Player comparison search (dual-mode) @dual @regression', () => {
  test('premium search returns a selectable suggestion', async ({
    playersPage,
    testData,
  }) => {
    const pool = await testData.comparablePlayer();

    await playersPage.gotoCompare();
    await playersPage.compare.expectHeadlineVisible();
    await playersPage.compare.expectSearchVisible();
    await playersPage.compare.expectSearchEnabled();

    await playersPage.compare.expectSuggestionsVisibleAfterTyping(
      pool.searchTerm,
      15_000,
    );
    await playersPage.compare.expectSuggestionVisible(pool.fullName, 15_000);
  });
});

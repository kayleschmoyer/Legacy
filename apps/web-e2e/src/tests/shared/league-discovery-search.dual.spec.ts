/**
 * League discovery — no-match search shows the empty state (dual-mode,
 * ADR-0016, LS-8290 follow-up).
 *
 * ONE spec body, two backends, selected by Playwright project (see
 * player-stats-search.dual.spec.ts for the run commands):
 *
 *   • Hermetic (default): `testData.discoverySearch()` installs a server-side
 *     GetPublicLeagues handler — two leagues unsearched, empty for the
 *     unmatched term — so the empty state is provably caused by the search
 *     round trip, not by an empty baseline.
 *   • Live (`shared-live` project): the term is guaranteed to miss every real
 *     public league, so the live server returns the same empty result.
 *
 * The spec speaks only page-object verbs and the TestData seam — and it runs
 * on the ADR-0016-migrated LeaguePage, so it exercises the driver path
 * end-to-end in both modes.
 */
import { test } from '../../fixtures/dual';

test.describe('League discovery search (dual-mode) @dual @regression', () => {
  test('a no-match search shows the empty state', async ({
    leaguePage,
    testData,
  }) => {
    const { unmatchedTerm } = await testData.discoverySearch();

    await leaguePage.gotoDiscovery();
    await leaguePage.expectDiscoveryLoaded();

    await leaguePage.discoverySearch.fill(unmatchedTerm);
    await leaguePage.discoverySearch.expectValue(unmatchedTerm);

    await leaguePage
      .text(/No leagues matched your search/i)
      .expectVisible({ timeout: 15_000 });
    await leaguePage.expectNoAppError();
  });
});

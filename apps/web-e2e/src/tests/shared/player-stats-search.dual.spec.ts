/**
 * Players stats grid — dual-mode spec (ADR-0016, LS-8290).
 *
 * ONE spec body, two backends, selected by Playwright project:
 *
 *   • Hermetic (default): part of the normal e2e suite under
 *     `playwright.config.ts` — `backend` resolves to `'mock'`, so
 *     `testData.playerPool()` installs the batting-connection mocks and the
 *     grid renders Trout/Ohtani.
 *
 *       pnpm exec playwright test --project=chromium \
 *         --config=apps/web-e2e/playwright.config.ts src/tests/shared
 *
 *   • Live: the `shared-live` project in `playwright.integration.config.ts`
 *     sets `backend: 'live'` — the same body runs against legacy-fantasy.com
 *     as the premium commissioner and finds Barry Bonds in the real MLB
 *     history dataset.
 *
 *       pnpm exec playwright test --project=shared-live \
 *         --config=apps/web-e2e/playwright.integration.config.ts
 *
 * The spec speaks only page-object verbs and the TestData seam — no selectors
 * (ADR-0015 §7), no mocking, no identity setup (those are fixture dimensions).
 */
import { test } from '../../fixtures/dual';

test.describe('Players stats grid (dual-mode) @dual @regression', () => {
  test('renders batting leaders and finds a known player via search', async ({
    playersPage,
    testData,
  }) => {
    const pool = await testData.playerPool();

    await playersPage.gotoStats();
    await playersPage.stats.expectLoaded(30_000);
    await playersPage.stats.expectText(/MLB Career Batting Leaders/, {
      timeout: 15_000,
    });

    await playersPage.stats.search(pool.searchTerm);
    await playersPage.stats.expectPlayerVisible(pool.fullName, 30_000);
  });
});

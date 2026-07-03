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

  // Converted from player-search-stats-ui.integration.spec.ts Phase 3
  // (LS-8292 slice A — the live original stays until nightly wiring lands).
  test('pitching tab shows ERA/W/SO leaders', async ({
    playersPage,
    testData,
  }) => {
    await testData.pitchingLeaders();

    await playersPage.gotoStats();
    await playersPage.stats.expectText(/MLB Career Batting Leaders/, {
      timeout: 30_000,
    });

    await playersPage.stats.switchView('Pitchers');

    await playersPage.stats.expectColumnHeader('ERA');
    await playersPage.stats.expectColumnHeader('W');
    await playersPage.stats.expectColumnHeader('SO');
    await playersPage.stats.expectPitchingLeaders();
  });

  // Converted from player-search-stats-ui.integration.spec.ts Phase 2.
  test('Min HR filter commits and the grid re-renders with rows', async ({
    playersPage,
    testData,
  }) => {
    await testData.playerPool();

    await playersPage.gotoStats();
    await playersPage.stats.expectColumnHeader('HR');

    await playersPage.stats.openAdvancedFilters();
    // 75 career HR: genuinely narrows the live result set while keeping
    // ~1.4k matching players; the mock pool's players all clear it too.
    await playersPage.stats.setMinHomeRuns(75);

    // applyFilters remounts the DataGrid — wait for a row in the refreshed
    // grid, still under batting headers.
    await playersPage.stats.expectAnyRowVisible(15_000);
    await playersPage.stats.expectColumnHeader('HR');
  });
});

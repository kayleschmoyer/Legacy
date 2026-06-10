/**
 * Player Search & Stats Browsing — UI Integration Test (LS-754)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Covers the three main areas of the Players section:
 *   1. Player directory / stats grid  (/players/stats)
 *      - Batting tab loads with real player data
 *      - Column headers visible (Player, HR, AVG, OPS)
 *      - Min HR filter narrows the displayed rows
 *      - Sort by HR column changes ordering
 *   2. Pitching tab  (/players/stats → Pitching tab)
 *      - Pitching-specific columns present (ERA, W, SO)
 *      - At least one pitcher row visible
 *   3. Player comparison tool  (/players/compare)
 *      - Page loads with the player search control
 *      - Live player search round-trips to the real backend
 *      - The comparison tool is premium-gated for free-tier users (the live
 *        integration identity), so the interactive add/compare/remove flow is
 *        covered hermetically against a mocked premium user in
 *        apps/web-e2e/src/tests/player-comparison.spec.ts
 *
 * Run:
 *   cd D:\code\legacy-sports-worktrees\LS-754-integration-test-player-search-stats
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     apps/web-e2e/src/integration/tests/player-search-stats-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Well-known player expected to be in the MLB history dataset, used as the
 * search term for the live comparison-search round-trip.
 */
const PLAYER_SEARCH_1 = 'Bonds'; // Barry Bonds — all-time HR leader (batter)

// ---------------------------------------------------------------------------
// Serial test suite — phases share state and must run in order.
// ---------------------------------------------------------------------------

test.describe
  .serial('Player Search and Stats Browsing UI (Live Backend) @integration', () => {
  test.describe.configure({ retries: 0 });

  // -------------------------------------------------------------------------
  // PHASE 1 — PLAYER DIRECTORY: BATTING TAB LOADS WITH REAL DATA
  // -------------------------------------------------------------------------

  test('Phase 1: /players/stats loads batting stats from the real API', async ({
    commissionerPage: page,
  }) => {
    await test.step('Navigate to /players/stats', async () => {
      await page.goto('/players/stats');
      await page.waitForLoadState('domcontentloaded');
    });

    await test.step('Page heading is visible', async () => {
      // The web wrapper renders "MLB Player Statistics" as the title
      await expect(page.getByText(/MLB Player Statistics/i)).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step('Combined view is active by default — batting grid is visible', async () => {
      // Default view is Combined (both grids); batting grid title confirms it rendered
      await expect(
        page.getByText('MLB Career Batting Leaders').first(),
      ).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('Batting column headers are present', async () => {
      // High-priority column headers from CAREER_STATS_COLUMNS
      // (lib/shared-components/.../PlayerStatsDataGrid.tsx). The grid renders
      // OBP and SLG as separate rate columns — there is no standalone "OPS"
      // column — so assert on the columns that actually exist (LS-7704).
      await expect(page.getByText('HR', { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('AVG', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText('OBP', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText('SLG', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('At least one player row is visible', async () => {
      // Player rows contain the "Player" column which shows player names.
      // Wait for at least one row with a non-empty name to appear.
      await expect(
        page.getByText('Player', { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });

      // At least one data row proves the API response was rendered.
      // The Refresh button was removed in LS-3802; player rows use data-testid="player-row-{id}".
      await expect(
        page.locator('[data-testid^="player-row-"]').first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 2 — BATTING FILTER: MIN HR NARROWS RESULTS
  // -------------------------------------------------------------------------

  test('Phase 2: Min HR filter narrows batting results', async ({
    commissionerPage: page,
  }) => {
    await page.goto('/players/stats');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the data grid controls to render
    await expect(page.getByText('HR', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    await test.step('Open the Advanced filters panel', async () => {
      // LS-3825: The refactored UI moved Min HR from inline DataGrid inputs
      // (showFilters=false) to a range slider inside the "Advanced" panel.
      const advancedButton = page.getByRole('button', { name: /Advanced/i });
      await expect(advancedButton).toBeVisible({ timeout: 10_000 });
      await advancedButton.click();
    });

    await test.step('Set Min Home Runs filter using the slider', async () => {
      // The Advanced panel renders a <input type="range" aria-label="Min Home Runs">
      const minHRSlider = page.getByLabel('Min Home Runs');
      await expect(minHRSlider).toBeVisible({ timeout: 10_000 });
      // Press End to move slider to max (75 career HR minimum).
      // onKeyUp triggers onCommit → applyFilters.
      await minHRSlider.press('End');
      // Confirm the filter value actually changed — guards against the keypress
      // not taking effect on the controlled <input type="range">.
      await expect(minHRSlider).toHaveValue('75');
    });

    await test.step('Grid re-loads with filtered data', async () => {
      // After applying the filter the grid re-fetches automatically.
      // PlayerStatsPage increments battingKey on applyFilters, unmounting and
      // remounting the DataGrid — wait for a row in the refreshed grid.
      await expect(
        page.locator('[data-testid^="player-row-"]').first(),
      ).toBeVisible({ timeout: 15_000 });

      // Still shows batting column headers — the grid re-rendered
      await expect(page.getByText('HR', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 3 — PITCHING TAB: LOADS WITH PITCHING-SPECIFIC STATS
  // -------------------------------------------------------------------------

  test('Phase 3: Switching to Pitching tab shows ERA and wins data', async ({
    commissionerPage: page,
  }) => {
    await page.goto('/players/stats');
    await page.waitForLoadState('domcontentloaded');

    // Wait for batting grid to load first (default combined view)
    await expect(
      page.getByText('MLB Career Batting Leaders').first(),
    ).toBeVisible({
      timeout: 30_000,
    });

    await test.step('Click the Pitching tab', async () => {
      const pitchingTab = page.getByRole('tab', { name: /Pitcher/i });
      await expect(pitchingTab).toBeVisible({ timeout: 10_000 });
      await pitchingTab.click();
    });

    await test.step('Pitching column headers are visible', async () => {
      await expect(page.getByText('ERA', { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('W', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText('SO', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('The pitching grid renders', async () => {
      // Pitching grid is confirmed by its title (showSearch=false on PlayerStatsPage)
      await expect(page.getByText('MLB Career Pitching Leaders')).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 4 — PLAYER COMPARISON: PAGE LOADS WITH SEARCH CONTROL
  // -------------------------------------------------------------------------

  test('Phase 4: /players/compare loads with player search input', async ({
    commissionerPage: page,
  }) => {
    await page.goto('/players/compare');
    await page.waitForLoadState('domcontentloaded');

    await test.step('Page heading is visible', async () => {
      // PlayerComparisonPage renders "Player Comparison" or similar header
      await expect(page.getByText(/Player Comparison/i).first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step('Player search input is visible and enabled', async () => {
      await expect(page.getByLabel('Search players to compare')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByLabel('Search players to compare')).toBeEnabled();
    });

    await test.step('Search input shows correct placeholder text', async () => {
      await expect(page.getByPlaceholder('Search player name…')).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 5 — COMPARISON: LIVE SEARCH + PREMIUM GATE (FREE-TIER USER)
  // -------------------------------------------------------------------------

  test('Phase 5: Player search returns live results; comparison is premium-gated', async ({
    commissionerPage: page,
  }) => {
    await page.goto('/players/compare');
    await page.waitForLoadState('domcontentloaded');

    // Wait for search input to be ready
    await expect(page.getByLabel('Search players to compare')).toBeVisible({
      timeout: 20_000,
    });

    // The /players/compare comparison tool is wrapped in <PremiumGate>
    // (apps/web/src/pages/players/PlayerComparisonPage.tsx). The live
    // integration identity is a per-spec, freshly-registered FREE-tier user
    // (fixtures/ui.ts → getSpecUserJwt('COMMISSIONER', …)) with no Stripe
    // subscription and accessLevel 'none', so useIsPremium() resolves false
    // and the gate renders a full-bleed `premium-feature-gate` overlay with
    // pointer-events disabled on the comparison children. A free user
    // therefore CANNOT click a search result to add a chip, build a 2-player
    // comparison, or remove a chip — the click is intercepted by the overlay
    // and hangs until the test times out (LS-7878; the prior assertion clicked
    // the dropdown option and blocked for the full 120s test timeout because
    // the premium-feature-gate subtree intercepted the pointer event).
    //
    // The full interactive comparison flow (add / compare table / remove) is
    // covered hermetically against a mocked premium user in
    // apps/web-e2e/src/tests/player-comparison.spec.ts, and the live GraphQL
    // premium gating is covered in subscription-gating.integration.spec.ts. So
    // the live UI suite asserts the two things that ARE true for a free user:
    // live search still round-trips to the real backend, and the premium gate
    // is shown.
    await test.step(`Live search for "${PLAYER_SEARCH_1}" returns results from the real backend`, async () => {
      // The dropdown renders each result as a `role="option"` Pressable whose
      // accessible name is the player's full name (PlayerComparison.tsx). The
      // browser-side `useGetPlayersWithStatsQuery` does NOT go through the
      // integration suite's fetchWithBackoff, and the production Apollo
      // RetryLink retries only network-level failures — NOT HTTP 429
      // (apps/web/src/lib/apollo-client.ts). So a transient throttle on the
      // shared live backend can leave the dropdown empty with no client retry.
      // Re-issue the search (clear + re-type flips the `search` variable from
      // skip→active, firing a fresh request) until a real result renders. The
      // option renders behind the gate (blurred, pointer-events: none) but is
      // still DOM-visible, so `fill()` (no pointer hit-test) and `toBeVisible`
      // both work. Backend-authoritative — only passes once the live search
      // actually returns PLAYER_SEARCH_1 — and bounded, so a genuinely empty
      // result still fails.
      const input = page.getByLabel('Search players to compare');
      const firstResult = page
        .getByRole('option', { name: new RegExp(PLAYER_SEARCH_1, 'i') })
        .first();
      await expect(async () => {
        await input.fill('');
        await input.fill(PLAYER_SEARCH_1);
        await expect(firstResult).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    });

    await test.step('Premium gate overlay blocks the comparison tool for a free-tier user', async () => {
      const gate = page.getByTestId('premium-feature-gate');
      await expect(gate).toBeVisible({ timeout: 15_000 });
      // Lock card copy + upgrade CTA confirm it is the real gate, not a
      // transient loading shell (PremiumGate.tsx).
      await expect(gate.getByText('Premium Feature').first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        gate.getByRole('button', { name: /upgrade to premium/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});

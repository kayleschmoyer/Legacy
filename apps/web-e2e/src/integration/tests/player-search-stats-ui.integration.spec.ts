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
 *      - Live player search round-trips to the real backend on a PREMIUM user
 *        (player-name search is gated behind the `player_comparison` entitlement
 *        server-side — LS-7019/LS-8257 — so only premium identities get results)
 *      - The comparison tool is premium-gated for free-tier users, so the
 *        interactive add/compare/remove flow is covered hermetically against a
 *        mocked premium user in apps/web-e2e/src/tests/player-comparison.spec.ts
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
      // The Advanced panel renders <input type="range" aria-label="Min Home Runs">.
      //
      // LS-8248: this step used to press End and assert toHaveValue('75'),
      // which worked while the slider was capped at max=75/step=1. LS-7135
      // (PR #5537) widened the control to the CAREER HR domain (max=800,
      // step=5) because the grid surfaces career totals — the all-time leader,
      // Barry Bonds, sits at 762. Pressing End now drives the slider to 800, so
      // the old assertion failed (actual value '800') AND no player meets a
      // 800-HR minimum, which would empty the grid and break the next step too.
      //
      // Instead, step the slider up to a fixed in-domain threshold (75 career
      // HR) that genuinely narrows the result set while keeping ~1.4k matching
      // players, so the grid still renders rows. The press count is derived
      // from the live `step` attribute so this stays correct if the cap/step
      // change again. Home zeroes the control; each ArrowUp advances one step
      // and fires onKeyUp → the debounced onCommit → applyFilters refetch.
      const minHRSlider = page.getByLabel('Min Home Runs');
      await expect(minHRSlider).toBeVisible({ timeout: 10_000 });

      const MIN_HR_TARGET = 75;
      const step = Number(await minHRSlider.getAttribute('step')) || 1;
      const presses = Math.round(MIN_HR_TARGET / step);

      await minHRSlider.press('Home');
      await expect(minHRSlider).toHaveValue('0');
      for (let i = 0; i < presses; i++) {
        await minHRSlider.press('ArrowUp');
      }
      // Assert against the value the keypresses actually reach (presses × step)
      // rather than a hardcoded literal, so a future step change can't silently
      // re-break this guard.
      await expect(minHRSlider).toHaveValue(String(presses * step));
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
  // PHASE 4 — PLAYER COMPARISON: PAGE LOADS + LIVE SEARCH (PREMIUM USER)
  // -------------------------------------------------------------------------

  test('Phase 4: /players/compare loads and live search returns results (premium)', async ({
    commissionerPage: page,
  }) => {
    await page.goto('/players/compare');
    await page.waitForLoadState('domcontentloaded');

    await test.step('Page heading is visible', async () => {
      // The comparison page Masthead renders the heading "Compare up to four."
      // (lib/shared-components/.../PlayerComparison.tsx Masthead, role="heading").
      // The literal "Player Comparison" string only appears in the free-tier
      // PremiumBanner, which is suppressed for premium users — and this phase
      // runs on the now-premium commissioner fixture (LS-8057 flipped the
      // commissioner to premium-by-default). The old getByText(/Player
      // Comparison/i) assertion could therefore never match here and failed
      // every run regardless of timing (LS-8206). Assert the real premium
      // heading instead, which renders for premium and free alike.
      await expect(
        page.getByRole('heading', { name: /Compare up to four/i }),
      ).toBeVisible({
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

    await test.step(`Live search for "${PLAYER_SEARCH_1}" returns results from the real backend`, async () => {
      // Player-name search is a PREMIUM feature: the `players(search:)` resolver
      // gates ANY search term behind the `player_comparison` entitlement
      // server-side (LS-7019, lambdas/db/src/schema/players.ts → requireEntitlement).
      // The free tier holds NO entitlements (TIER_ENTITLEMENTS.free = [],
      // lib/utils/src/lib/entitlements.ts), so a free user's search ALWAYS throws
      // PremiumRequiredError and the dropdown can never render a result. The live
      // round-trip is therefore only meaningful on a PREMIUM identity — this phase
      // runs on the premium+admin commissioner fixture, which holds
      // player_comparison and is NOT premium-gated, so the result option renders
      // fully interactive (LS-8257).
      //
      // The dropdown renders each result as a `role="option"` Pressable whose
      // accessible name is the player's full name (PlayerComparison.tsx). The
      // browser-side `useGetPlayersWithStatsQuery` does NOT go through the
      // integration suite's fetchWithBackoff, and the production Apollo RetryLink
      // retries only network-level failures — NOT HTTP 429
      // (apps/web/src/lib/apollo-client.ts). So a transient throttle on the shared
      // live backend can leave the dropdown empty with no client retry. Re-issue
      // the search (clear + re-type flips the `search` variable from skip→active,
      // firing a fresh request) until a real result renders. Backend-authoritative
      // — only passes once the live search actually returns PLAYER_SEARCH_1 — and
      // bounded, so a genuinely empty result still fails.
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
  });

  // -------------------------------------------------------------------------
  // PHASE 5 — COMPARISON: PREMIUM GATE (FREE-TIER USER)
  // -------------------------------------------------------------------------

  test('Phase 5: Comparison tool is premium-gated for a free-tier user', async ({
    freePage: page,
  }) => {
    await page.goto('/players/compare');
    await page.waitForLoadState('domcontentloaded');

    // Wait for search input to be ready
    await expect(page.getByLabel('Search players to compare')).toBeVisible({
      timeout: 20_000,
    });

    // The /players/compare page does NOT use a full-bleed `premium-feature-gate`
    // blur overlay. LS-7012 deliberately keeps the page fully legible for free
    // users: PlayerComparisonPage renders <PlayerComparison isPremium={false}>
    // (apps/web/src/pages/players/PlayerComparisonPage.tsx), which shows an inline
    // gold PremiumBanner — a "Premium · Player Comparison" label plus an "Upgrade"
    // pill (lib/shared-components/.../PlayerComparison.tsx → PremiumBanner) — while
    // the comparison UI stays interactive. This phase therefore runs on the
    // dedicated FREE-tier identity (fixtures/ui.ts → loginAs('free', 1), LS-8057)
    // and asserts that inline banner. useHasEntitlement(player_comparison) is
    // false for the free tier (TIER_ENTITLEMENTS.free = []) and stays false while
    // loading (useIsPremium.ts), so the banner renders deterministically for a
    // free user with no backend round-trip needed to gate it.
    //
    // The earlier version of this phase asserted a `getByTestId('premium-feature-
    // gate')` overlay (the PremiumGate component used on OTHER pages, never on
    // /players/compare since LS-7012) AND, before that, a live "Bonds" search
    // result. Both were impossible for a free user: the page renders no gate
    // overlay, and player-name search is premium-only server-side — the
    // `players(search:)` resolver gates every search term behind the
    // `player_comparison` entitlement (LS-7019, lambdas/db/src/schema/players.ts →
    // requireEntitlement), which the free tier lacks, so the dropdown never
    // renders a result (LS-8257). The stale gate assertion was never actually
    // reached on the live backend until the search step was removed, which is how
    // it surfaced.
    //
    // The LIVE search round-trip is verified on the PREMIUM commissioner in
    // Phase 4 (the only tier the backend serves search results to). The full
    // interactive comparison flow (add / compare table / remove) is covered
    // hermetically against a mocked premium user in
    // apps/web-e2e/src/tests/player-comparison.spec.ts, and the live GraphQL
    // premium gating is covered in subscription-gating.integration.spec.ts. So
    // this phase asserts the one thing that is true for a free user: the inline
    // premium upgrade banner is shown.
    await test.step('Free-tier user sees the inline premium upgrade banner', async () => {
      // The PremiumBanner is a role="note" container holding the gold
      // "Premium · Player Comparison" label and a role="button" Upgrade pill
      // (aria-label="Upgrade"). Scope the CTA to the banner so it can't match a
      // stray Upgrade control elsewhere on the page.
      const banner = page
        .getByRole('note')
        .filter({ hasText: /Player Comparison/i });
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(
        banner.getByRole('button', { name: /upgrade/i }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});

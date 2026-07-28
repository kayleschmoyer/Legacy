/**
 * Player Search & Stats Browsing — UI Integration Test (LS-754)
 *
 * True end-to-end integration test hitting the live backend.
 * No GraphQL mocking — all interactions use real API calls and a real browser.
 *
 * Covers the free-tier premium gate on the player comparison tool
 * (/players/compare). The batting-grid, Min-HR-filter, pitching-tab, and
 * premium-comparison-search coverage this file used to carry (former Phases
 * 1-4) now lives in the ADR-0016 shared-live dual-mode specs — retired here
 * once nightly shared-live coverage was confirmed green for 2 consecutive
 * nights (LS-8296):
 *   - player-stats-search.dual.spec.ts (batting grid, Min HR filter, pitching tab)
 *   - player-compare-search.dual.spec.ts (premium comparison search)
 *
 * Run:
 *   cd D:\code\legacy-sports-worktrees\LS-754-integration-test-player-search-stats
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     apps/web-e2e/src/integration/tests/player-search-stats-ui.integration.spec.ts
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/ui';

test.describe('Player Search and Stats Browsing UI (Live Backend) @integration', () => {
  test('Comparison tool is premium-gated for a free-tier user', async ({
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
    // player-compare-search.dual.spec.ts (the only tier the backend serves
    // search results to). The full interactive comparison flow (add / compare
    // table / remove) is covered
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

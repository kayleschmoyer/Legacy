/**
 * Player comparison — free-tier premium gate (dual-mode, ADR-0016, LS-9737).
 *
 * Converted from player-search-stats-ui.integration.spec.ts (the sole
 * remaining phase in that file — its batting-grid/pitching/premium-SEARCH
 * coverage already moved to player-stats-search.dual.spec.ts and
 * player-compare-search.dual.spec.ts, see LS-8296). ONE spec body, two
 * backends, selected by Playwright project:
 *
 *   • Hermetic (default): `useTier(page, 'free')` (via `test.use({ tier:
 *     'free' })`, LS-9737) pins the mock user's entitlements to the free
 *     tier, so `PlayerComparisonPage` renders `<PlayerComparison
 *     isPremium={false}>`.
 *   • Live (`shared-live` project): `tier: 'free'` authenticates as
 *     `loginAs('free', 1)` instead of the premium commissioner.
 *
 * LS-7012 deliberately keeps `/players/compare` fully legible for free
 * users — no full-bleed `premium-feature-gate` overlay — so the assertion is
 * the inline gold `PremiumBanner` ("Premium · Player Comparison" + an
 * "Upgrade" pill), not a blocked page. Player-name search itself is
 * entitlement-gated server-side (LS-7019/LS-8257) and is deliberately NOT
 * exercised here for a free user — the search round trip for a premium
 * identity is covered by player-compare-search.dual.spec.ts.
 */
import { test } from '../../fixtures/dual';

test.use({ tier: 'free' });

test.describe('Player comparison premium gate (dual-mode) @dual @regression', () => {
  test('free-tier user sees the inline premium upgrade banner', async ({
    playersPage,
  }) => {
    await playersPage.gotoCompare();
    await playersPage.compare.expectSearchVisible();
    await playersPage.compare.expectPremiumUpgradeCta();
  });
});

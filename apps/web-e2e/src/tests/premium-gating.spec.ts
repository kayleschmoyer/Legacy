import { expect, test } from '../fixtures/auth-enhanced';
import { enableFootball, useTier } from '../fixtures/shared-mocks';

/**
 * E2E coverage for the premium gating added in LS-5024.
 *
 * PlayerStats, View Game Logs (baseball + football), and the Player Detail
 * career-stats surface were previously ungated — a free user had full access to
 * advanced/historical statistics. Each is now wrapped in `PremiumGate`, so a
 * free user should see the blurred lock overlay + "Upgrade to Premium" CTA.
 *
 * Premium status is sourced from `GetUserById.subscriptionTier` by `useIsPremium`
 * (apps/web/src/hooks/useIsPremium.ts), and the baseline mock returns a premium
 * user (LS-5030). These specs pin the tier to FREE via `useTier` before
 * navigating so the gate renders. The gate overlay carries
 * `data-testid="premium-feature-gate"`.
 */

const GATE = 'premium-feature-gate';
const UPGRADE_CTA = /upgrade to premium/i;
const EXPORT_BUTTON = /export player statistics as json/i;

test.describe('Premium gating — free user @critical', () => {
  test('Player Stats page is gated for free users', async ({ page }) => {
    await useTier(page, 'free');
    await page.goto('/players/stats');

    await expect(page.getByTestId(GATE)).toBeVisible();
    await expect(
      page.getByRole('button', { name: UPGRADE_CTA }).first(),
    ).toBeVisible();
  });

  test('View Game Logs page is gated for free users', async ({ page }) => {
    await useTier(page, 'free');
    await page.goto('/players/view-game-logs');

    await expect(page.getByTestId(GATE)).toBeVisible();
    await expect(
      page.getByRole('button', { name: UPGRADE_CTA }).first(),
    ).toBeVisible();
  });

  test('Football Game Logs page is gated for free users', async ({ page }) => {
    await enableFootball(page);
    await useTier(page, 'free');
    await page.goto('/football/players/view-game-logs');

    await expect(page.getByTestId(GATE)).toBeVisible();
    await expect(
      page.getByRole('button', { name: UPGRADE_CTA }).first(),
    ).toBeVisible();
  });

  test('Player Detail career stats are gated for free users', async ({
    page,
  }) => {
    await useTier(page, 'free');
    await page.goto('/players/123');

    await expect(page.getByTestId(GATE)).toBeVisible();
    await expect(
      page.getByRole('button', { name: UPGRADE_CTA }).first(),
    ).toBeVisible();
  });
});

test.describe('Premium gating — premium user @critical', () => {
  test('View Game Logs page is not gated for premium users', async ({
    page,
  }) => {
    await useTier(page, 'premium');
    await page.goto('/players/view-game-logs');
    await page.waitForLoadState('load');

    // No lock overlay; the player-ID input is interactive (not behind the gate).
    await expect(page.getByTestId(GATE)).toHaveCount(0);
    await expect(page.getByPlaceholder('Enter player ID')).toBeVisible();
  });

  test('Player Stats Export JSON is available to premium users', async ({
    page,
  }) => {
    await useTier(page, 'premium');
    await page.goto('/players/stats');

    // No lock overlay, and the Export action is rendered (LS-5591 — export is
    // available to all entitlements, not premium-only).
    await expect(page.getByTestId(GATE)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: EXPORT_BUTTON }),
    ).toBeVisible();
  });
});

/**
 * LS-10766: signed-out visitors on public pages at phone width must not see
 * the signed-in mobile bottom tab bar (Players / Minigames / Alerts / You) —
 * every one of its tabs is auth-gated and bounced them to sign-in.
 */
import { expect, unauthTest } from '../fixtures/auth-enhanced';

unauthTest.describe(
  'Public pages at 375px — no signed-in bottom bar when signed out @regression',
  () => {
    unauthTest.use({ viewport: { width: 375, height: 667 } });

    for (const path of ['/pricing', '/help', '/terms', '/privacy']) {
      unauthTest(
        `${path} renders without the bottom navigation`,
        async ({ page }) => {
          await page.goto(path);
          await expect(page.getByTestId('main-content')).toBeVisible({
            timeout: 15_000,
          });

          await expect(
            page.getByRole('navigation', { name: 'Bottom navigation' }),
          ).toHaveCount(0);
        },
      );
    }
  },
);

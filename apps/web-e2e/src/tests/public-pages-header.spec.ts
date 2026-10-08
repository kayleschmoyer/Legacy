/**
 * LS-10767: signed-out visitors on public pages at desktop width used to get
 * no header at all — no logo, no way home, no way to sign in. They now get a
 * banner with a logo link to / and a Sign in control.
 */
import { expect, unauthTest } from '../fixtures/auth-enhanced';

unauthTest.describe(
  'Public pages at 1440px — signed-out header @regression',
  () => {
    unauthTest.use({ viewport: { width: 1440, height: 900 } });

    for (const path of ['/terms', '/privacy', '/pricing', '/help']) {
      unauthTest(
        `${path} shows a banner with a home logo and Sign in`,
        async ({ page }) => {
          await page.goto(path);
          await expect(page.getByTestId('main-content')).toBeVisible({
            timeout: 15_000,
          });

          const banner = page.getByRole('banner');
          await expect(
            banner.getByRole('link', { name: 'Legacy Sports home' }),
          ).toBeVisible();
          await expect(
            banner.getByRole('link', { name: 'Sign in' }),
          ).toBeVisible();
        },
      );
    }
  },
);

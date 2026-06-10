/**
 * Forgot Password entry point E2E tests (LS-5521)
 *
 * Verifies that the "Forgot password?" link on the login page is visible and
 * opens the oauth-proxy's forgot-password page in a new tab. The oauth-proxy
 * URL is configured as http://localhost:5001 in the E2E environment.
 */

import { expect, unauthTest } from '../fixtures/auth-enhanced';

const OAUTH_PROXY_URL = 'http://localhost:5001';
const FORGOT_PASSWORD_URL = `${OAUTH_PROXY_URL}/forgot-password`;

unauthTest.describe('Forgot Password link on login page (LS-5521)', () => {
  unauthTest.beforeEach(async ({ page }) => {
    // Stub the GSI script so the login page renders without a real Google
    // account. Mirrors the pattern in login-completion.spec.ts.
    await page.route('**/accounts.google.com/gsi/client', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.google = { accounts: { id: { initialize: function(){}, renderButton: function(){}, prompt: function(){}, cancel: function(){} }, oauth2: { initCodeClient: function(c){ return { requestCode: function(){ if(c.callback) c.callback({code:"fake"}); } }; } } } };',
      }),
    );

    await page.goto('/');
    await page.waitForLoadState('load');

    // Wait for login form to be ready.
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible({ timeout: 15000 });
  });

  unauthTest(
    '"Forgot password?" link is visible below the password field',
    async ({ page }) => {
      await expect(
        page.getByRole('button', { name: /forgot password/i }),
      ).toBeVisible();
    },
  );

  unauthTest(
    'clicking "Forgot password?" opens the reset page in a new tab',
    async ({ page }) => {
      // Fulfill the new-tab navigation so it doesn't need a running proxy.
      await page.context().route(FORGOT_PASSWORD_URL, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<html><body>Forgot password page</body></html>',
        }),
      );

      const popupPromise = page.context().waitForEvent('page');
      await page.getByRole('button', { name: /forgot password/i }).click();
      const popup = await popupPromise;

      await popup.waitForLoadState('domcontentloaded');
      expect(popup.url()).toBe(FORGOT_PASSWORD_URL);

      await popup.close();
    },
  );
});

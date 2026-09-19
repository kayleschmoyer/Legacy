/**
 * OAuth Login Error Handling — E2E Tests (LS-2096)
 *
 * auth-flows.spec.ts and login-completion.spec.ts only cover the happy path
 * for "Continue with Google" plus two backend failure statuses (403, 504).
 * This file closes the remaining gaps called out in LS-2096: the Google
 * authorization-code exchange rejected with `invalid_grant`, the user
 * declining consent on Google's screen (`access_denied`), a network failure
 * talking to the oauth-proxy, and that the login button recovers so the user
 * can retry after each failure.
 *
 * Hermetic (AC3): every network call is served with `page.route(...).fulfill()`
 * — the GSI script is stubbed (same mock as login-completion.spec.ts) so no
 * real Google popup or account is involved, and the oauth-proxy `/google`
 * call is either fulfilled with a canned error body or aborted with
 * `route.abort('failed')` to simulate a network failure. `route.continue()`
 * is never used.
 */

import { type Page } from '@playwright/test';
import { expect, unauthTest } from '../fixtures/auth-enhanced';
import { E2EJwtUtil } from '../utils/jwt';

const OAUTH_GOOGLE_URL = 'http://localhost:5001/google';

// ---------------------------------------------------------------------------
// GSI mock — same shape as login-completion.spec.ts's GSI_MOCK_WITH_HOOKS.
// initCodeClient's requestCode() fires the callback synchronously. A second
// mock body (GSI_MOCK_ACCESS_DENIED, below) fires error_callback instead, so
// the same shape can simulate the user declining Google's consent screen as
// well as the success path (callback with a code).
// ---------------------------------------------------------------------------

const GSI_MOCK_WITH_HOOKS = [
  'window.google = { accounts: {',
  '  id: {',
  '    initialize: function(config) {',
  '      window._gsiOneTapCallback = config.callback;',
  '    },',
  '    renderButton: function() {},',
  '    prompt: function() {},',
  '    cancel: function() {},',
  '  },',
  '  oauth2: {',
  '    initCodeClient: function(config) {',
  '      return {',
  '        requestCode: function() {',
  '          if (config.callback) config.callback({ code: "fake-auth-code" });',
  '        },',
  '      };',
  '    },',
  '  },',
  '}};',
].join('\n');

// GSI mock whose code client reports the user declining consent on Google's
// screen via `error_callback` — mirrors what google.accounts.oauth2's real
// client does when the consent popup is dismissed with a denial rather than
// a plain close. `error: 'access_denied'` matches Google's own OAuth2 error
// vocabulary; WebOAuthProvider's error_callback branch (the popup_closed /
// popup_failed_to_open cases don't match) rejects with OAuthErrorCode.UNKNOWN_ERROR,
// so the login page shows its generic retry copy rather than leaking the raw
// Google error string.
const GSI_MOCK_ACCESS_DENIED = [
  'window.google = { accounts: {',
  '  id: {',
  '    initialize: function(config) {',
  '      window._gsiOneTapCallback = config.callback;',
  '    },',
  '    renderButton: function() {},',
  '    prompt: function() {},',
  '    cancel: function() {},',
  '  },',
  '  oauth2: {',
  '    initCodeClient: function(config) {',
  '      return {',
  '        requestCode: function() {',
  '          if (config.error_callback) {',
  '            config.error_callback({ error: "access_denied", error_description: "The user denied access to the requested scope." });',
  '          }',
  '        },',
  '      };',
  '    },',
  '  },',
  '}};',
].join('\n');

async function routeGsiMock(page: Page, body: string = GSI_MOCK_WITH_HOOKS) {
  await page.route('**/accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body,
    }),
  );
}

async function clickGoogleButton(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('load');

  const loginButton = page.getByRole('button', {
    name: /continue with google/i,
  });
  await expect(loginButton).toBeVisible({ timeout: 15000 });
  await loginButton.click();
  return loginButton;
}

unauthTest.describe('OAuth login error handling — Google @regression', () => {
  // ---------------------------------------------------------------------------
  // invalid_grant — Google rejects the authorization code exchange (expired
  // or already-used code). The oauth-proxy maps this to a 400 with a generic
  // "could not exchange code" message (lambdas/oauth-proxy/src/handlers/
  // Google.ts handleSecureGoogleAuth) rather than leaking the raw Google
  // error string to the client.
  // ---------------------------------------------------------------------------

  unauthTest(
    'invalid_grant (expired/reused code) shows an error and lets the user retry',
    async ({ page }) => {
      await routeGsiMock(page);
      await page.route(OAUTH_GOOGLE_URL, (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid authorization code',
            message: 'Could not exchange code for user information',
          }),
        }),
      );

      const loginButton = await clickGoogleButton(page);

      await expect(
        page.getByText(/could not exchange code for user information/i),
      ).toBeVisible({ timeout: 10000 });

      // The button is not left disabled/stuck — the user can retry.
      await expect(loginButton).toBeVisible({ timeout: 5000 });
      await expect(loginButton).toBeEnabled();
    },
  );

  // ---------------------------------------------------------------------------
  // access_denied — the user declines consent on Google's screen. This never
  // reaches the oauth-proxy: WebOAuthProvider's error_callback rejects
  // locally, so no /google request should be sent.
  // ---------------------------------------------------------------------------

  unauthTest(
    'access_denied (user declines consent) shows a retryable error without calling the backend',
    async ({ page }) => {
      await routeGsiMock(page, GSI_MOCK_ACCESS_DENIED);

      let backendCalled = false;
      await page.route(OAUTH_GOOGLE_URL, (route) => {
        backendCalled = true;
        return route.fulfill({ status: 500, body: '{}' });
      });

      const loginButton = await clickGoogleButton(page);

      await expect(
        page.getByText(/sign-in failed\. please try again\./i),
      ).toBeVisible({ timeout: 10000 });

      await expect(loginButton).toBeVisible({ timeout: 5000 });
      await expect(loginButton).toBeEnabled();
      expect(backendCalled).toBe(false);
    },
  );

  // ---------------------------------------------------------------------------
  // Network error — the oauth-proxy is unreachable. `route.abort('failed')`
  // throws a TypeError("Failed to fetch") from the page's fetch call without
  // any request leaving the hermetic test environment (AC3). fetchWithRetry
  // retries twice with backoff before surfacing the failure.
  // ---------------------------------------------------------------------------

  unauthTest(
    'network failure talking to the oauth-proxy shows an error and lets the user retry',
    async ({ page }) => {
      await routeGsiMock(page);
      await page.route(OAUTH_GOOGLE_URL, (route) => route.abort('failed'));

      const loginButton = await clickGoogleButton(page);

      // fetchWithRetry retries twice (500ms/1000ms backoff) before giving up,
      // so allow enough time for all attempts to exhaust.
      await expect(
        page.getByText(/failed to fetch|something went wrong|network/i),
      ).toBeVisible({ timeout: 15000 });

      await expect(loginButton).toBeVisible({ timeout: 5000 });
      await expect(loginButton).toBeEnabled();
    },
  );

  // ---------------------------------------------------------------------------
  // Retry behavior — after a failed attempt, a subsequent click with a
  // healthy backend response succeeds. Reuses the invalid_grant failure as
  // the initial error, then swaps the route to the happy-path response.
  // ---------------------------------------------------------------------------

  unauthTest(
    'retrying after a failed sign-in attempt succeeds',
    async ({ page }) => {
      await routeGsiMock(page);
      await page.route(OAUTH_GOOGLE_URL, (route) =>
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Invalid authorization code',
            message: 'Could not exchange code for user information',
          }),
        }),
      );

      const loginButton = await clickGoogleButton(page);
      await expect(
        page.getByText(/could not exchange code for user information/i),
      ).toBeVisible({ timeout: 10000 });
      await expect(loginButton).toBeEnabled();

      const jwt = E2EJwtUtil.generateJwt({ email: 'user@test.com' });
      await page.unroute(OAUTH_GOOGLE_URL);
      await page.route(OAUTH_GOOGLE_URL, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jwt,
            csrfToken: 'e2e-csrf-token',
            user: {
              id: 1,
              email: 'user@test.com',
              username: 'testuser',
              accessLevel: 'none',
            },
          }),
        }),
      );

      await loginButton.click();

      await expect(loginButton).not.toBeVisible({ timeout: 10000 });
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible({ timeout: 10000 });
    },
  );
});

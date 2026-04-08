/**
 * Login Completion E2E Tests
 *
 * Covers both critical login paths:
 *   1. Google One Tap (automatic credential prompt)
 *   2. "Get Started with Google" button click (authorization code flow)
 *
 * Tagged @critical so these run on every PR CI pipeline as well as the
 * nightly suite. Any regression to either login path will fail CI before
 * reaching production.
 *
 * Architecture note: an enhanced GSI mock replaces the fixture's no-op stub
 * so Playwright can trigger both flows programmatically — no real Google
 * account or network call required.
 *   - One Tap: window._gsiOneTapCallback is captured from initialize() and
 *     fired explicitly by the test.
 *   - Button click: oauth2.initCodeClient returns a code client whose
 *     requestCode() immediately fires the callback with a fake auth code,
 *     simulating a user completing the Google consent popup.
 */

import { type Page } from '@playwright/test';
import { expect, unauthTest } from '../fixtures/auth-enhanced';
import { E2EJwtUtil } from '../utils/jwt';

// ---------------------------------------------------------------------------
// Type augmentation — _gsiOneTapCallback is injected by the GSI mock below.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    _gsiOneTapCallback?: (response: { credential: string }) => void;
  }
}

// ---------------------------------------------------------------------------
// Enhanced GSI mock
//
// Replaces the no-op stub in auth-enhanced.ts so both login flows can be
// exercised without a real Google account:
//
//   One Tap:     initialize() captures config.callback → exposed as
//                window._gsiOneTapCallback → test fires it explicitly.
//
//   Button click: initCodeClient() returns a code client whose requestCode()
//                immediately fires the callback with a fake auth code,
//                simulating the user completing the Google consent popup.
//
// Both flows share this single mock so the landing page can initialise
// fully (One Tap + button) without any no-op stubs leaking into either path.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the app to register the One Tap callback with the GSI mock,
 * then fire it with a fake Google credential.
 */
async function fireOneTapCallback(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof window._gsiOneTapCallback === 'function',
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    const cb = window._gsiOneTapCallback;
    if (cb) cb({ credential: 'fake-google-id-token' });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

unauthTest.describe('Login Completion — One Tap flow @critical', () => {
  unauthTest.beforeEach(async ({ page }) => {
    // Override the GSI script with our hook version so the One Tap callback
    // can be captured and fired by the test. This route runs before the
    // fixture's catch-all (Playwright LIFO order), so it takes priority.
    await page.route('**/accounts.google.com/gsi/client', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: GSI_MOCK_WITH_HOOKS,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  unauthTest(
    'successful One Tap credential authenticates the user and shows the app',
    async ({ page }) => {
      const jwt = E2EJwtUtil.generateJwt({ email: 'user@test.com' });

      await page.route('http://localhost:5001/google', (route) =>
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

      await page.goto('/');
      await page.waitForLoadState('load');

      // Confirm unauthenticated state before triggering login.
      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 15000 });

      await fireOneTapCallback(page);

      // The landing page should disappear once the JWT is stored.
      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).not.toBeVisible({ timeout: 10000 });

      // The primary navigation confirms the authenticated shell has rendered.
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible({ timeout: 10000 });
    },
  );

  // -------------------------------------------------------------------------
  // 504 — Gateway Timeout (the bug that prompted this spec)
  // -------------------------------------------------------------------------

  unauthTest(
    '/google 504 shows an error and keeps the user on the landing page',
    async ({ page }) => {
      await page.route('http://localhost:5001/google', (route) =>
        route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Endpoint request timed out' }),
        }),
      );

      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 15000 });

      await fireOneTapCallback(page);

      // Error message from AuthService.callSecureOAuth appears on the landing page.
      await expect(page.getByText(/secure oauth failed: 504/i)).toBeVisible({
        timeout: 10000,
      });

      // User must remain unauthenticated — the login button stays visible.
      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 5000 });
    },
  );

  // -------------------------------------------------------------------------
  // 403 — Unauthorized user
  // -------------------------------------------------------------------------

  unauthTest(
    '/google 403 shows an access-denied error and keeps the user on the landing page',
    async ({ page }) => {
      await page.route('http://localhost:5001/google', (route) =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          // Message must include "User not authorized" so AuthService maps it
          // to the user-friendly "Access denied: ..." string.
          body: JSON.stringify({
            message: 'User not authorized for this application',
          }),
        }),
      );

      await page.goto('/');
      await page.waitForLoadState('load');

      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 15000 });

      await fireOneTapCallback(page);

      // AuthService.handleAuthenticationError maps 403 to the access-denied message.
      await expect(page.getByText(/access denied/i)).toBeVisible({
        timeout: 10000,
      });

      // User must remain unauthenticated.
      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 5000 });
    },
  );
});

// ---------------------------------------------------------------------------
// Button-click login flow (authorization code flow)
//
// The "Get Started with Google" button calls OAuthProvider.signIn() →
// signInWithAuthCode() → google.accounts.oauth2.initCodeClient({ callback })
// → requestCode(). The enhanced GSI mock fires the callback immediately with
// a fake auth code, so the test never opens a real Google popup.
// ---------------------------------------------------------------------------

unauthTest.describe('Login Completion — button-click flow @critical', () => {
  unauthTest.beforeEach(async ({ page }) => {
    await page.route('**/accounts.google.com/gsi/client', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: GSI_MOCK_WITH_HOOKS,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  unauthTest(
    'clicking Get Started authenticates the user and shows the app',
    async ({ page }) => {
      const jwt = E2EJwtUtil.generateJwt({ email: 'user@test.com' });

      await page.route('http://localhost:5001/google', (route) =>
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

      await page.goto('/');
      await page.waitForLoadState('load');

      const loginButton = page.getByRole('button', {
        name: /get started with google/i,
      });
      await expect(loginButton).toBeVisible({ timeout: 15000 });

      // Clicking triggers signInWithAuthCode → requestCode → fake code callback
      // → POST /oauth/google (mocked) → JWT stored → auth state updates.
      await loginButton.click();

      await expect(loginButton).not.toBeVisible({ timeout: 10000 });
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible({ timeout: 10000 });
    },
  );

  // -------------------------------------------------------------------------
  // 504 — Gateway Timeout
  // -------------------------------------------------------------------------

  unauthTest(
    'button-click /google 504 shows an error and keeps the user on the landing page',
    async ({ page }) => {
      await page.route('http://localhost:5001/google', (route) =>
        route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Endpoint request timed out' }),
        }),
      );

      await page.goto('/');
      await page.waitForLoadState('load');

      const loginButton = page.getByRole('button', {
        name: /get started with google/i,
      });
      await expect(loginButton).toBeVisible({ timeout: 15000 });
      await loginButton.click();

      await expect(page.getByText(/secure oauth failed: 504/i)).toBeVisible({
        timeout: 10000,
      });
      await expect(loginButton).toBeVisible({ timeout: 5000 });
    },
  );

  // -------------------------------------------------------------------------
  // 403 — Unauthorized user
  // -------------------------------------------------------------------------

  unauthTest(
    'button-click /google 403 shows an access-denied error and keeps the user on the landing page',
    async ({ page }) => {
      await page.route('http://localhost:5001/google', (route) =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'User not authorized for this application',
          }),
        }),
      );

      await page.goto('/');
      await page.waitForLoadState('load');

      const loginButton = page.getByRole('button', {
        name: /get started with google/i,
      });
      await expect(loginButton).toBeVisible({ timeout: 15000 });
      await loginButton.click();

      await expect(page.getByText(/access denied/i)).toBeVisible({
        timeout: 10000,
      });
      await expect(loginButton).toBeVisible({ timeout: 5000 });
    },
  );
});

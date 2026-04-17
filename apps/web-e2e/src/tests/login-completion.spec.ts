/**
 * Login Completion E2E Tests
 *
 * Covers the primary login path and a regression guard:
 *   1. "Continue with Google" button click (authorization code flow)
 *   2. Regression guard: One Tap must NOT be initialized on the landing page
 *      (re-enabling it would trigger a FedCM "Not signed in with the identity
 *      provider." console error for anonymous visitors on Chrome 120+).
 *
 * Tagged @critical so these run on every PR CI pipeline as well as the
 * nightly suite. Any regression to the login path will fail CI before
 * reaching production.
 *
 * Architecture note: an enhanced GSI mock replaces the fixture's no-op stub
 * so Playwright can trigger the button-click flow programmatically — no real
 * Google account or network call required.
 *   - Button click: oauth2.initCodeClient returns a code client whose
 *     requestCode() immediately fires the callback with a fake auth code,
 *     simulating a user completing the Google consent popup.
 *   - One Tap is disabled on the landing page; initialize() is never called,
 *     so window._gsiOneTapCallback stays undefined. The regression guard test
 *     asserts this explicitly.
 */

import { type Page } from '@playwright/test';
import { expect, unauthTest } from '../fixtures/auth-enhanced';
import { E2EJwtUtil } from '../utils/jwt';

// ---------------------------------------------------------------------------
// Type augmentation — _gsiOneTapCallback is injected by the GSI mock below
// only when google.accounts.id.initialize() is called. When One Tap is
// disabled it remains undefined; the regression guard test asserts this.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    _gsiOneTapCallback?: (response: { credential: string }) => void;
  }
}

// ---------------------------------------------------------------------------
// Enhanced GSI mock
//
// Replaces the no-op stub in auth-enhanced.ts so the button-click login flow
// can be exercised without a real Google account:
//
//   initialize(): captures config.callback → window._gsiOneTapCallback.
//     (Not called on the landing page since One Tap is disabled there — the
//      regression guard test verifies _gsiOneTapCallback stays undefined.)
//
//   initCodeClient(): returns a code client whose requestCode() immediately
//     fires the callback with a fake auth code, simulating the user completing
//     the Google consent popup.
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
// GSI mock with FedCM error simulation
//
// Extends GSI_MOCK_WITH_HOOKS so that google.accounts.id.prompt() emits the
// same console error the real GSI library logs when FedCM is triggered but the
// user is not signed in to Google:
//   "[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token."
//
// Purpose: when this mock is active, any code path that calls prompt() on page
// load will directly surface the LS-3529 symptom, making the regression guard
// test (below) fail for the right reason rather than requiring a second look at
// the _gsiOneTapCallback mechanism test.
// ---------------------------------------------------------------------------

const GSI_MOCK_WITH_FEDCM_SIMULATION = [
  'window.google = { accounts: {',
  '  id: {',
  '    initialize: function(config) {',
  '      window._gsiOneTapCallback = config.callback;',
  '    },',
  '    renderButton: function() {},',
  '    prompt: function() {',
  '      console.error("[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token.");',
  '    },',
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

async function routeGsiMock(page: Page): Promise<void> {
  await page.route('**/accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: GSI_MOCK_WITH_HOOKS,
    }),
  );
}

// ---------------------------------------------------------------------------
// One Tap disabled regression guard
//
// One Tap was disabled on the landing page to prevent the FedCM browser error
// "Not signed in with the identity provider." for anonymous visitors on
// Chrome 120+. This test guards against regressions that would re-enable it.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'One Tap disabled on landing page (FedCM regression guard) @critical',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await routeGsiMock(page);
    });

    unauthTest(
      'google.accounts.id.initialize is never called on /, so _gsiOneTapCallback stays undefined',
      async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('load');

        // Wait for the page to finish initialising (OAuth configure + button render).
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });

        // One Tap must not be initialized: google.accounts.id.initialize() is
        // never called when oneTap is disabled, so _gsiOneTapCallback stays
        // undefined. Re-enabling it would restore the FedCM console error on
        // Chrome 120+ for every anonymous visitor.
        const oneTapInitialized = await page.evaluate(
          () => typeof window._gsiOneTapCallback === 'function',
        );
        expect(oneTapInitialized).toBe(false);
      },
    );
  },
);

// ---------------------------------------------------------------------------
// FedCM console error absent on / page load (LS-3529)
//
// The real GSI library emits "[GSI_LOGGER]: FedCM get() rejects with
// NetworkError: Error retrieving a token." when prompt() is called but no
// Google account is signed in. One Tap was disabled on the landing page
// (LS-3467) to prevent this. This test uses GSI_MOCK_WITH_FEDCM_SIMULATION
// so that any accidental call to prompt() on page load is surfaced as a
// console error, making future regressions fail here directly.
// ---------------------------------------------------------------------------

unauthTest.describe(
  'FedCM console error absent on / page load (LS-3529) @critical',
  () => {
    unauthTest(
      '[GSI_LOGGER] FedCM error is not logged on / — One Tap is disabled so prompt() is never called',
      async ({ page }) => {
        const fedcmErrors: string[] = [];
        page.on('console', (msg) => {
          const text = msg.text();
          if (text.includes('[GSI_LOGGER]') || text.includes('FedCM get()')) {
            fedcmErrors.push(text);
          }
        });

        // Override the fixture GSI mock: prompt() now emits the real FedCM
        // error. Takes precedence over the fixture catch-all via LIFO ordering.
        await page.route('**/accounts.google.com/gsi/client', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: GSI_MOCK_WITH_FEDCM_SIMULATION,
          }),
        );

        await page.goto('/');
        await page.waitForLoadState('load');

        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15000 });

        // One Tap is disabled → prompt() never called → no FedCM error logged.
        expect(
          fedcmErrors,
          'Expected no [GSI_LOGGER] FedCM console errors on / page load',
        ).toHaveLength(0);
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Button-click login flow (authorization code flow)
//
// The "Continue with Google" button calls OAuthProvider.signIn() →
// signInWithAuthCode() → google.accounts.oauth2.initCodeClient({ callback })
// → requestCode(). The enhanced GSI mock fires the callback immediately with
// a fake auth code, so the test never opens a real Google popup.
// ---------------------------------------------------------------------------

unauthTest.describe('Login Completion — button-click flow @critical', () => {
  unauthTest.beforeEach(async ({ page }) => {
    await routeGsiMock(page);
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
        name: /continue with google/i,
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
        name: /continue with google/i,
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
        name: /continue with google/i,
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

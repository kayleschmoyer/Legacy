/**
 * Google OAuth — Integration Tests
 *
 * Validates the live /oauth/google Lambda endpoint and the Google sign-in UI.
 * API smoke tests hit the real backend directly.  The UI popup flow uses
 * route.fulfill() to mock only the third-party Google OAuth endpoints so the
 * test runs hermetically in headless CI without real Google credentials.
 *
 * Test categories:
 *
 *   1. API smoke tests (always run)
 *      — POST /oauth/google with an invalid credential → 400 in < 15 s
 *      — POST /oauth/google with no body → 400 in < 15 s
 *      These directly validate the LS-2733 fix (reduced serial network calls
 *      that caused 504 Gateway Timeout on every cold Lambda invocation).
 *
 *   2. UI popup flow (hermetic — no real Google credentials required)
 *      — Navigate to INTEGRATION_WEB_URL, click "Continue with Google".
 *      The Google GSI library is intercepted via route.fulfill() and replaced
 *      with a minimal stub that delivers a mock auth code immediately without
 *      opening a real popup.  The /oauth/google backend call is also
 *      intercepted so the frontend auth-state machine transitions without
 *      hitting the real Google or API endpoints.
 *
 * Environment variables:
 *   INTEGRATION_WEB_URL    — Live web app base URL (default: https://legacy-fantasy.com)
 *   INTEGRATION_BASE_URL   — Live API base URL    (default: https://api.legacy-fantasy.com/)
 */

import { expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OAUTH_BASE = (
  process.env.INTEGRATION_BASE_URL?.trim() || 'https://api.legacy-fantasy.com/'
).replace(/\/?$/, '/');

const OAUTH_GOOGLE_URL = `${OAUTH_BASE}oauth/google`;

const WEB_BASE =
  process.env.INTEGRATION_WEB_URL?.trim() || 'https://legacy-fantasy.com';

/** Maximum response time we accept — anything longer indicates a timeout risk. */
const MAX_RESPONSE_MS = 15_000;

// Suppress Chromium automation detection flags as much as possible.
// Must be top-level (not inside a describe) because it forces a new worker.
// Note: headless mode is still detected by Google; run with --headed for
// reliable results in development.
test.use({
  launchOptions: {
    args: ['--disable-blink-features=AutomationControlled'],
  },
});

// ---------------------------------------------------------------------------
// API smoke tests — always run, no browser needed
// ---------------------------------------------------------------------------

test.describe('Google OAuth — API smoke tests @critical', () => {
  test('/oauth/google returns 400 (not 504) for an invalid credential within 15 s', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MAX_RESPONSE_MS + 5_000,
    );
    try {
      const start = Date.now();
      const res = await fetch(OAUTH_GOOGLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: 'invalid-google-id-token' }),
        signal: controller.signal,
      });
      const elapsed = Date.now() - start;

      // The Lambda must reply before API Gateway's 29 s hard timeout.
      // If API Gateway returns a 504, fetch resolves (not rejects) —
      // the caller must check res.status rather than catching a rejection.
      expect(
        res.status,
        `Expected 400 for invalid credential but got ${res.status}`,
      ).toBe(400);

      expect(
        elapsed,
        `Response took ${elapsed} ms — expected < ${MAX_RESPONSE_MS} ms. ` +
          'A slow response may indicate the Secrets Manager caching fix (LS-2733) is not deployed.',
      ).toBeLessThan(MAX_RESPONSE_MS);
    } finally {
      clearTimeout(timeout);
    }
  });

  test('/oauth/google returns 400 for a missing body within 15 s', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MAX_RESPONSE_MS + 5_000,
    );
    try {
      const start = Date.now();
      const res = await fetch(OAUTH_GOOGLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      const elapsed = Date.now() - start;

      expect(res.status).toBe(400);
      expect(elapsed).toBeLessThan(MAX_RESPONSE_MS);
    } finally {
      clearTimeout(timeout);
    }
  });

  test('/oauth/google returns 400 for an invalid auth code within 15 s', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MAX_RESPONSE_MS + 5_000,
    );
    try {
      const start = Date.now();
      const res = await fetch(OAUTH_GOOGLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'invalid-auth-code' }),
        signal: controller.signal,
      });
      const elapsed = Date.now() - start;

      expect(res.status).toBe(400);
      expect(elapsed).toBeLessThan(MAX_RESPONSE_MS);
    } finally {
      clearTimeout(timeout);
    }
  });
});

// ---------------------------------------------------------------------------
// UI popup flow — hermetic (Google GSI + backend both mocked)
// ---------------------------------------------------------------------------

/**
 * Build a minimal JWT whose payload can be decoded by the frontend
 * AuthService.getUserFromToken() without hitting the real backend.
 */
function makeMockJwt(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      accessLevel: 'none',
      // Far-future expiry so the frontend never attempts a proactive refresh.
      exp: Math.floor(Date.now() / 1000) + 3_600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.mock-sig`;
}

/** Minimal Google Identity Services stub injected via route.fulfill(). */
const GSI_STUB = `
  window.google = {
    accounts: {
      id: {
        initialize: function() {},
        prompt: function(cb) {
          if (typeof cb === 'function') {
            cb({
              getMomentType: function() { return 'skipped'; },
              getSkippedReason: function() { return 'user_cancel'; },
              getDismissedReason: function() { return undefined; },
              getNotDisplayedReason: function() { return undefined; },
            });
          }
        },
        cancel: function() {},
        renderButton: function() {},
      },
      oauth2: {
        initCodeClient: function(config) {
          return {
            requestCode: function() {
              // Deliver a mock auth code on the next tick so the caller's
              // promise chain is established before the callback fires.
              setTimeout(function() {
                config.callback({ code: 'mock-authorization-code' });
              }, 0);
            },
          };
        },
      },
    },
  };
`;

test.describe('Google OAuth — UI popup flow', () => {
  test('clicking Continue with Google authenticates via popup and shows the app', async ({
    browser,
  }) => {
    // Open a fresh browser context with no pre-existing auth cookies.
    const context = await browser.newContext({
      baseURL: WEB_BASE,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
    });

    // Replace the real GSI library with our stub so no popup ever opens and
    // no requests reach accounts.google.com.
    await context.route(
      'https://accounts.google.com/gsi/client',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: GSI_STUB,
        });
      },
    );

    // Intercept the frontend's POST to /oauth/google and return a mock JWT so
    // the auth-state machine transitions to authenticated without hitting the
    // real Lambda.
    const mockJwt = makeMockJwt();
    await context.route('**/oauth/google', async (route, request) => {
      if (request.method() !== 'POST') {
        await route.fulfill({ status: 405 });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jwt: mockJwt, csrfToken: 'mock-csrf' }),
      });
    });

    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.waitForLoadState('load');

      // Confirm we are on the unauthenticated landing page.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).toBeVisible({ timeout: 20_000 });

      // Click — the GSI stub delivers a mock code immediately; the mocked
      // /oauth/google route returns a JWT; the app transitions to authenticated.
      await page.getByRole('button', { name: /continue with google/i }).click();

      // The landing page button should disappear as the app transitions to
      // the authenticated shell.
      await expect(
        page.getByRole('button', { name: /continue with google/i }),
      ).not.toBeVisible({ timeout: 20_000 });

      // Primary navigation confirms authenticated state.
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  });
});

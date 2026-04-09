/**
 * Google OAuth — Integration Tests
 *
 * Validates the live /oauth/google Lambda endpoint and the Google sign-in UI
 * against the real backend.  No route.fulfill() mocking — every request hits
 * the actual server.
 *
 * Test categories:
 *
 *   1. API smoke tests (always run)
 *      — POST /oauth/google with an invalid credential → 400 in < 15 s
 *      — POST /oauth/google with no body → 400 in < 15 s
 *      These directly validate the LS-2733 fix (reduced serial network calls
 *      that caused 504 Gateway Timeout on every cold Lambda invocation).
 *
 *   2. UI popup flow (requires GOOGLE_TEST_EMAIL + GOOGLE_TEST_PASSWORD + GOOGLE_OAUTH_POPUP_TEST env vars)
 *      — Navigate to INTEGRATION_WEB_URL, click "Get Started with Google",
 *        fill credentials in the Google sign-in popup, verify auth.
 *      Skipped automatically when env vars are absent so local runs without
 *      credentials don't fail.  Also skipped unless GOOGLE_OAUTH_POPUP_TEST=1
 *      because headless Chromium is blocked by Google and this test must be
 *      run in headed mode to be reliable.
 *
 * Environment variables:
 *   GOOGLE_TEST_EMAIL      — Google account email (e.g. test@gmail.com)
 *   GOOGLE_TEST_PASSWORD   — Google account password
 *   GOOGLE_OAUTH_POPUP_TEST — Set to any truthy value to enable the UI popup
 *                             flow test.  Omit (or leave empty) in CI to skip
 *                             the test in headless environments where Google
 *                             blocks sign-in.
 *   INTEGRATION_WEB_URL    — Live web app base URL (default: https://legacy-fantasy.com)
 *   INTEGRATION_BASE_URL   — Live API base URL    (default: https://api.legacy-fantasy.com/)
 *
 * Known limitation: Google actively blocks headless Chromium sign-in.  The UI
 * popup test succeeds most reliably when run in headed mode:
 *   pnpm exec playwright test --config apps/web-e2e/playwright.integration.config.ts \
 *     apps/web-e2e/src/integration/tests/google-oauth.integration.spec.ts --headed
 * In CI (headless), Google may redirect to a "couldn't sign you in" page.
 * The test will retry twice (per playwright.integration.config.ts retries: 2)
 * before reporting as failed.
 */

import { expect, type Page, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OAUTH_BASE = (
  process.env.INTEGRATION_BASE_URL?.trim() || 'https://api.legacy-fantasy.com/'
).replace(/\/?$/, '/');

const OAUTH_GOOGLE_URL = `${OAUTH_BASE}oauth/google`;

const WEB_BASE =
  process.env.INTEGRATION_WEB_URL?.trim() || 'https://legacy-fantasy.com';

const GOOGLE_EMAIL = process.env['GOOGLE_TEST_EMAIL'] ?? '';
const GOOGLE_PASSWORD = process.env['GOOGLE_TEST_PASSWORD'] ?? '';

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
// UI popup flow — requires GOOGLE_TEST_EMAIL / GOOGLE_TEST_PASSWORD
// ---------------------------------------------------------------------------

/**
 * Fill Google's email + password sign-in form inside a Playwright Page.
 *
 * Google's sign-in UI has changed several times; this helper handles the
 * current two-step flow (email → Next → password → Next).  Selectors are
 * chosen to be as stable as possible, but they may need updating if Google
 * redesigns the login page.
 */
async function fillGoogleSignIn(
  popup: Page,
  email: string,
  password: string,
): Promise<void> {
  // Step 1 — email
  await popup.waitForSelector('#identifierId', { timeout: 30_000 });
  await popup.fill('#identifierId', email);
  // Click "Next" after email
  await popup.click('#identifierNext button, button:has-text("Next")');

  // Step 2 — password (different selector from email step)
  await popup.waitForSelector('[name="Passwd"], [name="password"]', {
    timeout: 30_000,
  });
  const passwordSelector = (await popup.$('[name="Passwd"]'))
    ? '[name="Passwd"]'
    : '[name="password"]';
  await popup.fill(passwordSelector, password);
  await popup.click('#passwordNext button, button:has-text("Next")');

  // Handle optional consent / "Choose an account" / "Allow" screens.
  // We click "Allow" if it appears; other prompts are ignored.
  try {
    await popup.waitForSelector('button:has-text("Allow")', { timeout: 8_000 });
    await popup.click('button:has-text("Allow")');
  } catch {
    // Not present — carry on.
  }
}

test.describe('Google OAuth — UI popup flow', () => {
  // Skip the entire describe block if credentials are absent OR if the
  // opt-in env var is not set.  Google blocks headless Chromium sign-in, so
  // this test must be explicitly enabled (GOOGLE_OAUTH_POPUP_TEST=1) and run
  // in headed mode to produce reliable results.
  test.skip(
    !process.env['GOOGLE_OAUTH_POPUP_TEST'] ||
      !GOOGLE_EMAIL ||
      !GOOGLE_PASSWORD,
    'Popup flow test is opt-in: set GOOGLE_OAUTH_POPUP_TEST=1 (plus GOOGLE_TEST_EMAIL / ' +
      'GOOGLE_TEST_PASSWORD) and run in --headed mode to enable this test.',
  );

  test('clicking Get Started with Google authenticates via popup and shows the app', async ({
    browser,
  }) => {
    // Open a fresh browser context with no pre-existing auth cookies.
    const context = await browser.newContext({
      baseURL: WEB_BASE,
      // Provide a realistic user agent so Google is less likely to block.
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.waitForLoadState('load');

      // Confirm we are on the unauthenticated landing page.
      await expect(
        page.getByRole('button', { name: /get started with google/i }),
      ).toBeVisible({ timeout: 20_000 });

      // Listen for the Google popup BEFORE clicking so we don't race.
      const popupPromise = context.waitForEvent('page');
      await page
        .getByRole('button', { name: /get started with google/i })
        .click();
      const popup = await popupPromise;

      // Fill credentials inside the Google sign-in popup.
      await fillGoogleSignIn(popup, GOOGLE_EMAIL, GOOGLE_PASSWORD);

      // Wait for the popup to close (Google redirects back to the app on success).
      await popup.waitForEvent('close', { timeout: 60_000 });

      // The landing page button should disappear as the app transitions to
      // the authenticated shell.
      await expect(
        page.getByRole('button', { name: /get started with google/i }),
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

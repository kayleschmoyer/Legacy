import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { E2E_CSRF_TOKEN, signTestJwt, withApiIsolation } from './api-isolation';
import { attributePageCoverage, snapshotCoverageBaseline } from './coverage';

/** Read the base URL that Playwright is actually using (set in playwright.config.ts). */
const E2E_ORIGIN = `http://localhost:${process.env.E2E_PORT || 4280}`;

/**
 * Build a Playwright storageState object for cookie-based auth.
 * Sets the HttpOnly JWT cookie, the JS-readable CSRF cookie,
 * and caches the user profile + token expiry in localStorage.
 */
export function buildAuthStorageState(
  jwt: string,
  userOverrides: Record<string, unknown> = {},
) {
  const payload = JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString(),
  ) as {
    id?: number;
    email?: string;
    username?: string;
    accessLevel?: string;
    exp?: number;
  };

  const userProfile = {
    id: payload.id ?? 1,
    email: payload.email ?? 'user@test.com',
    username: payload.username ?? 'testuser',
    accessLevel: payload.accessLevel ?? 'none',
    ...userOverrides,
  };

  // Fixed far-future expiry (2100-01-01) so issued storage-state JWTs are
  // deterministic across runs and never expire mid-suite. The runtime
  // cookie-validity check in api-isolation.ts still compares against
  // wall-clock Date.now() — that's appropriate use, not a fixture-time embed.
  const FAR_FUTURE_EPOCH_SEC = 4_102_444_800;
  const expiry = payload.exp ?? FAR_FUTURE_EPOCH_SEC;

  return {
    cookies: [
      {
        name: 'ls_jwt',
        value: jwt,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
        expires: expiry,
      },
      {
        name: 'ls_csrf',
        value: E2E_CSRF_TOKEN,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
        expires: expiry,
      },
    ],
    origins: [
      {
        origin: E2E_ORIGIN,
        localStorage: [
          { name: 'ls_user_profile', value: JSON.stringify(userProfile) },
          { name: 'ls_token_expiry', value: String(expiry) },
          // getCsrfToken() checks ls_csrf_token in localStorage first (before
          // document.cookie). Pre-seeding this key ensures the CSRF header is
          // always sent correctly without falling back to cookie parsing.
          { name: 'ls_csrf_token', value: E2E_CSRF_TOKEN },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// API isolation — the hermetic route-interception layer lives in
// api-isolation.ts (extracted for reuse by the dual-mode fixtures, LS-8290).
// This fixture applies it unconditionally: every test built on this base is
// hermetic — no request leaves the static file server.
// ---------------------------------------------------------------------------

const isolated = base.extend<{ _apiIsolation: void; _coverage: void }>({
  // Per-test source-coverage collection (LS-7849). Snapshots window.__coverage__
  // before/after the test and attributes executed source files to the owning
  // spec, writing a per-shard fragment uploaded by the nightly workflow. Fully
  // gated on COLLECT_COVERAGE and best-effort — a no-op in PR CI / local runs.
  _coverage: [
    async (
      { page }: { page: Page },
      use: () => Promise<void>,
      testInfo: TestInfo,
    ) => {
      const baseline = await snapshotCoverageBaseline(page);
      await use();
      await attributePageCoverage(page, testInfo, baseline);
    },
    { auto: true },
  ],
  _apiIsolation: [
    async (
      { page }: { page: Page },
      use: () => Promise<void>,
      testInfo: TestInfo,
    ) => {
      await withApiIsolation(page, testInfo, use);
    },
    { auto: true },
  ],
});

// ---------------------------------------------------------------------------
// Default authenticated test — uses the storageState set by global-setup.ts.
// No extra setup is needed; the JWT is already in localStorage.
// If your test requires GraphQL mocking, add page.route() calls in the test.
// ---------------------------------------------------------------------------

export const test = isolated;

// ---------------------------------------------------------------------------
// Admin test — overrides the storageState JWT with an admin-level token.
// ---------------------------------------------------------------------------

export const adminTest = isolated.extend({
  /** Override storageState so this context has an admin JWT instead. */
  storageState: async ({}, use) => {
    const jwt = signTestJwt({
      email: 'admin@test.com',
      username: 'admin',
      accessLevel: 'admin',
    });

    await use(buildAuthStorageState(jwt));
  },
});

// ---------------------------------------------------------------------------
// Custom user test factory — creates a test fixture with a specific identity.
// ---------------------------------------------------------------------------

export function createCustomAuthTest(
  email: string,
  accessLevel: 'none' | 'admin' = 'none',
) {
  return isolated.extend({
    storageState: async ({}, use) => {
      const jwt = signTestJwt({
        email,
        username: email.split('@')[0],
        accessLevel,
      });

      await use(buildAuthStorageState(jwt));
    },
  });
}

// ---------------------------------------------------------------------------
// Unauthenticated test — explicitly clears auth state so the login page shows.
// Use this for tests that verify the login flow itself.
// ---------------------------------------------------------------------------

export const unauthTest = isolated.extend<{
  _unauthClearAuth: void;
}>({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
  // The base _apiIsolation fixture injects an initScript that seeds
  // ls_user_profile into localStorage when it's absent (needed for WebKit
  // where storageState localStorage is not reliably applied).  That script
  // runs for every test — including unauthTest, which intentionally has no
  // auth state.  This auto-fixture adds a second initScript that clears the
  // seeded auth keys, ensuring WebKit and Chromium/Firefox both start the
  // unauthenticated test contexts with no cached user profile.
  _unauthClearAuth: [
    async ({ page }: { page: Page }, use: () => Promise<void>) => {
      await page.addInitScript(() => {
        window.localStorage.removeItem('ls_user_profile');
        window.localStorage.removeItem('ls_token_expiry');
        window.localStorage.removeItem('ls_csrf_token');
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

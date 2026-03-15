import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { sign } from 'jsonwebtoken';

import {
  BASELINE_GRAPHQL_RESPONSES,
  extractOperationName,
} from './shared-mocks';

/** Read the base URL that Playwright is actually using (set in playwright.config.ts). */
const E2E_ORIGIN = `http://localhost:${process.env.E2E_PORT || 4280}`;

/**
 * Dev-only fallback secret — matches apps/cli/src/commands/generateJwt.ts.
 * In CI, JWT_SECRET should be set as an env var.
 */
const DEV_JWT_SECRET = 'dev-jwt-secret-key-not-for-production-use-only';

function signTestJwt(overrides: Record<string, unknown> = {}): string {
  const secret = process.env.JWT_SECRET || DEV_JWT_SECRET;
  return sign(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      iat: Math.floor(Date.now() / 1000),
      ...overrides,
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// API isolation — intercept ALL requests that leave the static file server.
//
// The production build bakes in service URLs (GraphQL on :5000, OAuth proxy
// on :5001, WebSocket, Google Identity Services, AWS endpoints).  Without
// isolation tests would hit live (or nonexistent) services — flaky, slow,
// and dependent on network / AWS state.
//
// Strategy: only requests to our E2E static-file-server port pass through.
// Everything else — including other localhost ports — is intercepted.
//
// Layer 1 (this fixture): shared baseline mocks + unmocked-request detection.
// Layer 2 (auth.ts):      authenticated-user overrides (OAuth login, user leagues).
// Layer 3 (test code):    scenario-specific overrides via page.route() + fallback().
//
// Playwright routes match in LIFO order, so layer 3 runs first, falls back
// to layer 2, which falls back to layer 1.  If a GraphQL operation reaches
// layer 1 and isn't in the baseline map, it's recorded and reported as a
// test error after the test body completes.
// ---------------------------------------------------------------------------

/** The port our static file server listens on — the ONLY port we allow through. */
const E2E_PORT_STR = String(process.env.E2E_PORT || 4280);

/** Returns true when a URL targets our static file server (should NOT be intercepted). */
function isStaticServerRequest(url: URL): boolean {
  const host = url.hostname;
  const isLocalhost =
    host === 'localhost' || host === '127.0.0.1' || host === '::1';
  return isLocalhost && url.port === E2E_PORT_STR;
}

/**
 * Minimal mock of the Google Identity Services (GSI) library.
 * The real script is loaded from accounts.google.com/gsi/client, which our
 * API isolation blocks. This mock provides the `google.accounts.id` and
 * `google.accounts.oauth2` stubs the app needs to render without errors.
 */
const GSI_MOCK_SCRIPT = [
  'window.google = { accounts: {',
  '  id: {',
  '    initialize: function() {},',
  '    renderButton: function() {},',
  '    prompt: function() {},',
  '    cancel: function() {},',
  '  },',
  '  oauth2: {',
  '    initCodeClient: function() { return { requestCode: function() {} }; },',
  '  },',
  '}};',
].join('\n');

const isolated = base.extend<{ _apiIsolation: void }>({
  _apiIsolation: [
    async (
      { page }: { page: Page },
      use: () => Promise<void>,
      testInfo: TestInfo,
    ) => {
      const unmockedOps: string[] = [];

      // Intercept every request that is NOT fetching a static asset from our
      // E2E server (port 4280).  This catches localhost:5000 (GraphQL),
      // localhost:5001 (OAuth proxy), external CDNs, AWS endpoints, etc.
      await page.route(
        (url) => !isStaticServerRequest(url),
        async (route) => {
          const reqUrl = route.request().url();

          if (reqUrl.includes('/graphql')) {
            const opName = extractOperationName(route);
            const key = opName.toLowerCase();
            const response = BASELINE_GRAPHQL_RESPONSES[key];

            if (response) {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(response),
              });
              return;
            }

            // Unknown operation — record it and return empty data so the UI
            // doesn't crash via error boundaries mid-test. The fixture
            // reports unmocked ops as a test error after the body completes.
            unmockedOps.push(opName);
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: {} }),
            });
            return;
          }

          // Google Identity Services script — return a mock that provides the
          // global stubs the app expects so PublicLandingPage can render without
          // hitting the real accounts.google.com endpoint.
          if (reqUrl.includes('accounts.google.com/gsi/client')) {
            await route.fulfill({
              status: 200,
              contentType: 'application/javascript',
              body: GSI_MOCK_SCRIPT,
            });
            return;
          }

          // Any non-GraphQL external request: reject outright.
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Blocked by E2E API isolation' }),
          });
        },
      );

      await use();

      // After the test body: fail if any request slipped through unmocked.
      if (unmockedOps.length > 0) {
        const unique = [...new Set(unmockedOps)];
        testInfo.annotations.push({
          type: 'unmocked-api',
          description: unique.join(', '),
        });
        throw new Error(
          [
            `API isolation caught ${unmockedOps.length} unmocked GraphQL request(s):`,
            ...unique.map((op) => `  • ${op}`),
            '',
            'Fix: add the operation to shared-mocks.ts (if common) or mock it in your test.',
          ].join('\n'),
        );
      }
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

    await use({
      cookies: [],
      origins: [
        {
          origin: E2E_ORIGIN,
          localStorage: [{ name: 'auth_jwt', value: jwt }],
        },
      ],
    });
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

      await use({
        cookies: [],
        origins: [
          {
            origin: E2E_ORIGIN,
            localStorage: [{ name: 'auth_jwt', value: jwt }],
          },
        ],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Unauthenticated test — explicitly clears auth state so the login page shows.
// Use this for tests that verify the login flow itself.
// ---------------------------------------------------------------------------

export const unauthTest = isolated.extend({
  storageState: async ({}, use) => {
    await use({ cookies: [], origins: [] });
  },
});

export { expect };

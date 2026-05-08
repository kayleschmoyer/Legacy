import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';

import {
  BASELINE_GRAPHQL_RESPONSES,
  extractOperationName,
} from './shared-mocks';
import { E2E_SIGNING_SECRET, E2EJwtUtil, signE2EJwt } from '../utils/jwt';

/** Read the base URL that Playwright is actually using (set in playwright.config.ts). */
const E2E_ORIGIN = `http://localhost:${process.env.E2E_PORT || 4280}`;

/** Single source of truth for the hermetic CSRF token used across all E2E fixtures. */
const E2E_CSRF_TOKEN = 'e2e-csrf-token';

function signTestJwt(overrides: Record<string, unknown> = {}): string {
  return signE2EJwt(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      ...overrides,
    },
    E2E_SIGNING_SECRET,
    '1h',
  );
}

/**
 * Build a Playwright storageState object for cookie-based auth.
 * Sets the HttpOnly JWT cookie, the JS-readable CSRF cookie,
 * and caches the user profile + token expiry in localStorage.
 */
function buildAuthStorageState(
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

  const expiry = payload.exp ?? Math.floor(Date.now() / 1000) + 3600;

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

      // WebKit (Safari) does not reliably apply the `storageState` localStorage
      // entries defined in playwright.config.ts before the app's auth check runs.
      // Playwright's storageState applies cookies correctly but localStorage
      // can arrive "late" in WebKit's context initialisation, causing the
      // EnhancedAuthGuard to see an empty profile and redirect to the login page.
      //
      // Fix: inject an initScript that seeds the hermetic auth state into
      // localStorage *before* any page scripts run.  The script is idempotent —
      // it only writes when the key is absent so it is a no-op when the
      // storageState was applied correctly (Chromium/Firefox).
      //
      // Values match the global-setup.ts CI-mode hermetic JWT (id=1, admin).
      await page.addInitScript(() => {
        if (!window.localStorage.getItem('ls_user_profile')) {
          const expiry = Math.floor(Date.now() / 1000) + 3600;
          window.localStorage.setItem(
            'ls_user_profile',
            JSON.stringify({
              id: 1,
              email: 'e2e-test@legacysports.dev',
              username: 'testuser',
              accessLevel: 'admin',
            }),
          );
          window.localStorage.setItem('ls_token_expiry', String(expiry));
          window.localStorage.setItem('ls_csrf_token', 'e2e-csrf-token');
        }
      });

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

          // Giphy API — tests mock this via page.route() in beforeEach.
          // Return safe empty data so unmocked Giphy calls don't crash the UI.
          const isGiphyRequest = (() => {
            try {
              return new URL(reqUrl).hostname === 'api.giphy.com';
            } catch {
              return false;
            }
          })();
          if (isGiphyRequest) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ data: [], meta: { status: 200 } }),
            });
            return;
          }

          // OAuth JWT refresh — only return a fresh hermetic JWT when the
          // request looks authenticated and the token is not yet expired.
          // This mirrors oauth-proxy behavior closely enough for E2E flows:
          //   • No token → fall through to the 401 catch-all below.
          //   • Expired token → 401 (session-expiry tests expect this).
          //   • Valid cookie token, wrong CSRF → 403.
          //   • Valid cookie token + correct CSRF → fresh JWT (same identity).
          //   • Bearer token (no CSRF needed) → fresh JWT.
          const isRefreshJwtRequest = (() => {
            if (route.request().method() !== 'POST') {
              return false;
            }
            try {
              // The app uses oauthProxyUrl = 'http://localhost:5001' (no /oauth prefix),
              // so the actual path is /refresh-jwt. Accept both to be future-proof.
              // Also match paths with a stage prefix (e.g. /dev/refresh-jwt,
              // /dev/oauth/refresh-jwt) for local production builds that bake in
              // the full AWS API Gateway URL.
              const pathname = new URL(reqUrl).pathname;
              return pathname.endsWith('/refresh-jwt');
            } catch {
              return false;
            }
          })();
          if (isRefreshJwtRequest) {
            // Use allHeaders() instead of headers() — Playwright excludes security-related
            // headers (including Cookie) from the synchronous headers() result. allHeaders()
            // returns the full set, which is required to read the ls_jwt cookie.
            const headers = await route.request().allHeaders();
            const cookieHeader = headers['cookie'] ?? '';
            const authHeader = headers['authorization'] ?? '';
            const csrfHeader =
              headers['x-csrf-token'] ?? headers['x-xsrf-token'] ?? '';

            // Extract ls_jwt cookie value (if present).
            const lsJwtPart = cookieHeader
              .split(';')
              .map((p) => p.trim())
              .find((p) => p.startsWith('ls_jwt='));
            const cookieToken = lsJwtPart
              ? lsJwtPart.slice('ls_jwt='.length)
              : '';

            // Decode the JWT payload: check expiry and extract claims.
            // Expired tokens must 401 so session-expiry tests pass.
            // Non-expired tokens are re-signed with the same claims to
            // preserve adminTest/createCustomAuthTest session identities.
            let cookieTokenValid = false;
            let cookieClaims: Record<string, unknown> = {};
            if (cookieToken) {
              try {
                const payload = E2EJwtUtil.decodeJwtPayload(cookieToken);
                const exp = typeof payload.exp === 'number' ? payload.exp : 0;
                cookieTokenValid = exp > Math.floor(Date.now() / 1000);
                if (cookieTokenValid) {
                  const {
                    iat: _iat,
                    exp: _exp,
                    nbf: _nbf,
                    ...claims
                  } = payload;
                  cookieClaims = claims;
                }
              } catch {
                cookieTokenValid = false;
              }
            }

            const hasBearerToken = /^Bearer\s+\S+$/i.test(authHeader);

            // Bearer auth bypasses CSRF (mirrors real oauth-proxy behaviour).
            // Only enforce CSRF for cookie-only authenticated requests.
            if (
              cookieTokenValid &&
              !hasBearerToken &&
              csrfHeader !== E2E_CSRF_TOKEN
            ) {
              await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'CSRF validation failed' }),
              });
              return;
            }

            if (cookieTokenValid || hasBearerToken) {
              const freshJwt = cookieTokenValid
                ? signE2EJwt(cookieClaims, E2E_SIGNING_SECRET, '1h')
                : signTestJwt();
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jwt: freshJwt,
                  csrfToken: E2E_CSRF_TOKEN,
                }),
              });
              return;
            }

            // No valid cookie token and no bearer token.  Return 503 (not
            // 401) so AuthService treats this as a transient network error
            // rather than an AuthSessionExpiredError, which would log the
            // user out and break tests that rely on the cached localStorage
            // profile for authentication (e.g. WebKit, where storageState
            // ls_jwt cookie is not reliably sent with intercepted requests).
            await route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'Token refresh unavailable in E2E isolation mode',
              }),
            });
            return;
          }

          // Any other non-GraphQL external request: reject outright.
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

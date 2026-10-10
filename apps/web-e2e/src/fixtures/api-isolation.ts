import { type Page, type Route, type TestInfo } from '@playwright/test';

import {
  extractOperationName,
  extractOperationVariables,
  resolveBaselineResponse,
} from './shared-mocks';
import { E2E_SIGNING_SECRET, E2EJwtUtil, signE2EJwt } from '../utils/jwt';
import { apiIsolationMatcher } from '../utils/route-matchers';

/**
 * API isolation — intercept ALL requests that leave the static file server.
 *
 * Extracted verbatim from `auth-enhanced.ts` (LS-8290) so the hermetic
 * isolation layer is a reusable seam: `auth-enhanced.ts` applies it
 * unconditionally, while the dual-mode fixtures (`dual.ts`) apply it only when
 * the `backend` option resolves to `'mock'` (ADR-0016 §backend seam).
 *
 * The production build bakes in service URLs (GraphQL on :5000, OAuth proxy
 * on :5001, WebSocket, Google Identity Services, AWS endpoints).  Without
 * isolation tests would hit live (or nonexistent) services — flaky, slow,
 * and dependent on network / AWS state.
 *
 * Strategy: only requests to our E2E static-file-server port pass through.
 * Everything else — including other localhost ports — is intercepted.
 *
 * Layer 1 (this module):  shared baseline mocks + unmocked-request detection.
 * Layer 2 (auth.ts):      authenticated-user overrides (OAuth login, user leagues).
 * Layer 3 (test code):    scenario-specific overrides via page.route() + fallback().
 *
 * Playwright routes match in LIFO order, so layer 3 runs first, falls back
 * to layer 2, which falls back to layer 1.  If a GraphQL operation reaches
 * layer 1 and isn't in the baseline map, it's recorded and reported as a
 * test error after the test body completes.
 */

/** Single source of truth for the hermetic CSRF token used across all E2E fixtures. */
export const E2E_CSRF_TOKEN = 'e2e-csrf-token';

/** Sign a hermetic JWT for the default (or an overridden) test identity. */
export function signTestJwt(overrides: Record<string, unknown> = {}): string {
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

/** The port our static file server listens on — the ONLY port we allow through. */
const E2E_PORT_STR = String(process.env.E2E_PORT || 4280);

/**
 * Matches every URL that does NOT target our static file server. A RegExp
 * (not a function) so Playwright can match it browser-side and static assets
 * skip interception entirely (LS-11043).
 */
const NON_STATIC_SERVER_REQUEST = apiIsolationMatcher(E2E_PORT_STR);

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

/**
 * Install hermetic API isolation on `page`, run the test body (`use`), then
 * fail the test if any GraphQL operation slipped through unmocked.
 *
 * This is the exact behavior of the former `_apiIsolation` auto-fixture in
 * `auth-enhanced.ts` — fixtures call it with their own `use` callback.
 */
export async function withApiIsolation(
  page: Page,
  testInfo: TestInfo,
  use: () => Promise<void>,
): Promise<void> {
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
    // Restore a deterministic OAuth proxy URL for the hermetic build. The
    // production build no longer falls back to http://localhost:5001 when
    // VITE_OAUTH_PROXY_URL is unset (LS-4964), so the E2E build's
    // oauthProxyUrl is '' — which breaks the Google sign-in exchange and
    // hides the OAuth-gated "Forgot password?" link. environment.ts reads
    // this global (gated on navigator.webdriver) before any app code runs.
    // The value has NO /oauth suffix on purpose: tests mock
    // http://localhost:5001/google directly (LS-8011).
    window.__e2eOauthProxyUrl = 'http://localhost:5001';

    if (!window.localStorage.getItem('ls_user_profile')) {
      // Fixed far-future expiry (2100-01-01) — deterministic and never
      // expires mid-suite. Mirrors global-setup.ts / writeStorageState.
      const expiry = 4_102_444_800;
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
  await page.route(NON_STATIC_SERVER_REQUEST, async (route) => {
    try {
      await routeRequest(route, page, unmockedOps);
    } catch (error) {
      // A handler invocation (most likely the refresh-jwt branch's
      // `await page.context().cookies()`) can still be mid-flight when the
      // test ends and the browser context tears down. The `unrouteAll()`
      // call in the teardown below only stops NEW dispatches — it cannot
      // cancel one already in progress — so a request that slips in during
      // the gap between test-end and unrouteAll still throws here. That
      // failure isn't attributable to any specific test, so Playwright's
      // `--retries` doesn't retry it and the whole job fails outright
      // (LS-10019, same bug class as LS-9742). There is no test left to
      // observe the response either way, so swallow only the teardown-race
      // error and let anything else propagate as a real bug.
      const message = error instanceof Error ? error.message : String(error);
      if (!/test ended/i.test(message)) {
        throw error;
      }
    }
  });

  await use();

  // Unregister route handlers before the page/test context is torn down.
  // The refresh-jwt handler above awaits `page.context().cookies()`; if the
  // app's background JWT-refresh timer fires in the gap between the test
  // ending and fixture teardown, that await can throw "Test ended." against
  // a route call that Playwright can no longer attribute to any test,
  // failing the whole run instead of the test itself (LS-9742). Unrouting
  // first ensures any in-flight handler invocation is cleanly discarded.
  //
  // On pages that keep generating a high volume of intercepted requests
  // after the test body finishes (e.g. an unauthenticated landing page's
  // background polling), `unrouteAll` itself can be slow enough to blow the
  // whole test timeout — which surfaces as this same teardown throwing
  // "Test ended.", just one line lower. Race it against a short timeout so
  // teardown can never exceed the test timeout on its own; on timeout the
  // routes are simply left registered for the page to tear down normally.
  await Promise.race([
    page.unrouteAll({ behavior: 'ignoreErrors' }),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]).catch(() => {
    // Best-effort cleanup — a rejection here must never fail the test.
  });

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
}

/** The actual per-request routing logic, extracted so it can be wrapped in a
 * try/catch that tolerates the test-end teardown race (see the call site in
 * `withApiIsolation` above). */
async function routeRequest(
  route: Route,
  page: Page,
  unmockedOps: string[],
): Promise<void> {
  const reqUrl = route.request().url();

  if (reqUrl.includes('/graphql')) {
    const opName = extractOperationName(route);
    const key = opName.toLowerCase();
    const response = resolveBaselineResponse(
      key,
      extractOperationVariables(route),
    );

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
    const headers = await route.request().allHeaders();
    const authHeader = headers['authorization'] ?? '';
    const csrfHeader = headers['x-csrf-token'] ?? headers['x-xsrf-token'] ?? '';

    // Read the ls_jwt cookie from Playwright's cookie jar rather than the
    // intercepted request's Cookie header. WebKit does not reliably
    // forward HttpOnly cookies set via storageState on page.route()
    // intercepted requests — the Cookie header seen here is empty even
    // though the cookie jar has it, which permanently 503s the refresh
    // and leaves useWebSocket's `!token` guard deferring client creation
    // forever (LS-9328). context().cookies() reads the jar directly, so
    // it is accurate on every engine.
    const contextCookies = await page.context().cookies();
    const cookieToken =
      contextCookies.find((c) => c.name === 'ls_jwt')?.value ?? '';

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
          const { iat: _iat, exp: _exp, nbf: _nbf, ...claims } = payload;
          cookieClaims = claims;
        }
      } catch {
        cookieTokenValid = false;
      }
    }

    const hasBearerToken = /^Bearer\s+\S+$/i.test(authHeader);

    // Bearer auth bypasses CSRF (mirrors real oauth-proxy behaviour).
    // Only enforce CSRF for cookie-only authenticated requests.
    if (cookieTokenValid && !hasBearerToken && csrfHeader !== E2E_CSRF_TOKEN) {
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
}

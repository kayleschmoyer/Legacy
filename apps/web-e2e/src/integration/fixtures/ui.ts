import {
  type APIRequestContext,
  test as base,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertJwtNotExpired, JwtExpiredError } from '../../utils/jwt';
import {
  getSpecUserJwt,
  specSlugFromTestInfo,
} from '../../utils/test-user-auth';

/**
 * Fixtures for live-backend UI E2E tests.
 *
 * Authentication:
 *   The commissioner JWT is sourced from (in order):
 *     1. `INTEGRATION_JWT` env var — escape hatch for passing a pre-issued
 *        JWT directly (not used by the standard nightly CI workflow; handy
 *        for local debugging or ad-hoc runs against a specific user)
 *     2. The CLI token store at `~/.legacy-sports/auth.json` (local dev — run
 *        `./ls-cli.ps1 auth login` before running these tests)
 *     3. `getSpecUserJwt('COMMISSIONER', <specSlug>)` — registers/logs in a
 *        **per-spec unique** commissioner derived from the test file name
 *        (e.g. `commissioner-league-activity-feed-ui@test.legacysports.dev`),
 *        using `E2E_COMMISSIONER_PASSWORD` as the shared password. This is
 *        the path used by the nightly CI workflow and avoids the Cognito 429
 *        collision that surfaced when every spec re-used the same email
 *        (LS-4940).
 *
 *   Manager JWTs are obtained the same way — `getSpecUserJwt('MANAGER_N',
 *   <specSlug>)` — so each spec gets its own manager identities. No admin
 *   impersonation is used. The persona passwords still come from the
 *   `E2E_COMMISSIONER_PASSWORD` / `E2E_MANAGER_*_PASSWORD` env vars; only the
 *   email is derived from the spec file.
 *
 *   Tests can swap tokens in cookies/localStorage via `switchUser()` to act
 *   as different users within one browser context.
 *
 * Provides:
 * - `commissionerPage` — browser context authenticated as the commissioner
 * - `commissionerJwt`  — raw JWT for the commissioner
 * - `managerJwt1/2/3`  — raw JWTs for managers 1-3 (direct login, not impersonation)
 */

export interface UIIntegrationFixtures {
  /** Browser page authenticated as the commissioner. */
  commissionerPage: Page;
  /** Raw JWT for the commissioner. */
  commissionerJwt: string;
  /** Raw JWT for Manager 1 (obtained via direct login). */
  managerJwt1: string;
  /** Raw JWT for Manager 2 (obtained via direct login). */
  managerJwt2: string;
  /** Raw JWT for Manager 3 (obtained via direct login). */
  managerJwt3: string;
  /** Separate browser context page authenticated as Manager 1. */
  managerPage1: Page;
  /** Separate browser context page authenticated as Manager 2. */
  managerPage2: Page;
  /** Separate browser context page authenticated as Manager 3. */
  managerPage3: Page;
  /**
   * GraphQL API request context authenticated as the commissioner.
   * Use for backend polling of server-side state from UI specs (e.g. waiting
   * on draft completion via `league.draftStatus` instead of UI rendering).
   */
  apiCommissioner: APIRequestContext;
}

const WEB_BASE =
  process.env.INTEGRATION_WEB_URL ?? 'https://legacy-fantasy.com';
const GQL_BASE = (
  process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
).replace(/\/?$/, '/');
/**
 * Build a Playwright storageState for cookie-based auth (integration tests).
 * Sets ls_jwt cookie, ls_csrf cookie, and caches user profile in localStorage.
 */
function buildIntegrationStorageState(jwt: string) {
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
  };

  const expiry = payload.exp ?? Math.floor(Date.now() / 1000) + 3600;
  const url = new URL(WEB_BASE);

  // Use the parent domain (with leading dot) so the cookies are sent to
  // both the web app (legacy-fantasy.com) and the API subdomain
  // (api.legacy-fantasy.com), matching how the OAuth proxy sets them in
  // production with Domain=.legacy-fantasy.com.
  // For localhost, other non-FQDN hosts, or IP addresses, use the hostname
  // directly because `.localhost` and `.127.0.0.1` are not valid cookie
  // domains in most browsers.
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname);
  const isHostOnly =
    url.hostname === 'localhost' || !url.hostname.includes('.') || isIpAddress;
  const cookieDomain = isHostOnly ? url.hostname : `.${url.hostname}`;

  // SameSite=None requires Secure=true. For HTTP origins (localhost/dev
  // servers) the cookie must be Lax so Chrome does not silently drop it.
  const sameSite =
    url.protocol === 'https:' ? ('None' as const) : ('Lax' as const);
  const secure = url.protocol === 'https:';

  return {
    cookies: [
      {
        name: 'ls_jwt',
        value: jwt,
        domain: cookieDomain,
        path: '/',
        httpOnly: true,
        secure,
        sameSite,
        expires: expiry,
      },
      {
        name: 'ls_csrf',
        value: 'integration-csrf-token',
        domain: cookieDomain,
        path: '/',
        httpOnly: false,
        secure,
        sameSite,
        expires: expiry,
      },
    ],
    origins: [
      {
        origin: WEB_BASE,
        localStorage: [
          { name: 'ls_user_profile', value: JSON.stringify(userProfile) },
          { name: 'ls_token_expiry', value: String(expiry) },
          { name: 'ls_csrf_token', value: 'integration-csrf-token' },
        ],
      },
    ],
  };
}

interface CliAuthData {
  tokens: Record<string, { jwt: string; expiresAt: number; email: string }>;
  defaultUser: string;
}

/**
 * Read the admin JWT from the CLI auth store (~/.legacy-sports/auth.json).
 * Falls back to INTEGRATION_JWT env var for CI, or registers a per-spec
 * unique test commissioner (LS-4940).
 */
async function getAuthJwt(testInfo: TestInfo): Promise<string> {
  if (process.env.INTEGRATION_JWT) {
    const jwt = process.env.INTEGRATION_JWT;
    assertJwtNotExpired(jwt, 'INTEGRATION_JWT env var');
    return jwt;
  }

  const authPath = path.join(os.homedir(), '.legacy-sports', 'auth.json');

  if (fs.existsSync(authPath)) {
    try {
      const data = JSON.parse(
        fs.readFileSync(authPath, 'utf-8'),
      ) as CliAuthData;

      const user = data.defaultUser;
      const entry = user ? data.tokens[user] : undefined;

      if (entry?.jwt && (!entry.expiresAt || entry.expiresAt >= Date.now())) {
        assertJwtNotExpired(entry.jwt, '~/.legacy-sports/auth.json');
        return entry.jwt;
      }
    } catch (err) {
      if (err instanceof JwtExpiredError) throw err;
      // Fall through to per-spec register
    }
  }

  // No CLI auth or env var — register/login a per-spec unique commissioner.
  return getSpecUserJwt('COMMISSIONER', specSlugFromTestInfo(testInfo));
}

/**
 * Creates a browser context and page, starting a Playwright trace on retries
 * so that failures are captured in the uploaded report.
 *
 * The built-in `context` fixture handles this automatically for tests that use
 * the standard `page` fixture, but integration tests create their own contexts
 * via `browser.newContext()` which bypasses the built-in trace lifecycle.
 * This helper replicates that lifecycle: start on first retry (matching the
 * `trace: 'on-first-retry'` config), stop and attach when teardown runs.
 */
async function withTracedContext(
  browser: Browser,
  options: BrowserContextOptions,
  traceName: string,
  testInfo: TestInfo,
  use: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext(options);
  const shouldTrace = testInfo.retry >= 1;

  try {
    if (shouldTrace) {
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
    }

    const page = await context.newPage();
    try {
      await use(page);
    } finally {
      // Only save the trace when the test actually failed — matches the
      // intent of `on-first-retry` and keeps passing-retry reports clean.
      if (shouldTrace && testInfo.status !== testInfo.expectedStatus) {
        const tracePath = testInfo.outputPath(`${traceName}-trace.zip`);
        try {
          await context.tracing.stop({ path: tracePath });
          await testInfo.attach('trace', {
            path: tracePath,
            contentType: 'application/zip',
          });
        } catch {
          // Ignore tracing errors — context.close() in the outer finally
          // always runs regardless.
        }
      }
    }
  } finally {
    await context.close();
  }
}

export const test = base.extend<UIIntegrationFixtures>({
  commissionerPage: async ({ browser }, use, testInfo) => {
    const jwt = await getAuthJwt(testInfo);
    await withTracedContext(
      browser,
      { baseURL: WEB_BASE, storageState: buildIntegrationStorageState(jwt) },
      'commissioner',
      testInfo,
      use,
    );
  },

  commissionerJwt: async ({}, use, testInfo) => {
    await use(await getAuthJwt(testInfo));
  },

  managerJwt1: async ({}, use, testInfo) => {
    // Per-spec unique manager identity (LS-4940).
    await use(
      await getSpecUserJwt('MANAGER_1', specSlugFromTestInfo(testInfo)),
    );
  },

  managerJwt2: async ({}, use, testInfo) => {
    await use(
      await getSpecUserJwt('MANAGER_2', specSlugFromTestInfo(testInfo)),
    );
  },

  managerJwt3: async ({}, use, testInfo) => {
    await use(
      await getSpecUserJwt('MANAGER_3', specSlugFromTestInfo(testInfo)),
    );
  },

  managerPage1: async ({ browser, managerJwt1 }, use, testInfo) => {
    await withTracedContext(
      browser,
      {
        baseURL: WEB_BASE,
        storageState: buildIntegrationStorageState(managerJwt1),
      },
      'manager-1',
      testInfo,
      use,
    );
  },

  managerPage2: async ({ browser, managerJwt2 }, use, testInfo) => {
    await withTracedContext(
      browser,
      {
        baseURL: WEB_BASE,
        storageState: buildIntegrationStorageState(managerJwt2),
      },
      'manager-2',
      testInfo,
      use,
    );
  },

  managerPage3: async ({ browser, managerJwt3 }, use, testInfo) => {
    await withTracedContext(
      browser,
      {
        baseURL: WEB_BASE,
        storageState: buildIntegrationStorageState(managerJwt3),
      },
      'manager-3',
      testInfo,
      use,
    );
  },

  apiCommissioner: async ({ playwright, commissionerJwt }, use) => {
    const api = await playwright.request.newContext({
      baseURL: GQL_BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${commissionerJwt}`,
        'Content-Type': 'application/json',
      },
    });
    await use(api);
    await api.dispose();
  },
});

export { expect } from '@playwright/test';

/**
 * Switch the authenticated user in an existing browser page by updating the
 * HttpOnly `ls_jwt` cookie, cached user profile, and CSRF token.
 *
 * After LS-775 moved auth from localStorage to HttpOnly cookies, the old
 * approach of setting `localStorage['auth_jwt']` no longer works — the
 * `useAuth` hook treats it as an invalid impersonation attempt and removes it.
 *
 * This helper mirrors `buildIntegrationStorageState` for an existing context:
 * it replaces the `ls_jwt` cookie, updates `ls_user_profile` and
 * `ls_token_expiry` in localStorage, and ensures no stale `auth_jwt` key
 * triggers the broken impersonation path.
 *
 * ⚠️  KNOWN RACE CONDITION (LS-3672, LS-3705): the background JWT refresh
 * triggered by the first `page.goto` can dispatch AUTH_LOGOUT and clear
 * localStorage *after* `page.evaluate()` sets the new user profile, causing
 * the subsequent `page.reload()` to start with empty localStorage and render
 * the login page instead of the intended route.
 *
 * Prefer using a dedicated fixture browser context (e.g. `managerPage1`) for
 * tests that navigate to protected routes as the swapped-in user.
 * `buildIntegrationStorageState` sets cookies *and* localStorage at context
 * creation time, so there is no window for AUTH_LOGOUT to race.
 * Use `switchUser` only when the test truly needs to reuse the same page
 * instance (e.g. switching back to the commissioner after completing a step).
 */
export async function switchUser(
  page: Page,
  jwt: string,
  url?: string,
): Promise<void> {
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
  };

  const expiry = payload.exp ?? Math.floor(Date.now() / 1000) + 3600;
  const webUrl = new URL(WEB_BASE);
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(webUrl.hostname);
  const isHostOnly =
    webUrl.hostname === 'localhost' ||
    !webUrl.hostname.includes('.') ||
    isIpAddress;
  const cookieDomain = isHostOnly ? webUrl.hostname : `.${webUrl.hostname}`;
  const sameSiteSwitch = webUrl.protocol === 'https:' ? 'None' : 'Lax';
  const secureSwitch = webUrl.protocol === 'https:';

  // Update cookies in the browser context
  await page.context().addCookies([
    {
      name: 'ls_jwt',
      value: jwt,
      domain: cookieDomain,
      path: '/',
      httpOnly: true,
      secure: secureSwitch,
      sameSite: sameSiteSwitch,
      expires: expiry,
    },
    {
      name: 'ls_csrf',
      value: 'integration-csrf-token',
      domain: cookieDomain,
      path: '/',
      httpOnly: false,
      secure: secureSwitch,
      sameSite: sameSiteSwitch,
      expires: expiry,
    },
  ]);

  // Navigate to the target URL (or WEB_BASE) to establish the correct origin
  // before accessing localStorage. On a fresh newPage() the page is
  // about:blank and any localStorage access would throw a SecurityError.
  const targetUrl = url ?? WEB_BASE;
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');

  // Update localStorage: user profile, expiry, CSRF token, and remove stale
  // auth_jwt to prevent the useAuth hook from entering the broken impersonation
  // code path.
  await page.evaluate(
    ({ profile, exp }) => {
      localStorage.setItem('ls_user_profile', JSON.stringify(profile));
      localStorage.setItem('ls_token_expiry', String(exp));
      localStorage.setItem('ls_csrf_token', 'integration-csrf-token');
      localStorage.removeItem('auth_jwt');
      localStorage.removeItem('ls_admin_profile');
    },
    { profile: userProfile, exp: expiry },
  );

  // Reload so the app re-initializes with the new auth state.
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}

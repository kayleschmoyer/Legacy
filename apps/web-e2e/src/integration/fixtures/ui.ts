import {
  type APIRequestContext,
  test as base,
  type Page,
} from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertJwtNotExpired, JwtExpiredError } from '../../utils/jwt';
import { getTestUserJwt, TEST_USERS } from '../../utils/test-user-auth';

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
 *     3. `getTestUserJwt(TEST_USERS.COMMISSIONER)` — logs in (or registers)
 *        the E2E commissioner user via the OAuth proxy using
 *        `E2E_COMMISSIONER_EMAIL` / `E2E_COMMISSIONER_PASSWORD`. This is the
 *        path used by the nightly CI workflow.
 *
 *   Manager JWTs are obtained by logging in each `TEST_USERS.MANAGER_*`
 *   user directly via `getTestUserJwt`. No admin impersonation is used —
 *   each manager has its own credentials provisioned via `E2E_MANAGER_*_EMAIL`
 *   and `E2E_MANAGER_*_PASSWORD` env vars (see `utils/test-user-auth.ts`).
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
 * Falls back to INTEGRATION_JWT env var for CI, or registers a local test user.
 */
async function getAuthJwt(): Promise<string> {
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
      // Fall through to local register
    }
  }

  // No CLI auth or env var — register/login a test commissioner via local auth
  return getTestUserJwt(TEST_USERS.COMMISSIONER);
}

export const test = base.extend<UIIntegrationFixtures>({
  commissionerPage: async ({ browser }, use) => {
    const jwt = await getAuthJwt();

    const context = await browser.newContext({
      baseURL: WEB_BASE,
      storageState: buildIntegrationStorageState(jwt),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  commissionerJwt: async ({}, use) => {
    await use(await getAuthJwt());
  },

  managerJwt1: async ({}, use) => {
    // Register/login manager directly — no admin impersonation needed
    await use(await getTestUserJwt(TEST_USERS.MANAGER_1));
  },

  managerJwt2: async ({}, use) => {
    await use(await getTestUserJwt(TEST_USERS.MANAGER_2));
  },

  managerJwt3: async ({}, use) => {
    await use(await getTestUserJwt(TEST_USERS.MANAGER_3));
  },

  managerPage1: async ({ browser, managerJwt1 }, use) => {
    const context = await browser.newContext({
      baseURL: WEB_BASE,
      storageState: buildIntegrationStorageState(managerJwt1),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  managerPage2: async ({ browser, managerJwt2 }, use) => {
    const context = await browser.newContext({
      baseURL: WEB_BASE,
      storageState: buildIntegrationStorageState(managerJwt2),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  managerPage3: async ({ browser, managerJwt3 }, use) => {
    const context = await browser.newContext({
      baseURL: WEB_BASE,
      storageState: buildIntegrationStorageState(managerJwt3),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
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

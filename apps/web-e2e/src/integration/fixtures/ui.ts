import { test as base, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getTestUserJwt, TEST_USERS } from '../../utils/test-user-auth';

/**
 * Fixtures for live-backend UI E2E tests.
 *
 * Authentication:
 *   Reads the admin JWT from the CLI token store (`~/.legacy-sports/auth.json`).
 *   Run `./ls-cli.ps1 auth login` before running these tests.
 *
 *   The admin token is used directly for `commissionerPage` and `commissionerJwt`.
 *   Manager JWTs are obtained by impersonating non-admin users. Tests swap
 *   tokens in localStorage to act as different users within one browser.
 *
 * Provides:
 * - `commissionerPage` — browser context authenticated as the admin (commissioner)
 * - `commissionerJwt`  — raw JWT for the commissioner
 * - `managerJwt1/2/3`  — raw JWTs for impersonated managers 1-3
 */

export interface UIIntegrationFixtures {
  /** Browser page authenticated as the admin (commissioner). */
  commissionerPage: Page;
  /** Raw JWT for the commissioner (admin). */
  commissionerJwt: string;
  /** Raw JWT for impersonated Manager 1. */
  managerJwt1: string;
  /** Raw JWT for impersonated Manager 2. */
  managerJwt2: string;
  /** Raw JWT for impersonated Manager 3. */
  managerJwt3: string;
  /** Separate browser context page authenticated as Manager 1. */
  managerPage1: Page;
  /** Separate browser context page authenticated as Manager 2. */
  managerPage2: Page;
  /** Separate browser context page authenticated as Manager 3. */
  managerPage3: Page;
}

const WEB_BASE =
  process.env.INTEGRATION_WEB_URL ?? 'https://legacy-fantasy.com';
const GQL_BASE =
  process.env.INTEGRATION_BASE_URL ??
  'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/';

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

  return {
    cookies: [
      {
        name: 'ls_jwt',
        value: jwt,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'None' as const,
        expires: expiry,
      },
      {
        name: 'ls_csrf',
        value: 'integration-csrf-token',
        domain: url.hostname,
        path: '/',
        httpOnly: false,
        secure: url.protocol === 'https:',
        sameSite: 'None' as const,
        expires: expiry,
      },
    ],
    origins: [
      {
        origin: WEB_BASE,
        localStorage: [
          { name: 'ls_user_profile', value: JSON.stringify(userProfile) },
          { name: 'ls_token_expiry', value: String(expiry) },
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
    return process.env.INTEGRATION_JWT;
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
        return entry.jwt;
      }
    } catch {
      // Fall through to local register
    }
  }

  // No CLI auth or env var — register/login a test commissioner via local auth
  return getTestUserJwt(TEST_USERS.COMMISSIONER);
}

// ---------------------------------------------------------------------------
// Impersonation helpers
// ---------------------------------------------------------------------------

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** Raw fetch against the GQL endpoint with retry on network failures. */
async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(GQL_BASE + 'graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
      const json = (await res.json()) as GqlResponse<T>;
      if (json.errors?.length) {
        throw new Error(`GraphQL error: ${json.errors[0].message}`);
      }
      if (!json.data) {
        throw new Error('GraphQL response contained no data');
      }
      return json.data;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 1_000 * attempt));
    }
  }

  throw new Error('gqlFetch failed after retries');
}

/** Cached impersonation tokens so we only call the mutation once per user. */
const impersonationCache = new Map<number, string>();

/**
 * Use the admin JWT to impersonate another user by ID.
 * Returns a fresh JWT for the impersonated user.
 */
async function impersonate(adminJwt: string, userId: number): Promise<string> {
  const cached = impersonationCache.get(userId);
  if (cached) return cached;

  const data = await gqlFetch<{ impersonateUser: { token: string } }>(
    adminJwt,
    `mutation ImpersonateUser($userId: Int!) {
       impersonateUser(userId: $userId) { token }
     }`,
    { userId },
  );

  const token = data.impersonateUser.token;
  impersonationCache.set(userId, token);
  return token;
}

/**
 * Query the users list and return three non-admin user IDs to impersonate.
 * Caches the result so repeated calls don't hit the API.
 */
let managerIds: [number, number, number] | undefined;

async function getManagerUserIds(
  adminJwt: string,
): Promise<[number, number, number]> {
  if (managerIds) return managerIds;

  const data = await gqlFetch<{
    users: Array<{ id: number; accessLevel: string | null }>;
  }>(adminJwt, `query { users(limit: 20) { id accessLevel } }`);

  const candidates = data.users.filter((u) => u.accessLevel !== 'admin');

  if (candidates.length < 3) {
    throw new Error(
      `Need at least 3 non-admin users to impersonate, found ${candidates.length}. ` +
        'Create test users in the database first.',
    );
  }

  managerIds = [candidates[0].id, candidates[1].id, candidates[2].id];
  return managerIds;
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
    const adminJwt = await getAuthJwt();
    const [mgr1Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr1Id);
    await use(jwt);
  },

  managerJwt2: async ({}, use) => {
    const adminJwt = await getAuthJwt();
    const [, mgr2Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr2Id);
    await use(jwt);
  },

  managerJwt3: async ({}, use) => {
    const adminJwt = await getAuthJwt();
    const [, , mgr3Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr3Id);
    await use(jwt);
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
});

export { expect } from '@playwright/test';

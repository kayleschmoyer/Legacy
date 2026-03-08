import { test as base, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
}

const WEB_BASE =
  process.env.INTEGRATION_WEB_URL ?? 'https://legacy-fantasy.com';
const GQL_BASE =
  process.env.INTEGRATION_BASE_URL ??
  'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/';

interface CliAuthData {
  tokens: Record<string, { jwt: string; expiresAt: number; email: string }>;
  defaultUser: string;
}

/**
 * Read the admin JWT from the CLI auth store (~/.legacy-sports/auth.json).
 * Falls back to INTEGRATION_JWT env var for CI.
 */
function getAuthJwt(): string {
  if (process.env.INTEGRATION_JWT) {
    return process.env.INTEGRATION_JWT;
  }

  const authPath = path.join(os.homedir(), '.legacy-sports', 'auth.json');

  if (!fs.existsSync(authPath)) {
    throw new Error(
      'No CLI auth token found. Run `./ls-cli.ps1 auth login` first.',
    );
  }

  const data = JSON.parse(fs.readFileSync(authPath, 'utf-8')) as CliAuthData;

  const user = data.defaultUser;
  const entry = user ? data.tokens[user] : undefined;

  if (!entry?.jwt) {
    throw new Error(
      'No valid token in ~/.legacy-sports/auth.json. Run `./ls-cli.ps1 auth login`.',
    );
  }

  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    throw new Error(
      'CLI auth token expired. Run `./ls-cli.ps1 auth login` to refresh.',
    );
  }

  return entry.jwt;
}

// ---------------------------------------------------------------------------
// Impersonation helpers
// ---------------------------------------------------------------------------

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** Raw fetch against the GQL endpoint (no Playwright context needed). */
async function gqlFetch<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
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
    const jwt = getAuthJwt();

    const context = await browser.newContext({
      baseURL: WEB_BASE,
      storageState: {
        cookies: [],
        origins: [
          {
            origin: WEB_BASE,
            localStorage: [{ name: 'auth_jwt', value: jwt }],
          },
        ],
      },
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  commissionerJwt: async ({}, use) => {
    await use(getAuthJwt());
  },

  managerJwt1: async ({}, use) => {
    const adminJwt = getAuthJwt();
    const [mgr1Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr1Id);
    await use(jwt);
  },

  managerJwt2: async ({}, use) => {
    const adminJwt = getAuthJwt();
    const [, mgr2Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr2Id);
    await use(jwt);
  },

  managerJwt3: async ({}, use) => {
    const adminJwt = getAuthJwt();
    const [, , mgr3Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr3Id);
    await use(jwt);
  },
});

export { expect } from '@playwright/test';

import { type APIRequestContext, test as base } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getTestUserJwt, TEST_USERS } from '../../utils/test-user-auth';

export interface IntegrationFixtures {
  api: APIRequestContext;
  /** A second authenticated API context representing a different user. */
  api2: APIRequestContext;
  /** A third authenticated API context (commissioner/admin). */
  apiCommissioner: APIRequestContext;
}

const GQL_BASE = (
  process.env.INTEGRATION_BASE_URL ??
  'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/'
).replace(/\/?$/, '/');

interface CliAuthData {
  tokens: Record<string, { jwt: string; expiresAt: number; email: string }>;
  defaultUser: string;
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function getAuthJwt(): Promise<string> {
  if (process.env.INTEGRATION_JWT_COMMISSIONER) {
    return process.env.INTEGRATION_JWT_COMMISSIONER;
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

  return getTestUserJwt(TEST_USERS.COMMISSIONER);
}

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

const impersonationCache = new Map<number, string>();

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

let managerIds: [number, number, number] | undefined;

async function getManagerUserIds(
  adminJwt: string,
): Promise<[number, number, number]> {
  if (managerIds) return managerIds;

  const data = await gqlFetch<{
    users: Array<{ id: number; accessLevel: string | null }>;
  }>(adminJwt, `query { users(limit: 20) { id accessLevel } }`);

  const candidates = data.users.filter((u) => u.accessLevel !== 'admin');

  if (candidates.length < 2) {
    throw new Error(
      `Need at least 2 non-admin users to impersonate, found ${candidates.length}. ` +
        'Create test users in the database first.',
    );
  }

  managerIds = [
    candidates[0].id,
    candidates[1].id,
    candidates[2]?.id ?? candidates[1].id,
  ];
  return managerIds;
}

export const test = base.extend<IntegrationFixtures>({
  api: async ({ playwright }, use) => {
    const adminJwt = await getAuthJwt();
    const [mgr1Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr1Id);

    const api = await playwright.request.newContext({
      baseURL: GQL_BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });
    await use(api);
    await api.dispose();
  },

  api2: async ({ playwright }, use) => {
    const adminJwt = await getAuthJwt();
    const [, mgr2Id] = await getManagerUserIds(adminJwt);
    const jwt = await impersonate(adminJwt, mgr2Id);

    const api2 = await playwright.request.newContext({
      baseURL: GQL_BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });
    await use(api2);
    await api2.dispose();
  },

  apiCommissioner: async ({ playwright }, use) => {
    const jwt = await getAuthJwt();

    const api = await playwright.request.newContext({
      baseURL: GQL_BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });
    await use(api);
    await api.dispose();
  },
});

export { expect } from '@playwright/test';

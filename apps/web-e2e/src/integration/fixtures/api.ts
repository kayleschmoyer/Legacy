import {
  type APIRequestContext,
  test as base,
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

export interface IntegrationFixtures {
  api: APIRequestContext;
  /** A second authenticated API context representing a different user. */
  api2: APIRequestContext;
  /** A third authenticated API context (commissioner/admin). */
  apiCommissioner: APIRequestContext;
}

const GQL_BASE = (
  process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/'
).replace(/\/?$/, '/');

interface CliAuthData {
  tokens: Record<string, { jwt: string; expiresAt: number; email: string }>;
  defaultUser: string;
}

async function getAuthJwt(testInfo: TestInfo): Promise<string> {
  if (process.env.INTEGRATION_JWT_COMMISSIONER) {
    const jwt = process.env.INTEGRATION_JWT_COMMISSIONER;
    assertJwtNotExpired(jwt, 'INTEGRATION_JWT_COMMISSIONER env var');
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

  // Per-spec unique commissioner (LS-4940 — avoids 429 collision across shards).
  return getSpecUserJwt('COMMISSIONER', specSlugFromTestInfo(testInfo));
}

export const test = base.extend<IntegrationFixtures>({
  api: async ({ playwright }, use, testInfo) => {
    // Per-spec unique manager 1 identity (LS-4940).
    const jwt = await getSpecUserJwt(
      'MANAGER_1',
      specSlugFromTestInfo(testInfo),
    );

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

  api2: async ({ playwright }, use, testInfo) => {
    const jwt = await getSpecUserJwt(
      'MANAGER_2',
      specSlugFromTestInfo(testInfo),
    );

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

  apiCommissioner: async ({ playwright }, use, testInfo) => {
    const jwt = await getAuthJwt(testInfo);

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

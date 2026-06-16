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
  loginAs,
  specSlugFromTestInfo,
} from '../../utils/test-user-auth';

export interface IntegrationFixtures {
  api: APIRequestContext;
  /** A second authenticated API context representing a different user. */
  api2: APIRequestContext;
  /** A third authenticated API context (commissioner/admin). */
  apiCommissioner: APIRequestContext;
  /**
   * Raw JWT for the commissioner persona — same identity backing
   * `apiCommissioner`. Exposed so specs can drive backend cleanup helpers that
   * take a bearer token directly (e.g. `freeCommissionerLeagueSlots`).
   */
  commissionerJwt: string;
  /**
   * Raw JWT for a premium-tier user (LS-8055, seat 1 — the MANAGER_2 identity,
   * a NON-admin user provisioned `subscription_tier = 'premium'`). NOT blocked
   * by `premium-feature-gate`. Use for specs exercising premium-gated
   * resolvers/routes. (Seat 1 is MANAGER_2, not the commissioner, because the
   * commissioner fixture user also carries `access_level = 'admin'`.)
   */
  premiumJwt: string;
  /**
   * Second distinct premium-tier user (LS-8055, seat 2). Use together with
   * `premiumJwt` for premium↔premium flows in a single league (trade, draft).
   */
  premiumJwt2: string;
  /** Raw JWT for a free-tier user (LS-8055, seat 1 — MANAGER_1). */
  freeJwt: string;
  /** Second distinct free-tier user (LS-8055, seat 2 — MANAGER_3). */
  freeJwt2: string;
  /**
   * Admin user (LS-8055, seat 1): `access_level = 'admin'` with
   * `subscription_tier = 'free'`, so it exercises the isAdmin→premium override
   * (admin treated as premium without a premium subscription).
   */
  adminJwt: string;
  /** Second admin user (LS-8055, seat 2): `access_level = 'admin'` + premium. */
  adminJwt2: string;
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

  commissionerJwt: async ({}, use, testInfo) => {
    await use(await getAuthJwt(testInfo));
  },

  // Tier-based JWTs (LS-8055). These resolve to stable, pre-provisioned
  // identities (not per-spec hashed emails) because a user's tier is a DB
  // column with no GraphQL write path — see `loginAs` in test-user-auth.ts.
  premiumJwt: async ({}, use) => {
    await use(await loginAs('premium', 1));
  },

  premiumJwt2: async ({}, use) => {
    await use(await loginAs('premium', 2));
  },

  freeJwt: async ({}, use) => {
    await use(await loginAs('free', 1));
  },

  freeJwt2: async ({}, use) => {
    await use(await loginAs('free', 2));
  },

  adminJwt: async ({}, use) => {
    await use(await loginAs('admin', 1));
  },

  adminJwt2: async ({}, use) => {
    await use(await loginAs('admin', 2));
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

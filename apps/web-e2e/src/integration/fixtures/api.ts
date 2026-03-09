import { type APIRequestContext, test as base } from '@playwright/test';
import { getTestUserJwt, TEST_USERS } from '../../utils/test-user-auth';

export interface IntegrationFixtures {
  api: APIRequestContext;
  /** A second authenticated API context representing a different user. */
  api2: APIRequestContext;
  /** A third authenticated API context (commissioner/admin). */
  apiCommissioner: APIRequestContext;
}

export const test = base.extend<IntegrationFixtures>({
  api: async ({ playwright }, use) => {
    const jwt =
      process.env.INTEGRATION_JWT ||
      (await getTestUserJwt(TEST_USERS.MANAGER_1));

    const api = await playwright.request.newContext({
      baseURL:
        process.env.INTEGRATION_BASE_URL ??
        'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/',
      extraHTTPHeaders: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });
    await use(api);
    await api.dispose();
  },

  api2: async ({ playwright }, use) => {
    const jwt =
      process.env.INTEGRATION_JWT_2 ||
      (await getTestUserJwt(TEST_USERS.MANAGER_2));

    const api2 = await playwright.request.newContext({
      baseURL:
        process.env.INTEGRATION_BASE_URL ??
        'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/',
      extraHTTPHeaders: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });
    await use(api2);
    await api2.dispose();
  },

  apiCommissioner: async ({ playwright }, use) => {
    const jwt =
      process.env.INTEGRATION_JWT_COMMISSIONER ||
      (await getTestUserJwt(TEST_USERS.COMMISSIONER));

    const api = await playwright.request.newContext({
      baseURL:
        process.env.INTEGRATION_BASE_URL ??
        'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/',
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

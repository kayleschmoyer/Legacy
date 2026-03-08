import { type APIRequestContext, test as base } from '@playwright/test';
import { E2EJwtUtil } from '../../utils/jwt';

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
      E2EJwtUtil.generateJwt({ email: 'manager1@test.com', expiration: '2h' });

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
      E2EJwtUtil.generateJwt({ email: 'manager2@test.com', expiration: '2h' });

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
      E2EJwtUtil.generateJwt({
        email: 'commissioner@test.com',
        expiration: '2h',
      });

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

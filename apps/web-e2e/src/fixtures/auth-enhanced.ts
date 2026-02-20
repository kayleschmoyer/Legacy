import { test as base, expect } from '@playwright/test';
import { sign } from 'jsonwebtoken';

/**
 * Dev-only fallback secret — matches apps/cli/src/commands/generateJwt.ts.
 * In CI, JWT_SECRET should be set as an env var.
 */
const DEV_JWT_SECRET = 'dev-jwt-secret-key-not-for-production-use-only';

function signTestJwt(overrides: Record<string, unknown> = {}): string {
  const secret = process.env.JWT_SECRET || DEV_JWT_SECRET;
  return sign(
    {
      id: 1,
      email: 'user@test.com',
      username: 'testuser',
      accessLevel: 'none',
      iat: Math.floor(Date.now() / 1000),
      ...overrides,
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Default authenticated test — uses the storageState set by global-setup.ts.
// No extra setup is needed; the JWT is already in localStorage.
// If your test requires GraphQL mocking, add page.route() calls in the test.
// ---------------------------------------------------------------------------

export const test = base;

// ---------------------------------------------------------------------------
// Admin test — overrides the storageState JWT with an admin-level token.
// ---------------------------------------------------------------------------

export const adminTest = base.extend({
  /** Override storageState so this context has an admin JWT instead. */
  storageState: async (_: unknown, use) => {
    const jwt = signTestJwt({
      email: 'admin@test.com',
      username: 'admin',
      accessLevel: 'admin',
    });

    await use({
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4200',
          localStorage: [{ name: 'auth_jwt', value: jwt }],
        },
      ],
    });
  },
});

// ---------------------------------------------------------------------------
// Custom user test factory — creates a test fixture with a specific identity.
// ---------------------------------------------------------------------------

export function createCustomAuthTest(
  email: string,
  accessLevel: 'none' | 'admin' = 'none',
) {
  return base.extend({
    storageState: async (_: unknown, use) => {
      const jwt = signTestJwt({
        email,
        username: email.split('@')[0],
        accessLevel,
      });

      await use({
        cookies: [],
        origins: [
          {
            origin: 'http://localhost:4200',
            localStorage: [{ name: 'auth_jwt', value: jwt }],
          },
        ],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Unauthenticated test — explicitly clears auth state so the login page shows.
// Use this for tests that verify the login flow itself.
// ---------------------------------------------------------------------------

export const unauthTest = base.extend({
  storageState: async (_: unknown, use) => {
    await use({ cookies: [], origins: [] });
  },
});

export { expect };

/**
 * Tests for the syncUserProfileFromJwt behavior in apollo-client.ts.
 *
 * The decodeJwtPayload and syncUserProfileFromJwt functions are exported
 * from apollo-client.ts and tested directly here.
 */

// Mock modules that apollo-client.ts imports as side effects
//
// Apollo Client's createHttpLink requires a global `fetch` at module init time.
// jest.mock is hoisted above imports by Babel, so this factory runs before
// apollo-client.ts is evaluated — providing a stub `createHttpLink` that
// doesn't require global fetch.
import { decodeJwtPayload, syncUserProfileFromJwt } from './apollo-client';

jest.mock('@apollo/client', () => {
  const actual =
    jest.requireActual<typeof import('@apollo/client')>('@apollo/client');
  return {
    ...actual,
    createHttpLink: jest.fn(() => ({
      request: jest.fn(),
    })),
  };
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('@legacy-sports/rollbar/web', () => ({
  captureError: jest.fn(),
}));
jest.mock('./csrf', () => ({
  CSRF_HEADER: 'x-csrf-token',
  getCsrfToken: jest.fn(() => null),
  storeCsrfToken: jest.fn(),
}));
jest.mock('../config/environment', () => ({
  env: {
    graphqlUrl: 'http://localhost:5000/graphql',
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test-google-client-id',
    isDev: true,
  },
  getEnvironmentConfig: () => ({
    graphqlUrl: 'http://localhost:5000/graphql',
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test-google-client-id',
    isDev: true,
  }),
}));

/** Build a minimal fake JWT with the given payload claims. */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa('fakesig');
  return `${header}.${body}.${sig}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const token = fakeJwt({
      id: 42,
      email: 'test@example.com',
      accessLevel: 'admin',
    });
    const payload = decodeJwtPayload(token);
    expect(payload).toEqual(
      expect.objectContaining({
        id: 42,
        email: 'test@example.com',
        accessLevel: 'admin',
      }),
    );
  });

  it('returns null for an invalid JWT', () => {
    expect(decodeJwtPayload('not.a.valid-jwt')).toBeNull();
    expect(decodeJwtPayload('onlyonepart')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });
});

describe('syncUserProfileFromJwt', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates localStorage with decoded user profile', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeJwt({
      id: 7,
      email: 'admin@test.com',
      username: 'AdminUser',
      accessLevel: 'admin',
      exp,
    });

    syncUserProfileFromJwt(token);

    const stored = JSON.parse(
      localStorage.getItem('ls_user_profile') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['id']).toBe(7);
    expect(stored['email']).toBe('admin@test.com');
    expect(stored['username']).toBe('AdminUser');
    expect(stored['accessLevel']).toBe('admin');

    expect(localStorage.getItem('ls_token_expiry')).toBe(String(exp));
  });

  it('dispatches auth:token-refreshed window event with user and exp', () => {
    const handler = jest.fn();
    window.addEventListener('auth:token-refreshed', handler);

    const exp = Math.floor(Date.now() / 1000) + 7200;
    const token = fakeJwt({
      id: 99,
      email: 'promoted@test.com',
      username: 'PromotedUser',
      accessLevel: 'admin',
      exp,
    });

    syncUserProfileFromJwt(token);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.user).toEqual(
      expect.objectContaining({
        id: 99,
        accessLevel: 'admin',
        username: 'PromotedUser',
      }),
    );
    expect(event.detail.exp).toBe(exp);

    window.removeEventListener('auth:token-refreshed', handler);
  });

  it('defaults accessLevel to user when claim is missing', () => {
    const token = fakeJwt({ id: 1, email: 'basic@test.com' });

    syncUserProfileFromJwt(token);

    const stored = JSON.parse(
      localStorage.getItem('ls_user_profile') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['accessLevel']).toBe('user');
  });

  it('does nothing for an invalid JWT', () => {
    const handler = jest.fn();
    window.addEventListener('auth:token-refreshed', handler);

    syncUserProfileFromJwt('invalid-token');

    expect(handler).not.toHaveBeenCalled();
    expect(localStorage.getItem('ls_user_profile')).toBeNull();

    window.removeEventListener('auth:token-refreshed', handler);
  });
});

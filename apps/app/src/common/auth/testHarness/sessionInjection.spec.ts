// Coverage for the session-injection harness itself (LS-8454, AC4) — in
// particular the production guard that keeps forged-session injection out of
// shipped builds, mirroring the EXPO_PUBLIC_BYPASS_AUTH guard.

import { jwtDecode } from 'jwt-decode';

import {
  buildTestJwt,
  clearTestSession,
  injectTestSession,
} from './sessionInjection';

const mockStore: Record<string, string> = {};
jest.mock('@legacy-sports/shared-components', () => ({
  SecureStorageProvider: {
    setItem: (key: string, value: string): Promise<void> => {
      mockStore[key] = value;
      return Promise.resolve();
    },
    removeItem: (key: string): Promise<void> => {
      delete mockStore[key];
      return Promise.resolve();
    },
  },
}));
jest.mock('../AuthHooks', () => ({
  Secret: { GOOGLE_JWT: 'GOOGLE_JWT', INTERNAL_JWT: 'INTERNAL_JWT' },
}));

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('buildTestJwt', () => {
  it('builds a decodable JWT with an unexpired exp by default', () => {
    const decoded = jwtDecode<{ id: number; username: string; exp: number }>(
      buildTestJwt({ id: 7, username: 'alice' }),
    );
    expect(decoded.id).toBe(7);
    expect(decoded.username).toBe('alice');
    expect(decoded.exp * 1000).toBeGreaterThan(Date.now());
  });

  it('builds an already-expired token when expiresInMs is negative', () => {
    const decoded = jwtDecode<{ exp: number }>(
      buildTestJwt({ id: 1, username: 'x' }, { expiresInMs: -1000 }),
    );
    expect(decoded.exp * 1000).toBeLessThan(Date.now());
  });
});

describe('injectTestSession / clearTestSession', () => {
  it('persists the JWT under the internal-JWT secret', async () => {
    const jwt = buildTestJwt({ id: 1, username: 'x' });
    await injectTestSession(jwt);
    expect(mockStore['INTERNAL_JWT']).toBe(jwt);
  });

  it('clears both secrets on logout', async () => {
    mockStore['INTERNAL_JWT'] = 'a';
    mockStore['GOOGLE_JWT'] = 'b';
    await clearTestSession();
    expect(mockStore['INTERNAL_JWT']).toBeUndefined();
    expect(mockStore['GOOGLE_JWT']).toBeUndefined();
  });

  it('refuses to inject a session in a production build', async () => {
    process.env.NODE_ENV = 'production';
    await expect(injectTestSession('jwt')).rejects.toThrow(/production/);
    expect(mockStore['INTERNAL_JWT']).toBeUndefined();
  });

  it('refuses to clear a session in a production build', async () => {
    process.env.NODE_ENV = 'production';
    await expect(clearTestSession()).rejects.toThrow(/production/);
  });
});

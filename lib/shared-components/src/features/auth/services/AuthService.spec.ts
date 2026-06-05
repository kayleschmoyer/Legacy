import { LOGGER } from '@legacy-sports/logging';
import { AuthService, AuthSessionExpiredError } from './AuthService';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = LOGGER as jest.Mocked<typeof LOGGER>;

const testConfig = {
  googleClientId: 'test-client-id',
  oauthProxyUrl: 'http://localhost:5001',
};

describe('AuthService.refreshJwt', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(testConfig);
  });

  it('swallows "Failed to fetch" network errors without logging at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new TypeError('Failed to fetch'), {}));

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('swallows Firefox network errors without logging at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new TypeError('NetworkError when attempting to fetch resource.'),
      );

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('swallows React Native network errors without logging at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('logs unexpected errors at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('Unexpected JSON parse failure'));

    const result = await service.refreshJwt();

    expect(result).toBeNull();
    expect(mockLogger.error.mock.calls).toHaveLength(1);
    expect(mockLogger.error.mock.calls[0][0]).toBe(
      'AuthService: JWT refresh request failed:',
    );
    expect(mockLogger.error.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('re-throws AuthSessionExpiredError on 401 without logging', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(service.refreshJwt()).rejects.toBeInstanceOf(
      AuthSessionExpiredError,
    );
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  it('re-throws AuthSessionExpiredError on 403 without logging', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    await expect(service.refreshJwt()).rejects.toBeInstanceOf(
      AuthSessionExpiredError,
    );
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});

describe('AuthService.persistSession', () => {
  let service: AuthService;

  /** Build a (signature-less) JWT whose payload base64url-decodes to `payload`. */
  function makeJwt(payload: Record<string, unknown>): string {
    const encode = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.sig`;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    service = new AuthService(testConfig);
  });

  it('records the in-memory JWT, token expiry, and cached profile', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = makeJwt({ id: 7, email: 'discord@test.com', exp });
    const user = {
      id: 7,
      email: 'discord@test.com',
      username: 'DiscordUser',
      accessLevel: 'none' as const,
    };

    service.persistSession(jwt, user);

    // In-memory JWT is available to consumers (e.g. WebSocket auth).
    expect(service.getCurrentToken()).toBe(jwt);
    // Expiry is persisted so a later reload can schedule proactive refresh.
    expect(service.getStoredTokenExpiry()).toBe(exp);
    // Profile is cached so the session restores instantly on reload.
    expect(service.getStoredUserProfile()).toEqual(user);
  });
});

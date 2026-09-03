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

describe('AuthService MFA methods', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(testConfig);
  });

  describe('startMfaEnrollment', () => {
    it('returns secret and otpauthUri on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          secret: 'ABC123',
          otpauthUri: 'otpauth://totp/test',
        }),
      });

      const result = await service.startMfaEnrollment();

      expect(result).toEqual({
        secret: 'ABC123',
        otpauthUri: 'otpauth://totp/test',
      });
    });

    it('throws with body.error message on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ error: 'Not authenticated' }),
      });

      await expect(service.startMfaEnrollment()).rejects.toThrow(
        'Not authenticated',
      );
    });

    it('throws fallback message when body has no error field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({}),
      });

      await expect(service.startMfaEnrollment()).rejects.toThrow(
        'MFA enroll failed: 500',
      );
    });
  });

  describe('verifyMfaSetup', () => {
    it('resolves without error on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      await expect(service.verifyMfaSetup('123456')).resolves.toBeUndefined();
    });

    it('throws with body.error message on invalid code', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ error: 'Invalid code' }),
      });

      await expect(service.verifyMfaSetup('000000')).rejects.toThrow(
        'Invalid code',
      );
    });

    it('throws fallback message when body has no error field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({}),
      });

      await expect(service.verifyMfaSetup('123456')).rejects.toThrow(
        'MFA verify failed: 400',
      );
    });
  });

  describe('disableMfa', () => {
    it('resolves without error on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      await expect(service.disableMfa()).resolves.toBeUndefined();
    });

    it('throws with body.error message on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: jest.fn().mockResolvedValue({ error: 'Forbidden' }),
      });

      await expect(service.disableMfa()).rejects.toThrow('Forbidden');
    });

    it('throws fallback message when body has no error field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({}),
      });

      await expect(service.disableMfa()).rejects.toThrow(
        'MFA disable failed: 500',
      );
    });
  });
});

describe('AuthService.authenticateWithEmail (LS-9751)', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(testConfig);
  });

  it('logs a wrong-password (401) rejection at warn, not error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ error: 'Invalid credentials' }),
    });

    await expect(
      service.authenticateWithEmail('user@test.com', 'wrong-password'),
    ).rejects.toThrow('Invalid credentials');

    expect(mockLogger.error.mock.calls).toHaveLength(0);
    expect(mockLogger.warn.mock.calls).toHaveLength(1);
    expect(mockLogger.warn.mock.calls[0][0]).toBe(
      'AuthService: Email authentication failed:',
    );
  });

  it('preserves the HTTP status on the rethrown error so callers can also branch on it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ error: 'Invalid credentials' }),
    });

    await expect(
      service.authenticateWithEmail('user@test.com', 'wrong-password'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('logs an unexpected (500) failure at error level', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: 'Internal Server Error' }),
    });

    await expect(
      service.authenticateWithEmail('user@test.com', 'any-password'),
    ).rejects.toThrow('Internal Server Error');

    expect(mockLogger.warn.mock.calls).toHaveLength(0);
    expect(mockLogger.error.mock.calls).toHaveLength(1);
    expect(mockLogger.error.mock.calls[0][0]).toBe(
      'AuthService: Email authentication failed:',
    );
  });

  it('logs a network failure (no status) at error level', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      service.authenticateWithEmail('user@test.com', 'any-password'),
    ).rejects.toThrow();

    expect(mockLogger.warn.mock.calls).toHaveLength(0);
    expect(mockLogger.error.mock.calls).toHaveLength(1);
  });
});

describe('AuthService.unlinkProvider', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(testConfig);
  });

  it('calls the correct URL for each provider', async () => {
    for (const provider of ['discord', 'google', 'apple'] as const) {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await service.unlinkProvider(provider);
      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:5001/${provider}/unlink`,
        expect.objectContaining({ method: 'POST' }),
      );
    }
  });

  it('includes Content-Type and credentials in the request', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await service.unlinkProvider('google');
    const [[, init]] = (global.fetch as jest.Mock).mock.calls as [
      [string, RequestInit],
    ];
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('resolves without a value on a 200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await expect(service.unlinkProvider('apple')).resolves.toBeUndefined();
  });

  it('throws with provider name and status code when response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue(''),
    });
    await expect(service.unlinkProvider('google')).rejects.toThrow(
      'google unlink failed: 500',
    );
  });

  it('uses the message field from a JSON error body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest
        .fn()
        .mockResolvedValue(
          JSON.stringify({ message: 'Account is your only sign-in' }),
        ),
    });
    await expect(service.unlinkProvider('discord')).rejects.toThrow(
      'Account is your only sign-in',
    );
  });

  it('uses the error field from a JSON body when message is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ error: 'Unprocessable' })),
    });
    await expect(service.unlinkProvider('google')).rejects.toThrow(
      'Unprocessable',
    );
  });

  it('falls back to the default message when the error body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('Service Unavailable'),
    });
    await expect(service.unlinkProvider('apple')).rejects.toThrow(
      'apple unlink failed: 503',
    );
  });
});

describe('AuthService.persistSession', () => {
  let service: AuthService;

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

describe('AuthService token storage hardening (LS-2641)', () => {
  let service: AuthService;

  const testUser = {
    id: 7,
    email: 'user@test.com',
    username: 'TestUser',
    accessLevel: 'none' as const,
  };

  /** Mock a successful oauth-proxy /google exchange response body. */
  function mockOAuthExchange(body: Record<string, unknown>): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    service = new AuthService(testConfig);
  });

  it('never persists the OAuth refresh token to localStorage', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = makeJwt({ id: 7, email: 'user@test.com', exp });
    mockOAuthExchange({
      jwt,
      refreshToken: 'refresh-token-secret',
      user: testUser,
    });

    await service.authenticateWithOAuth({ code: 'auth-code' });

    // localStorage is readable by any JS on the origin — a refresh token
    // stored there turns any XSS into full account takeover (LS-2641).
    expect(localStorage.getItem('auth_refresh_token')).toBeNull();
    // The JWT stays in memory only; the session cookie is HttpOnly.
    expect(service.getCurrentToken()).toBe(jwt);
  });

  it('scrubs a refresh token persisted by older builds on login', async () => {
    localStorage.setItem('auth_refresh_token', 'stale-refresh-token');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = makeJwt({ id: 7, email: 'user@test.com', exp });
    mockOAuthExchange({ jwt, user: testUser });

    await service.authenticateWithOAuth({ code: 'auth-code' });

    expect(localStorage.getItem('auth_refresh_token')).toBeNull();
  });
});

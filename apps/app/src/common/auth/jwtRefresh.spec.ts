// ── Mocks (hoisted above the module-under-test import) ───────────────────────

const mockProxyUrl = jest.fn<string | undefined, []>();
jest.mock('./mobileOAuthConfig', () => ({
  resolveOAuthProxyUrl: (): string | undefined => mockProxyUrl(),
}));

const mockEmitSessionExpired = jest.fn();
jest.mock('./sessionEvents', () => ({
  emitSessionExpired: (): void => {
    mockEmitSessionExpired();
  },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();
jest.mock('@legacy-sports/shared-components', () => ({
  SecureStorageProvider: {
    getItem: (key: string): Promise<string | null> => mockGetItem(key),
    setItem: (key: string, value: string): Promise<void> =>
      mockSetItem(key, value),
    removeItem: jest.fn(),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Re-imported fresh per test (see beforeEach) so the module-level in-flight
// dedup promise cannot leak across tests.
type JwtRefreshModule = typeof import('./jwtRefresh');
let silentlyRefreshJwt: JwtRefreshModule['silentlyRefreshJwt'];
let INTERNAL_JWT_KEY: JwtRefreshModule['INTERNAL_JWT_KEY'];

function okJwtResponse(jwt: unknown): unknown {
  return { ok: true, status: 200, json: () => Promise.resolve({ jwt }) };
}

function errorResponse(status: number): unknown {
  return { ok: false, status, json: () => Promise.resolve({}) };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the module registry so jwtRefresh's module-level in-flight dedup
  // promise starts null in every test (it would otherwise leak across tests).
  jest.resetModules();
  mockProxyUrl.mockReturnValue('https://proxy.example.com');
  mockGetItem.mockResolvedValue('stored-jwt');
  mockSetItem.mockResolvedValue(undefined);
  const mod = jest.requireActual<JwtRefreshModule>('./jwtRefresh');
  silentlyRefreshJwt = mod.silentlyRefreshJwt;
  INTERNAL_JWT_KEY = mod.INTERNAL_JWT_KEY;
});

describe('silentlyRefreshJwt', () => {
  it('refreshes, stores the new JWT, and does not clear the session on success', async () => {
    mockFetch.mockResolvedValue(okJwtResponse('fresh-jwt'));

    const result = await silentlyRefreshJwt();

    expect(result).toBe('fresh-jwt');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proxy.example.com/refresh-jwt');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer stored-jwt',
    );
    expect(mockSetItem).toHaveBeenCalledWith(INTERNAL_JWT_KEY, 'fresh-jwt');
    expect(mockEmitSessionExpired).not.toHaveBeenCalled();
  });

  it('clears the session and returns null when the endpoint rejects with 401', async () => {
    mockFetch.mockResolvedValue(errorResponse(401));

    const result = await silentlyRefreshJwt();

    expect(result).toBeNull();
    expect(mockEmitSessionExpired).toHaveBeenCalledTimes(1);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('clears the session when the endpoint rejects with 403', async () => {
    mockFetch.mockResolvedValue(errorResponse(403));

    const result = await silentlyRefreshJwt();

    expect(result).toBeNull();
    expect(mockEmitSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does NOT clear the session on a transient 5xx (keeps the user signed in)', async () => {
    mockFetch.mockResolvedValue(errorResponse(503));

    const result = await silentlyRefreshJwt();

    expect(result).toBeNull();
    expect(mockEmitSessionExpired).not.toHaveBeenCalled();
  });

  it('does NOT clear the session on a network failure', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    const result = await silentlyRefreshJwt();

    expect(result).toBeNull();
    expect(mockEmitSessionExpired).not.toHaveBeenCalled();
  });

  it('clears the session without calling the endpoint when no token is stored', async () => {
    mockGetItem.mockResolvedValue(null);

    const result = await silentlyRefreshJwt();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockEmitSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('clears the session without calling the endpoint when the proxy URL is unset', async () => {
    mockProxyUrl.mockReturnValue(undefined);

    const result = await silentlyRefreshJwt();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockEmitSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent refreshes into a single request', async () => {
    mockFetch.mockResolvedValue(okJwtResponse('fresh-jwt'));

    // Both calls are issued synchronously before any await resolves, so the
    // second must observe the in-flight promise set by the first.
    const first = silentlyRefreshJwt();
    const second = silentlyRefreshJwt();
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe('fresh-jwt');
    expect(b).toBe('fresh-jwt');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

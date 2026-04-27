import { getInstallationToken, getRepoInstallationToken } from './github-app';

jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'mock-jwt') }));

const MOCK_TOKEN = 'ghs_test_token';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.resetAllMocks();
});

// ── getInstallationToken ──────────────────────────────────────────────────────

describe('getInstallationToken', () => {
  const PRIVATE_KEY = 'any-key-value'; // jsonwebtoken.sign is mocked above

  it('exchanges a JWT for an installation token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: MOCK_TOKEN }),
    });

    const token = await getInstallationToken(12345, PRIVATE_KEY, 99);

    const [callUrl, callOpts] = mockFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(callUrl).toBe(
      'https://api.github.com/app/installations/99/access_tokens',
    );
    expect(callOpts.method).toBe('POST');
    expect(
      (callOpts.headers as Record<string, string>)['Authorization'],
    ).toMatch(/^Bearer /);
    expect(token).toBe(MOCK_TOKEN);
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(getInstallationToken(12345, PRIVATE_KEY, 99)).rejects.toThrow(
      '403',
    );
  });
});

// ── getRepoInstallationToken ──────────────────────────────────────────────────

describe('getRepoInstallationToken', () => {
  const PRIVATE_KEY = 'any-key-value';

  it('looks up installation ID then exchanges it for an access token', async () => {
    // First fetch: GET /repos/{owner}/{repo}/installation → { id }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 99 }),
    });
    // Second fetch: POST /app/installations/99/access_tokens → { token }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: MOCK_TOKEN }),
    });

    const token = await getRepoInstallationToken(
      12345,
      PRIVATE_KEY,
      'owner',
      'repo',
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [installUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(installUrl).toBe(
      'https://api.github.com/repos/owner/repo/installation',
    );
    const [tokenUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(tokenUrl).toBe(
      'https://api.github.com/app/installations/99/access_tokens',
    );
    expect(token).toBe(MOCK_TOKEN);
  });

  it('throws when the installation lookup returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    });

    await expect(
      getRepoInstallationToken(12345, PRIVATE_KEY, 'owner', 'repo'),
    ).rejects.toThrow('404');
  });
});

import { githubGraphQL, githubRest } from './github-api';

jest.mock('./auth', () => ({
  getToken: jest.fn(),
  invalidateToken: jest.fn(),
}));

const { getToken: mockGetToken, invalidateToken: mockInvalidateToken } =
  jest.requireMock('./auth') as {
    getToken: jest.Mock;
    invalidateToken: jest.Mock;
  };

const originalFetch = global.fetch;
const mockFetch = jest.fn();

/** Build a fetch Response. `retryAfter` adds a `Retry-After` header. */
function makeResponse(
  status: number,
  body: unknown,
  retryAfter?: string,
): Response {
  const headers: Record<string, string> = {};
  if (retryAfter !== undefined) headers['retry-after'] = retryAfter;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(status === 204 ? null : text, { status, headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue('test-token');
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('githubRest secondary rate limit handling', () => {
  it('retries on a secondary rate limit and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeResponse(
          403,
          { message: 'You have exceeded a secondary rate limit.' },
          '0',
        ),
      )
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const result = await githubRest<{ ok: boolean }>({
      method: 'POST',
      path: '/repos/o/r/issues/1/labels',
      body: { labels: ['bot:ready-for-review'] },
    });

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on a 429 abuse-detection throttle', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeResponse(
          429,
          { message: 'You have triggered an abuse detection mechanism.' },
          '0',
        ),
      )
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const result = await githubRest<{ ok: boolean }>({
      method: 'POST',
      path: '/repos/o/r/issues/1/labels',
    });

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the max number of secondary-rate-limit retries', async () => {
    // Fresh Response per call — a Response body can only be read once.
    mockFetch.mockImplementation(async () =>
      makeResponse(
        403,
        { message: 'You have exceeded a secondary rate limit.' },
        '0',
      ),
    );

    await expect(
      githubRest({ method: 'POST', path: '/repos/o/r/issues/1/labels' }),
    ).rejects.toThrow(/failed \(403\)/);

    // initial attempt + 3 retries
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 403 permission error (not a rate limit)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(403, { message: 'Resource not accessible by integration' }),
    );

    await expect(
      githubRest({ method: 'GET', path: '/repos/o/r/statuses/x' }),
    ).rejects.toThrow(/missing GitHub App permission/);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('names "Administration: Read" for a 403 on /actions/runners', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(403, { message: 'Resource not accessible by integration' }),
    );

    await expect(
      githubRest({ method: 'GET', path: '/repos/o/r/actions/runners' }),
    ).rejects.toThrow(/Administration/);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('githubGraphQL secondary rate limit handling', () => {
  it('retries on a secondary rate limit and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeResponse(
          403,
          { message: 'You have exceeded a secondary rate limit.' },
          '0',
        ),
      )
      .mockResolvedValueOnce(makeResponse(200, { data: { ok: true } }));

    const result = await githubGraphQL<{ ok: boolean }>('mutation {}', {});

    expect(result.data).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

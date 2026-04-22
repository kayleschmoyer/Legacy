import {
  createCheckRun,
  getInstallationToken,
  getPrReviewThreads,
  getRepoInstallationToken,
  listPullRequestsForCommit,
} from './github-app';

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

// ── createCheckRun ────────────────────────────────────────────────────────────

describe('createCheckRun', () => {
  it('creates a new check run when no in_progress run exists', async () => {
    // Lookup returns runs but none are in_progress
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          total_count: 1,
          check_runs: [{ id: 11111, status: 'completed' }],
        }),
    });
    // POST creates a new run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createCheckRun(MOCK_TOKEN, 'owner', 'repo', {
      name: 'bot-review',
      headSha: 'abc1234',
      conclusion: 'success',
      title: 'All good',
      summary: 'Review passed',
    });

    const [url, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/owner/repo/check-runs');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: 'bot-review',
      head_sha: 'abc1234',
      status: 'completed',
      conclusion: 'success',
    });
  });

  it('updates the in_progress run when one is found, ignoring completed runs', async () => {
    // Lookup returns both a completed run and an in_progress run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          total_count: 2,
          check_runs: [
            { id: 11111, status: 'completed' },
            { id: 99999, status: 'in_progress' },
          ],
        }),
    });
    // PATCH updates the in_progress run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createCheckRun(MOCK_TOKEN, 'owner', 'repo', {
      name: 'bot-review',
      headSha: 'abc1234',
      conclusion: 'success',
      title: 'All good',
      summary: 'Review passed',
    });

    const [url, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/owner/repo/check-runs/99999',
    );
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'completed', conclusion: 'success' });
    expect(body).not.toHaveProperty('head_sha');
  });

  it('throws when the lookup returns a non-404 error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await expect(
      createCheckRun(MOCK_TOKEN, 'owner', 'repo', {
        name: 'bot-review',
        headSha: 'abc1234',
        conclusion: 'failure',
        title: 'Failed',
        summary: 'Review failed',
      }),
    ).rejects.toThrow('500');
  });

  it('falls back to POST when lookup returns 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createCheckRun(MOCK_TOKEN, 'owner', 'repo', {
      name: 'bot-review',
      headSha: 'abc1234',
      conclusion: 'success',
      title: 'All good',
      summary: 'Review passed',
    });

    const [url, opts] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/owner/repo/check-runs');
    expect(opts.method).toBe('POST');
  });

  it('throws on non-2xx response from the create/update call', async () => {
    // Lookup finds no in_progress run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total_count: 0, check_runs: [] }),
    });
    // POST fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Unprocessable Entity'),
    });

    await expect(
      createCheckRun(MOCK_TOKEN, 'owner', 'repo', {
        name: 'bot-review',
        headSha: 'abc1234',
        conclusion: 'failure',
        title: 'Failed',
        summary: 'Review failed',
      }),
    ).rejects.toThrow('422');
  });
});

// ── getPrReviewThreads ────────────────────────────────────────────────────────

const GRAPHQL_RESPONSE = (
  nodes: Array<{
    isResolved: boolean;
    isOutdated: boolean;
    authorLogin: string | null;
  }>,
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage, endCursor },
              nodes: nodes.map(({ isResolved, isOutdated, authorLogin }) => ({
                isResolved,
                isOutdated,
                comments: {
                  nodes: authorLogin
                    ? [{ author: { login: authorLogin } }]
                    : [],
                },
              })),
            },
          },
        },
      },
    }),
});

describe('getPrReviewThreads', () => {
  it('returns mapped thread objects from a single page', async () => {
    mockFetch.mockResolvedValueOnce(
      GRAPHQL_RESPONSE([
        {
          isResolved: false,
          isOutdated: false,
          authorLogin: 'copilot-pull-request-reviewer',
        },
        { isResolved: true, isOutdated: false, authorLogin: 'human-user' },
      ]),
    );

    const threads = await getPrReviewThreads(MOCK_TOKEN, 'owner', 'repo', 42);

    expect(threads).toHaveLength(2);
    expect(threads[0]).toEqual({
      isResolved: false,
      isOutdated: false,
      authorLogin: 'copilot-pull-request-reviewer',
    });
    expect(threads[1]).toEqual({
      isResolved: true,
      isOutdated: false,
      authorLogin: 'human-user',
    });
  });

  it('paginates across multiple pages', async () => {
    mockFetch
      .mockResolvedValueOnce(
        GRAPHQL_RESPONSE(
          [
            {
              isResolved: false,
              isOutdated: false,
              authorLogin: 'copilot-pull-request-reviewer',
            },
          ],
          true,
          'cursor1',
        ),
      )
      .mockResolvedValueOnce(
        GRAPHQL_RESPONSE(
          [{ isResolved: true, isOutdated: false, authorLogin: 'human' }],
          false,
          null,
        ),
      );

    const threads = await getPrReviewThreads(MOCK_TOKEN, 'owner', 'repo', 1);

    expect(threads).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('maps null author to null authorLogin', async () => {
    mockFetch.mockResolvedValueOnce(
      GRAPHQL_RESPONSE([
        { isResolved: false, isOutdated: false, authorLogin: null },
      ]),
    );

    const threads = await getPrReviewThreads(MOCK_TOKEN, 'owner', 'repo', 1);
    expect(threads[0].authorLogin).toBeNull();
  });

  it('throws on GraphQL errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ errors: [{ message: 'Not found' }] }),
    });

    await expect(
      getPrReviewThreads(MOCK_TOKEN, 'owner', 'repo', 1),
    ).rejects.toThrow('GraphQL errors: Not found');
  });

  it('throws when reviewThreads field is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ data: { repository: { pullRequest: {} } } }),
    });

    await expect(
      getPrReviewThreads(MOCK_TOKEN, 'owner', 'repo', 1),
    ).rejects.toThrow('reviewThreads');
  });

  it('throws on non-2xx HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    await expect(
      getPrReviewThreads(MOCK_TOKEN, 'owner', 'repo', 1),
    ).rejects.toThrow('500');
  });

  it('returns partial results and does not throw when MAX_PAGES is exhausted', async () => {
    // Simulate 10 pages (MAX_PAGES), each reporting hasNextPage=true.
    // The function should stop after 10 requests and return what it has.
    for (let i = 0; i < 10; i++) {
      mockFetch.mockResolvedValueOnce(
        GRAPHQL_RESPONSE(
          [{ isResolved: false, isOutdated: false, authorLogin: `user-${i}` }],
          true, // always more pages
          `cursor-${i}`,
        ),
      );
    }

    const threads = await getPrReviewThreads(MOCK_TOKEN, 'owner', 'repo', 1);

    expect(threads).toHaveLength(10);
    expect(mockFetch).toHaveBeenCalledTimes(10);
  });
});

// ── listPullRequestsForCommit ─────────────────────────────────────────────────

describe('listPullRequestsForCommit', () => {
  it('returns mapped PR objects', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            number: 42,
            state: 'open',
            head: { sha: 'abc1234', repo: { full_name: 'owner/repo' } },
            updated_at: '2024-01-01T00:00:00Z',
          },
          {
            number: 7,
            state: 'closed',
            head: { sha: 'abc1234', repo: null },
            updated_at: '2024-01-02T00:00:00Z',
          },
        ]),
    });

    const prs = await listPullRequestsForCommit(
      MOCK_TOKEN,
      'owner',
      'repo',
      'abc1234',
    );

    expect(prs).toHaveLength(2);
    expect(prs[0]).toEqual({
      number: 42,
      state: 'open',
      headSha: 'abc1234',
      headRepoFullName: 'owner/repo',
      updatedAt: '2024-01-01T00:00:00Z',
    });
    expect(prs[1]).toEqual({
      number: 7,
      state: 'closed',
      headSha: 'abc1234',
      headRepoFullName: null,
      updatedAt: '2024-01-02T00:00:00Z',
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/owner/repo/commits/abc1234/pulls',
    );
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    });

    await expect(
      listPullRequestsForCommit(MOCK_TOKEN, 'owner', 'repo', 'abc1234'),
    ).rejects.toThrow('404');
  });
});

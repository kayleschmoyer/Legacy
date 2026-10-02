jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

import {
  ACTIONS_CACHE_LIMIT_BYTES,
  cacheKeyPrefix,
  DEFAULT_CACHE_ROW_LIMIT,
  getRepoInfo,
} from './get-repo-info';

const { githubRest: mockGithubRest } = jest.requireMock<{
  githubRest: jest.Mock;
}>('../github-api');
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');

function repoResponse(overrides: Record<string, unknown> = {}) {
  return {
    owner: { login: 'bkrupa' },
    name: 'legacy-sports',
    default_branch: 'main',
    html_url: 'https://github.com/bkrupa/legacy-sports',
    ...overrides,
  };
}

function parse(text: string) {
  return JSON.parse(text) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({
    owner: 'bkrupa',
    name: 'legacy-sports',
  });
});

describe('getRepoInfo default behavior', () => {
  it('returns exactly the same fields as before when include is omitted', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse());

    const result = await getRepoInfo();

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenCalledTimes(1);
    expect(mockGithubRest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports',
    });
    expect(parse(result.content[0].text)).toEqual({
      owner: 'bkrupa',
      name: 'legacy-sports',
      defaultBranch: 'main',
      url: 'https://github.com/bkrupa/legacy-sports',
    });
  });

  it('returns exactly the same fields when include is an empty array', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse());

    const result = await getRepoInfo({ include: [] });

    expect(mockGithubRest).toHaveBeenCalledTimes(1);
    expect(parse(result.content[0].text)).toEqual({
      owner: 'bkrupa',
      name: 'legacy-sports',
      defaultBranch: 'main',
      url: 'https://github.com/bkrupa/legacy-sports',
    });
  });

  it('returns an error result when the repo REST call throws', async () => {
    mockGithubRest.mockRejectedValueOnce(new Error('boom'));
    const result = await getRepoInfo();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('boom');
  });
});

describe('getRepoInfo include: rulesets', () => {
  it('fetches rulesets and includes a summarized array', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse()).mockResolvedValueOnce([
      {
        id: 1,
        name: 'main-protection',
        target: 'branch',
        source_type: 'Repository',
        enforcement: 'active',
      },
    ]);

    const result = await getRepoInfo({ include: ['rulesets'] });

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/rulesets',
      query: { per_page: '100' },
    });
    const body = parse(result.content[0].text);
    expect(body.rulesets).toEqual([
      {
        id: 1,
        name: 'main-protection',
        target: 'branch',
        sourceType: 'Repository',
        enforcement: 'active',
      },
    ]);
    expect(body).not.toHaveProperty('actionsPermissions');
  });

  it('forwards includesParents alongside per_page in the query', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce([]);

    await getRepoInfo({ include: ['rulesets'], includesParents: true });

    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/rulesets',
      query: { per_page: '100', includes_parents: 'true' },
    });
  });

  it('omits includes_parents when includesParents is not provided', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce([]);

    await getRepoInfo({ include: ['rulesets'] });

    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/rulesets',
      query: { per_page: '100' },
    });
  });
});

describe('getRepoInfo include: actions_permissions', () => {
  it('fetches workflow permissions and includes them', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse()).mockResolvedValueOnce({
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: false,
    });

    const result = await getRepoInfo({ include: ['actions_permissions'] });

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/actions/permissions/workflow',
    });
    const body = parse(result.content[0].text);
    expect(body.actionsPermissions).toEqual({
      defaultWorkflowPermissions: 'read',
      canApprovePullRequestReviews: false,
    });
    expect(body).not.toHaveProperty('rulesets');
  });
});

describe('getRepoInfo include: both', () => {
  it('fetches and includes both rulesets and actions permissions', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce([
        {
          id: 2,
          name: 'protect-main',
          target: 'branch',
          source_type: 'Repository',
          enforcement: 'active',
        },
      ])
      .mockResolvedValueOnce({
        default_workflow_permissions: 'write',
        can_approve_pull_request_reviews: true,
      });

    const result = await getRepoInfo({
      include: ['rulesets', 'actions_permissions'],
    });

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenCalledTimes(3);
    const body = parse(result.content[0].text);
    expect(body.rulesets).toHaveLength(1);
    expect(body.actionsPermissions).toEqual({
      defaultWorkflowPermissions: 'write',
      canApprovePullRequestReviews: true,
    });
  });

  it('returns an error result when the rulesets call throws', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockRejectedValueOnce(new Error('rulesets boom'));

    const result = await getRepoInfo({ include: ['rulesets'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('rulesets boom');
  });
});

describe('getRepoInfo include: actions_cache', () => {
  const MB = 1024 ** 2;

  function cache(key: string, sizeMB: number, ref = 'refs/heads/main') {
    return {
      key,
      ref,
      size_in_bytes: sizeMB * MB,
      created_at: '2026-09-29T10:00:00Z',
      last_accessed_at: '2026-09-30T10:00:00Z',
    };
  }

  function cacheBody(result: { content: { text: string }[] }) {
    return parse(result.content[0].text).actionsCache as {
      usageBytes: number;
      limitBytes: number;
      count: number;
      groups: {
        prefix: string;
        count: number;
        sizeMB: number;
        entries: Record<string, unknown>[];
      }[];
      truncated: boolean;
      partial: boolean;
    };
  }

  it('returns usage against the 10 GB limit and entries grouped by key prefix, largest first', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce({
        active_caches_size_in_bytes: 11_500_000_000,
        active_caches_count: 4,
      })
      .mockResolvedValueOnce({
        total_count: 4,
        // Deliberately unsorted: ordering must not rely on the API's sort.
        actions_caches: [
          cache('Linux-pnpm-store-aaaaaaa1', 200),
          cache('nx-cache-1a2b3c4d5e', 900, 'refs/pull/12/merge'),
          cache('Linux-pnpm-store-bbbbbbb2', 300),
          cache('nx-cache-9f8e7d6c5b', 1000, 'refs/pull/34/merge'),
        ],
      });

    const result = await getRepoInfo({ include: ['actions_cache'] });

    expect(result.isError).toBeFalsy();
    expect(mockGithubRest).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/actions/cache/usage',
    });
    expect(mockGithubRest).toHaveBeenNthCalledWith(3, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/actions/caches',
      query: {
        per_page: '100',
        page: '1',
        sort: 'size_in_bytes',
        direction: 'desc',
      },
    });
    expect(cacheBody(result)).toEqual({
      usageBytes: 11_500_000_000,
      limitBytes: ACTIONS_CACHE_LIMIT_BYTES,
      count: 4,
      groups: [
        {
          prefix: 'nx-cache',
          count: 2,
          sizeMB: 1900,
          entries: [
            {
              key: 'nx-cache-9f8e7d6c5b',
              ref: 'refs/pull/34/merge',
              sizeMB: 1000,
              createdAt: '2026-09-29T10:00:00Z',
              lastAccessedAt: '2026-09-30T10:00:00Z',
            },
            {
              key: 'nx-cache-1a2b3c4d5e',
              ref: 'refs/pull/12/merge',
              sizeMB: 900,
              createdAt: '2026-09-29T10:00:00Z',
              lastAccessedAt: '2026-09-30T10:00:00Z',
            },
          ],
        },
        {
          prefix: 'Linux-pnpm-store',
          count: 2,
          sizeMB: 500,
          entries: [
            expect.objectContaining({ key: 'Linux-pnpm-store-bbbbbbb2' }),
            expect.objectContaining({ key: 'Linux-pnpm-store-aaaaaaa1' }),
          ],
        },
      ],
      truncated: false,
      partial: false,
    });
    expect(ACTIONS_CACHE_LIMIT_BYTES).toBe(10_737_418_240);
  });

  it('caps entry rows at cacheLimit while keeping full group totals', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce({
        active_caches_size_in_bytes: 600 * MB,
        active_caches_count: 3,
      })
      .mockResolvedValueOnce({
        total_count: 3,
        actions_caches: [
          cache('nx-cache-1111111', 300),
          cache('pnpm-2222222', 200),
          cache('nx-cache-3333333', 100),
        ],
      });

    const body = cacheBody(
      await getRepoInfo({ include: ['actions_cache'], cacheLimit: 2 }),
    );

    expect(body.truncated).toBe(true);
    expect(body.groups.flatMap((g) => g.entries)).toHaveLength(2);
    expect(body.groups).toEqual([
      expect.objectContaining({ prefix: 'nx-cache', count: 2, sizeMB: 400 }),
      expect.objectContaining({ prefix: 'pnpm', count: 1, sizeMB: 200 }),
    ]);
    expect(body.groups[0].entries).toEqual([
      expect.objectContaining({ key: 'nx-cache-1111111' }),
    ]);
  });

  it('defaults the row cap and pages until total_count is reached', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      cache(`nx-cache-${String(i).padStart(3, '0')}`, 10),
    );
    const page2 = [cache('nx-cache-100', 5)];
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce({
        active_caches_size_in_bytes: 1005 * MB,
        active_caches_count: 101,
      })
      .mockResolvedValueOnce({ total_count: 101, actions_caches: page1 })
      .mockResolvedValueOnce({ total_count: 101, actions_caches: page2 });

    const body = cacheBody(await getRepoInfo({ include: ['actions_cache'] }));

    expect(mockGithubRest).toHaveBeenCalledTimes(4);
    expect(mockGithubRest).toHaveBeenNthCalledWith(4, {
      method: 'GET',
      path: '/repos/bkrupa/legacy-sports/actions/caches',
      query: {
        per_page: '100',
        page: '2',
        sort: 'size_in_bytes',
        direction: 'desc',
      },
    });
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].count).toBe(101);
    expect(body.groups[0].sizeMB).toBe(1005);
    expect(body.groups[0].entries).toHaveLength(DEFAULT_CACHE_ROW_LIMIT);
    expect(body.truncated).toBe(true);
    expect(body.partial).toBe(false);
  });

  it('stops at the page bound and flags partial when more caches exist', async () => {
    mockGithubRest.mockResolvedValueOnce(repoResponse()).mockResolvedValueOnce({
      active_caches_size_in_bytes: 1,
      active_caches_count: 5000,
    });
    mockGithubRest.mockImplementation(() =>
      Promise.resolve({
        total_count: 5000,
        actions_caches: Array.from({ length: 100 }, () => cache('k', 1)),
      }),
    );

    const body = cacheBody(await getRepoInfo({ include: ['actions_cache'] }));

    // repo + usage + 10 pages
    expect(mockGithubRest).toHaveBeenCalledTimes(12);
    expect(body.partial).toBe(true);
    mockGithubRest.mockReset();
  });

  it.each([
    [0, 1],
    [2.9, 2],
    [10_000, 3],
  ])('clamps cacheLimit %s to %s rows', async (cacheLimit, rows) => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce({
        active_caches_size_in_bytes: 6 * MB,
        active_caches_count: 3,
      })
      .mockResolvedValueOnce({
        total_count: 3,
        actions_caches: [cache('a', 3), cache('b', 2), cache('c', 1)],
      });

    const body = cacheBody(
      await getRepoInfo({ include: ['actions_cache'], cacheLimit }),
    );

    expect(body.groups.flatMap((g) => g.entries)).toHaveLength(rows);
  });

  it('handles an empty cache list', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce({
        active_caches_size_in_bytes: 0,
        active_caches_count: 0,
      })
      .mockResolvedValueOnce({ total_count: 0, actions_caches: [] });

    const body = cacheBody(await getRepoInfo({ include: ['actions_cache'] }));

    expect(body.groups).toEqual([]);
    expect(body.truncated).toBe(false);
    expect(body.partial).toBe(false);
  });

  it('returns an error result when the cache usage call throws', async () => {
    mockGithubRest
      .mockResolvedValueOnce(repoResponse())
      .mockRejectedValueOnce(new Error('cache boom'));

    const result = await getRepoInfo({ include: ['actions_cache'] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cache boom');
  });
});

describe('cacheKeyPrefix', () => {
  it.each([
    ['Linux-pnpm-store-3f9a2c1d', 'Linux-pnpm-store'],
    ['nx-cache-1a2b3c4d5e6f-4821', 'nx-cache'],
    ['playwright-1.48.0-abcdef0123', 'playwright-1.48.0'],
    ['setup-node', 'setup-node'],
    ['deadbeef1234', 'deadbeef1234'],
  ])('%s -> %s', (key, prefix) => {
    expect(cacheKeyPrefix(key)).toBe(prefix);
  });
});

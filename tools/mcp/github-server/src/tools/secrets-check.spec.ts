jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { secretsCheck } from './secrets-check';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

interface ParsedBody {
  [key: string]: unknown;
}

function secret(name: string) {
  return {
    name,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function parseBody(text: string): ParsedBody {
  return JSON.parse(text) as ParsedBody;
}

describe('secretsCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('lists all repo secrets when names is omitted', async () => {
    mockedRest.mockResolvedValueOnce({
      total_count: 1,
      secrets: [secret('FOO')],
    });

    const text = (await secretsCheck({})).content[0].text;
    expect(mockedRest).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/repos/o/r/actions/secrets' }),
    );
    expect(parseBody(text)).toEqual({
      totalCount: 1,
      secrets: [
        {
          name: 'FOO',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
  });

  it('checks specific secret names against the per-secret endpoint', async () => {
    mockedRest.mockResolvedValueOnce(secret('FOO'));
    mockedRest.mockRejectedValueOnce(new Error('not found'));

    const text = (await secretsCheck({ names: ['FOO', 'BAR'] })).content[0]
      .text;
    expect(parseBody(text)).toEqual({
      checked: 2,
      results: [
        {
          name: 'FOO',
          exists: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        { name: 'BAR', exists: false },
      ],
    });
  });

  it('degrades gracefully instead of throwing when list mode 403s on token scope', async () => {
    mockedRest.mockRejectedValueOnce(
      new Error(
        'GitHub API GET /repos/o/r/actions/secrets failed (403): {"message":"Resource not accessible by integration"}',
      ),
    );

    const result = await secretsCheck({});
    expect(result.isError).toBeUndefined();
    const body = parseBody(result.content[0].text);
    expect(body.degraded).toBe(true);
    expect(body.hint).toMatch(/names/);
  });

  it('surfaces non-scope errors from list mode as a hard failure', async () => {
    mockedRest.mockRejectedValueOnce(new Error('network error'));

    const result = await secretsCheck({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('network error');
  });

  it('scopes to an environment when environment is provided', async () => {
    mockedRest.mockResolvedValueOnce({
      total_count: 0,
      secrets: [],
    });

    const text = (await secretsCheck({ environment: 'github-pages' }))
      .content[0].text;
    expect(mockedRest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repos/o/r/environments/github-pages/secrets',
      }),
    );
    expect(parseBody(text)).toEqual({
      totalCount: 0,
      environment: 'github-pages',
      secrets: [],
    });
  });

  it('checks specific secret names scoped to an environment', async () => {
    mockedRest.mockResolvedValueOnce(secret('VITE_OAUTH_PROXY_URL'));

    const text = (
      await secretsCheck({
        names: ['VITE_OAUTH_PROXY_URL'],
        environment: 'github-pages',
      })
    ).content[0].text;
    expect(mockedRest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repos/o/r/environments/github-pages/secrets/VITE_OAUTH_PROXY_URL',
      }),
    );
    expect(parseBody(text)).toEqual({
      checked: 1,
      environment: 'github-pages',
      results: [
        {
          name: 'VITE_OAUTH_PROXY_URL',
          exists: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
  });

  it('rejects an empty names array', async () => {
    const result = await secretsCheck({ names: [] });
    expect(result.isError).toBe(true);
  });
});

import { bulkMerge } from './bulk-merge';

jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
  githubGraphQL: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

const { githubRest: mockGithubRest, githubGraphQL: mockGithubGraphQL } =
  jest.requireMock('../github-api') as {
    githubRest: jest.Mock;
    githubGraphQL: jest.Mock;
  };
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock(
  '../auth',
) as { getRepoOwnerName: jest.Mock };

beforeEach(() => {
  jest.resetAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({ owner: 'o', name: 'r' });
});

describe('bulkMerge', () => {
  it('enables auto-merge via GraphQL for queue strategy (default)', async () => {
    mockGithubGraphQL
      .mockResolvedValueOnce({
        data: { repository: { pullRequest: { id: 'PR_123' } } },
      })
      .mockResolvedValueOnce({
        data: {
          enablePullRequestAutoMerge: {
            pullRequest: {
              number: 1,
              autoMergeRequest: { mergeMethod: 'SQUASH' },
            },
          },
        },
      });

    const result = await bulkMerge({ items: [{ number: 1 }] });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.succeeded[0]).toMatchObject({
      number: 1,
      strategy: 'queue',
    });
  });

  it('calls REST merge for direct strategy', async () => {
    mockGithubRest.mockResolvedValueOnce({
      sha: 'abc',
      merged: true,
      message: 'merged',
    });

    const result = await bulkMerge({
      items: [{ number: 7, strategy: 'direct' }],
    });

    expect(result.isError).toBeUndefined();
    expect(mockGithubRest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/repos/o/r/pulls/7/merge',
      }),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.succeeded[0]).toMatchObject({
      number: 7,
      strategy: 'direct',
      sha: 'abc',
      merged: true,
    });
  });

  it('reports PR-not-found as a per-item failure', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { repository: { pullRequest: null } },
    });

    const result = await bulkMerge({ items: [{ number: 999 }] });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.failed).toEqual([
      { index: 0, key: 999, error: 'PR #999 not found.' },
    ]);
  });
});

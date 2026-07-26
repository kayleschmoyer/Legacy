import { enableAutoMerge } from './enable-auto-merge';

jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
}));

jest.mock('../pr-utils', () => ({
  resolvePullRequestNodeId: jest.fn(),
}));

const { githubGraphQL: mockGithubGraphQL } = jest.requireMock(
  '../github-api',
) as { githubGraphQL: jest.Mock };
const { resolvePullRequestNodeId: mockResolvePullRequestNodeId } =
  jest.requireMock('../pr-utils') as { resolvePullRequestNodeId: jest.Mock };

beforeEach(() => {
  jest.resetAllMocks();
  mockResolvePullRequestNodeId.mockResolvedValue('PR_123');
});

describe('enableAutoMerge', () => {
  it('enables auto-merge and reports the resolved merge method', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: {
        enablePullRequestAutoMerge: {
          pullRequest: {
            number: 5076,
            autoMergeRequest: { mergeMethod: 'SQUASH' },
          },
        },
      },
    });

    const result = await enableAutoMerge({
      prNumber: 5076,
      mergeMethod: 'SQUASH',
    });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body).toMatchObject({
      success: true,
      prNumber: 5076,
      mergeMethod: 'SQUASH',
    });
  });

  it('reports PR-not-found without calling the mutation', async () => {
    mockResolvePullRequestNodeId.mockResolvedValueOnce(null);

    const result = await enableAutoMerge({
      prNumber: 999,
      mergeMethod: 'SQUASH',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('PR #999 not found.');
    expect(mockGithubGraphQL).not.toHaveBeenCalled();
  });

  it('returns a no-op success when the PR is already enqueued/auto-merge active, instead of crashing on null pullRequest', async () => {
    // Mirrors the LS-7905 repro: enablePullRequestAutoMerge resolves to null
    // (with a GraphQL error attached as `warnings`) when auto-merge was
    // already enabled via a prior github_merge_pr call.
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { enablePullRequestAutoMerge: null },
      warnings: [
        {
          message: 'Pull request Pull request is already queued to merge.',
          type: 'UNPROCESSABLE',
          path: ['enablePullRequestAutoMerge'],
        },
      ],
    });

    const result = await enableAutoMerge({
      prNumber: 5076,
      mergeMethod: 'SQUASH',
    });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(body.prNumber).toBe(5076);
    expect(body.output).toContain('already in the merge queue');
  });

  it('surfaces a clear error (not a raw TypeError) when pullRequest is null for an unrecognized reason', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: { enablePullRequestAutoMerge: null },
      warnings: [
        {
          message: 'Something else went wrong.',
          type: 'FORBIDDEN',
          path: ['enablePullRequestAutoMerge'],
        },
      ],
    });

    const result = await enableAutoMerge({
      prNumber: 5076,
      mergeMethod: 'SQUASH',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Something else went wrong.');
    expect(result.content[0].text).not.toContain('Cannot read properties');
  });
});

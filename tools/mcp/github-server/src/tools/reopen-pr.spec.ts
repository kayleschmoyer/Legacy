import { reopenPR } from './reopen-pr';

jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
}));

jest.mock('../pr-utils', () => ({
  resolvePullRequestNodeId: jest.fn(),
}));

const { githubGraphQL: mockGithubGraphQL } = jest.requireMock<{
  githubGraphQL: jest.Mock;
}>('../github-api');
const { resolvePullRequestNodeId: mockResolvePullRequestNodeId } =
  jest.requireMock<{ resolvePullRequestNodeId: jest.Mock }>('../pr-utils');

interface ParsedReopenResult {
  success?: boolean;
  number?: number;
  message: string;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockResolvePullRequestNodeId.mockResolvedValue('PR_123');
});

describe('reopenPR', () => {
  it('reopens a PR without a comment', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: {
        reopenPullRequest: { pullRequest: { number: 6298, state: 'OPEN' } },
      },
    });

    const result = await reopenPR({ number: 6298 });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text) as ParsedReopenResult;
    expect(body).toMatchObject({
      success: true,
      number: 6298,
      message: 'PR #6298 reopened',
    });
    expect(mockGithubGraphQL).toHaveBeenCalledTimes(1);
  });

  it('reopens a PR and posts a trailing comment', async () => {
    mockGithubGraphQL
      .mockResolvedValueOnce({
        data: {
          reopenPullRequest: { pullRequest: { number: 6298, state: 'OPEN' } },
        },
      })
      .mockResolvedValueOnce({
        data: { addComment: { commentEdge: { node: { id: 'IC_1' } } } },
      });

    const result = await reopenPR({
      number: 6298,
      comment: 'Reopening — CI failure was flaky.',
    });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text) as ParsedReopenResult;
    expect(body.message).toBe('PR #6298 reopened with comment');
    expect(mockGithubGraphQL).toHaveBeenCalledTimes(2);
    expect(mockGithubGraphQL).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('addComment'),
      { subjectId: 'PR_123', body: 'Reopening — CI failure was flaky.' },
    );
  });

  it('reports PR-not-found without calling the mutation', async () => {
    mockResolvePullRequestNodeId.mockResolvedValueOnce(null);

    const result = await reopenPR({ number: 999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('PR #999 not found.');
    expect(mockGithubGraphQL).not.toHaveBeenCalled();
  });

  it('surfaces a clear error on GraphQL failure', async () => {
    mockGithubGraphQL.mockRejectedValueOnce(new Error('boom'));

    const result = await reopenPR({ number: 6298 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Failed to reopen PR #6298: boom');
  });
});

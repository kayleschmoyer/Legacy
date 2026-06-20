import { bulkReplyToReview } from './bulk-reply-to-review';

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

describe('bulkReplyToReview', () => {
  it('handles a mixed batch of GraphQL and REST replies', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: {
        addPullRequestReviewThreadReply: {
          comment: { id: 'C_1', body: 'FIX: abc' },
        },
      },
    });
    mockGithubRest.mockResolvedValueOnce({
      id: 555,
      html_url: 'u555',
      body: 'JUSTIFY: ok',
    });

    const result = await bulkReplyToReview({
      replies: [
        { body: 'FIX: abc', threadId: 'PRRT_1' },
        { body: 'JUSTIFY: ok', commentId: 42, prNumber: 99 },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.success).toBe(true);
    expect(body.succeeded).toHaveLength(2);
  });

  it('captures validation errors per item without aborting', async () => {
    mockGithubGraphQL.mockResolvedValueOnce({
      data: {
        addPullRequestReviewThreadReply: {
          comment: { id: 'C_1', body: 'ok' },
        },
      },
    });

    const result = await bulkReplyToReview({
      replies: [
        { body: 'ok', threadId: 'PRRT_1' },
        { body: 'bad' }, // missing threadId AND commentId+number
      ],
    });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.succeeded).toHaveLength(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].error).toMatch(/threadId|commentId/);
  });
});

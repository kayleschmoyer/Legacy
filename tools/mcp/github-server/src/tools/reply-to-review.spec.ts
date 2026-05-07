import { resolveReplyToReviewInput, replyToReview } from './reply-to-review';

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
) as {
  getRepoOwnerName: jest.Mock;
};

describe('resolveReplyToReviewInput', () => {
  describe('prNumber alias', () => {
    it('accepts prNumber as the PR number when number is absent', () => {
      const result = resolveReplyToReviewInput({
        body: 'JUSTIFY: looks correct',
        commentId: 3175235794,
        prNumber: 3531,
      });
      expect(result).toEqual({
        body: 'JUSTIFY: looks correct',
        commentId: 3175235794,
        number: 3531,
        threadId: undefined,
      });
    });

    it('accepts number as the PR number when prNumber is absent', () => {
      const result = resolveReplyToReviewInput({
        body: 'FIX: abc1234',
        commentId: 100,
        number: 42,
      });
      expect(result).toEqual({
        body: 'FIX: abc1234',
        commentId: 100,
        number: 42,
        threadId: undefined,
      });
    });

    it('returns an error when both number and prNumber are provided', () => {
      const result = resolveReplyToReviewInput({
        body: 'reply',
        commentId: 100,
        number: 42,
        prNumber: 99,
      });
      expect(result).toEqual({
        error:
          'Ambiguous input: both "number" and "prNumber" were provided. Pass only one.',
      });
    });
  });

  describe('threadId conflict detection', () => {
    it('returns an error when threadId is combined with commentId', () => {
      const result = resolveReplyToReviewInput({
        body: 'reply',
        threadId: 'PRRT_kwDOMnECFs5abc',
        commentId: 100,
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('EITHER'),
      });
    });

    it('returns an error when threadId is combined with prNumber', () => {
      const result = resolveReplyToReviewInput({
        body: 'reply',
        threadId: 'PRRT_kwDOMnECFs5abc',
        prNumber: 42,
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('EITHER'),
      });
    });

    it('returns an error when threadId is combined with number', () => {
      const result = resolveReplyToReviewInput({
        body: 'reply',
        threadId: 'PRRT_kwDOMnECFs5abc',
        number: 42,
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('EITHER'),
      });
    });

    it('accepts threadId alone (no commentId or number)', () => {
      const result = resolveReplyToReviewInput({
        body: 'JUSTIFY: not a bug',
        threadId: 'PRRT_kwDOMnECFs5abc',
      });
      expect(result).toEqual({
        body: 'JUSTIFY: not a bug',
        threadId: 'PRRT_kwDOMnECFs5abc',
        commentId: undefined,
        number: undefined,
      });
    });
  });

  describe('missing required params', () => {
    it('returns an error when neither threadId nor commentId+number is provided', () => {
      const result = resolveReplyToReviewInput({ body: 'reply' });
      expect(result).toMatchObject({
        error: expect.stringContaining('threadId'),
      });
    });

    it('returns an error when commentId is provided but no PR number', () => {
      const result = resolveReplyToReviewInput({
        body: 'reply',
        commentId: 100,
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('threadId'),
      });
    });
  });
});

describe('replyToReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('REST path (commentId + number)', () => {
    it('posts a reply to the correct PR and comment', async () => {
      mockGetRepoOwnerName.mockResolvedValue({
        owner: 'bkrupa',
        name: 'legacy-sports',
      });
      mockGithubRest.mockResolvedValue({
        id: 9999,
        html_url:
          'https://github.com/bkrupa/legacy-sports/pull/42#discussion_r9999',
        body: 'JUSTIFY: not a bug',
      });

      const result = await replyToReview({
        body: 'JUSTIFY: not a bug',
        commentId: 3175235794,
        number: 42,
      });

      expect(mockGithubRest).toHaveBeenCalledWith({
        method: 'POST',
        path: '/repos/bkrupa/legacy-sports/pulls/42/comments',
        body: { body: 'JUSTIFY: not a bug', in_reply_to: 3175235794 },
      });
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(
        (result.content[0] as { type: string; text: string }).text,
      );
      expect(data.success).toBe(true);
      expect(data.commentDatabaseId).toBe(9999);
    });

    it('returns isError when the REST call fails', async () => {
      mockGetRepoOwnerName.mockResolvedValue({
        owner: 'bkrupa',
        name: 'legacy-sports',
      });
      mockGithubRest.mockRejectedValue(new Error('Not Found'));

      const result = await replyToReview({
        body: 'reply',
        commentId: 100,
        number: 42,
      });

      expect(result.isError).toBe(true);
      expect(
        (result.content[0] as { type: string; text: string }).text,
      ).toContain('Not Found');
    });
  });

  describe('GraphQL path (threadId)', () => {
    it('posts a reply via the GraphQL mutation', async () => {
      mockGithubGraphQL.mockResolvedValue({
        data: {
          addPullRequestReviewThreadReply: {
            comment: { id: 'RC_node_abc', body: 'FIX: abc1234' },
          },
        },
      });

      const result = await replyToReview({
        body: 'FIX: abc1234',
        threadId: 'PRRT_kwDOMnECFs5abc',
      });

      expect(mockGithubGraphQL).toHaveBeenCalledWith(
        expect.stringContaining('addPullRequestReviewThreadReply'),
        { threadId: 'PRRT_kwDOMnECFs5abc', body: 'FIX: abc1234' },
      );
      expect(result.isError).toBeFalsy();
      const data = JSON.parse(
        (result.content[0] as { type: string; text: string }).text,
      );
      expect(data.threadId).toBe('PRRT_kwDOMnECFs5abc');
      expect(data.commentNodeId).toBe('RC_node_abc');
    });

    it('returns isError when the GraphQL call fails', async () => {
      mockGithubGraphQL.mockRejectedValue(new Error('GraphQL error'));

      const result = await replyToReview({
        body: 'reply',
        threadId: 'PRRT_kwDOMnECFs5abc',
      });

      expect(result.isError).toBe(true);
      expect(
        (result.content[0] as { type: string; text: string }).text,
      ).toContain('GraphQL error');
    });
  });
});

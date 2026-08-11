import { addComment } from './add-comment';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

describe('addComment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts a comment and returns success with commentId', async () => {
    mockJiraRequest.mockResolvedValueOnce({
      id: '99001',
      created: '2026-06-28T12:00:00.000+0000',
    });

    const result = await addComment({
      key: 'LS-123',
      body: 'Implementation Notes\n\nApproach: fixed the bug.',
    });

    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/rest/api/3/issue/LS-123/comment',
      body: {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Implementation Notes\n\nApproach: fixed the bug.',
                },
              ],
            },
          ],
        },
      },
    });

    const data = parse(result);
    expect(data.key).toBe('LS-123');
    expect(data.commentId).toBe('99001');
    expect(data.created).toBe('2026-06-28T12:00:00.000+0000');
  });

  it('returns isError on API failure', async () => {
    mockJiraRequest.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await addComment({ key: 'LS-456', body: 'some comment' });

    expect(result.isError).toBe(true);
    const data = parse(result);
    expect(data.success).toBe(false);
    expect(data.error as string).toContain('Network timeout');
  });
});

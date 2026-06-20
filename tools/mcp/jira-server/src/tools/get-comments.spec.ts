import { getComments } from './get-comments';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../adf', () => ({
  extractAdfText: jest.fn((body: unknown) => String(body)),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

function text(result: { content: Array<{ type: string }> }): string {
  const block = result.content[0] as { type: string; text: string };
  return block.text;
}

describe('getComments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders comments as a Markdown table, flattening body newlines', async () => {
    mockJiraRequest.mockResolvedValueOnce({
      total: 2,
      startAt: 0,
      maxResults: 50,
      comments: [
        {
          id: '1',
          author: { displayName: 'Brad Krupa' },
          body: 'First line\nSecond line',
          created: '2026-06-01T00:00:00.000-0400',
          updated: '2026-06-01T00:00:00.000-0400',
        },
        {
          id: '2',
          author: { displayName: 'Claude' },
          body: 'A | piped value',
          created: '2026-06-02T00:00:00.000-0400',
          updated: '2026-06-02T00:00:00.000-0400',
        },
      ],
    });

    const out = text(await getComments({ key: 'LS-1' }));

    expect(out).toContain('id|author|created|body');
    // `updated` is pruned; newlines flattened to spaces; pipes escaped.
    expect(out).not.toContain('updated');
    expect(out).toContain(
      '1|Brad Krupa|2026-06-01T00:00:00.000-0400|First line Second line',
    );
    expect(out).toContain('A \\| piped value');
    expect(out).not.toContain('  "');
  });

  it('emits an explicit signal when there are no comments', async () => {
    mockJiraRequest.mockResolvedValueOnce({
      total: 0,
      startAt: 0,
      maxResults: 50,
      comments: [],
    });

    const out = text(await getComments({ key: 'LS-1' }));

    expect(out).toBe('No comments on LS-1.');
  });

  it('surfaces errors', async () => {
    mockJiraRequest.mockRejectedValueOnce(new Error('boom'));

    const result = await getComments({ key: 'LS-1' });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Failed to fetch comments');
  });
});

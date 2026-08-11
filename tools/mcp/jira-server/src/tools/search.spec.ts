import { search } from './search';

jest.mock('../jql-search', () => ({
  searchJql: jest.fn(),
}));

const { searchJql: mockSearchJql } = jest.requireMock<{
  searchJql: jest.Mock;
}>('../jql-search');

function text(result: { content: Array<{ type: string }> }): string {
  const block = result.content[0] as { type: string; text: string };
  return block.text;
}

const issues = [
  {
    key: 'LS-9000',
    fields: {
      summary: 'First issue',
      status: { name: 'In Progress' },
      issuetype: { name: 'Task' },
      assignee: { displayName: 'Brad Krupa' },
      priority: { name: 'Medium' },
    },
  },
  {
    key: 'LS-9001',
    fields: {
      summary: 'Second issue',
      status: { name: 'To Do' },
      issuetype: { name: 'Bug' },
      assignee: null,
      priority: null,
    },
  },
];

describe('search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders results as a Markdown table with the full column set', async () => {
    mockSearchJql.mockResolvedValueOnce({ issues });

    const out = text(await search({ jql: 'project = LS' }));

    // Header row written once, then a separator, then one row per issue.
    expect(out).toContain('key|summary|status|type|assignee|priority');
    expect(out).toContain('---|---|---|---|---|---');
    expect(out).toContain(
      'LS-9000|First issue|In Progress|Task|Brad Krupa|Medium',
    );
    // Nullish assignee/priority render as empty cells.
    expect(out).toContain('LS-9001|Second issue|To Do|Bug||');
    // No pretty-printed JSON indentation.
    expect(out).not.toContain('  "');
  });

  it('compact mode renders the compact column set only', async () => {
    mockSearchJql.mockResolvedValueOnce({ issues });

    const out = text(await search({ jql: 'project = LS', compact: true }));

    expect(out).toContain('key|summary|status');
    expect(out).not.toContain('priority');
    expect(out).toContain('LS-9000|First issue|In Progress');
  });

  it('appends a pageToken hint when more results exist', async () => {
    mockSearchJql.mockResolvedValueOnce({ issues, nextPageToken: 'CURSOR123' });

    const out = text(await search({ jql: 'project = LS' }));

    expect(out).toContain('pageToken: CURSOR123');
  });

  it('emits an explicit signal for an empty result set', async () => {
    mockSearchJql.mockResolvedValueOnce({ issues: [] });

    const out = text(await search({ jql: 'project = NONE' }));

    expect(out).toBe('No issues match this query.');
  });

  it('surfaces errors', async () => {
    mockSearchJql.mockRejectedValueOnce(new Error('boom'));

    const result = await search({ jql: 'bad jql' });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Jira search failed: boom');
  });

  it('honors a custom fields list, restricting both the request and the rendered columns', async () => {
    mockSearchJql.mockResolvedValueOnce({
      issues: [
        { key: 'LS-9000', fields: { summary: 'First issue' } },
        { key: 'LS-9001', fields: { summary: 'Second issue' } },
      ],
    });

    const out = text(
      await search({ jql: 'project = LS', fields: ['summary'] }),
    );

    expect(mockSearchJql).toHaveBeenCalledWith(
      expect.objectContaining({ fields: ['summary'] }),
    );
    expect(out).toContain('key|summary');
    expect(out).not.toContain('status');
    expect(out).toContain('LS-9000|First issue');
    expect(out).toContain('LS-9001|Second issue');
  });

  it('flattens nested { name } / { displayName } shapes for custom fields', async () => {
    mockSearchJql.mockResolvedValueOnce({
      issues: [
        {
          key: 'LS-9000',
          fields: {
            status: { name: 'In Progress' },
            assignee: { displayName: 'Brad Krupa' },
          },
        },
      ],
    });

    const out = text(
      await search({
        jql: 'project = LS',
        fields: ['status', 'assignee'],
      }),
    );

    expect(out).toContain('key|status|assignee');
    expect(out).toContain('LS-9000|In Progress|Brad Krupa');
  });

  it('an empty custom fields array falls back to the default column set', async () => {
    mockSearchJql.mockResolvedValueOnce({ issues });

    const out = text(await search({ jql: 'project = LS', fields: [] }));

    expect(mockSearchJql).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: ['summary', 'status', 'issuetype', 'assignee', 'priority'],
      }),
    );
    expect(out).toContain('key|summary|status|type|assignee|priority');
  });
});

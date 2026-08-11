import { listChildren } from './list-children';

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

interface PaginatedChildrenPayload {
  parent: string;
  total: number;
  truncated?: boolean;
  children: Array<{ key: string; summary: string; status: string }>;
}

const children = [
  {
    key: 'LS-100',
    fields: {
      summary: 'Child one',
      status: { name: 'To Do' },
      issuetype: { name: 'Task' },
      priority: { name: 'High' },
      created: '2026-06-01T00:00:00.000-0400',
    },
  },
  {
    key: 'LS-101',
    fields: {
      summary: 'Child two',
      status: { name: 'Done' },
      issuetype: { name: 'Bug' },
      priority: null,
      created: '2026-06-02T00:00:00.000-0400',
    },
  },
];

describe('listChildren', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders children as a Markdown table', async () => {
    mockSearchJql.mockResolvedValueOnce({ issues: children });

    const out = text(await listChildren({ key: 'LS-1' }));

    expect(out).toContain('key|summary|status|type|priority|created');
    expect(out).toContain(
      'LS-100|Child one|To Do|Task|High|2026-06-01T00:00:00.000-0400',
    );
    expect(out).toContain(
      'LS-101|Child two|Done|Bug||2026-06-02T00:00:00.000-0400',
    );
    expect(out).not.toContain('  "');
  });

  it('appends a pageToken hint when more results exist', async () => {
    mockSearchJql.mockResolvedValueOnce({
      issues: children,
      nextPageToken: 'NEXT',
    });

    const out = text(await listChildren({ key: 'LS-1' }));

    expect(out).toContain('pageToken: NEXT');
  });

  it('emits an explicit signal when there are no children', async () => {
    mockSearchJql.mockResolvedValueOnce({ issues: [] });

    const out = text(await listChildren({ key: 'LS-1' }));

    expect(out).toBe('No children found for LS-1.');
  });

  it('rejects malformed keys before calling the API', async () => {
    const result = await listChildren({ key: 'bad-key' });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Invalid Jira issue key');
    expect(mockSearchJql).not.toHaveBeenCalled();
  });

  describe('paginate: true', () => {
    it('fetches all pages and returns compact JSON', async () => {
      mockSearchJql
        .mockResolvedValueOnce({ issues: children, nextPageToken: 'PAGE2' })
        .mockResolvedValueOnce({ issues: [children[0]] });

      const result = await listChildren({ key: 'LS-1', paginate: true });
      const payload = JSON.parse(text(result)) as PaginatedChildrenPayload;

      expect(payload.parent).toBe('LS-1');
      expect(payload.total).toBe(3);
      expect(payload.children).toHaveLength(3);
      expect(payload.children[0]).toEqual({
        key: 'LS-100',
        summary: 'Child one',
        status: 'To Do',
      });
      expect(payload.truncated).toBeUndefined();
      expect(mockSearchJql).toHaveBeenCalledTimes(2);
    });

    it('stops at 500-item cap and sets truncated: true', async () => {
      const bigPage = Array.from({ length: 100 }, (_, i) => ({
        key: `LS-${200 + i}`,
        fields: {
          summary: `Child ${i}`,
          status: { name: 'To Do' },
          issuetype: { name: 'Task' },
          priority: null,
          created: '2026-06-01T00:00:00.000-0400',
        },
      }));

      // 6 pages of 100 = 600 items, should cap at 500
      mockSearchJql.mockResolvedValue({
        issues: bigPage,
        nextPageToken: 'NEXT',
      });

      const result = await listChildren({ key: 'LS-1', paginate: true });
      const payload = JSON.parse(text(result)) as PaginatedChildrenPayload;

      expect(payload.total).toBe(500);
      expect(payload.children).toHaveLength(500);
      expect(payload.truncated).toBe(true);
      // Should have stopped after 5 pages (500 items)
      expect(mockSearchJql).toHaveBeenCalledTimes(5);
    });

    it('includes status filter in JQL when status is provided', async () => {
      mockSearchJql.mockResolvedValueOnce({ issues: children });

      await listChildren({ key: 'LS-1', paginate: true, status: 'To Do' });

      expect(mockSearchJql).toHaveBeenCalledWith(
        expect.objectContaining({
          jql: expect.stringContaining('"To Do"') as string,
        }),
      );
    });
  });
});

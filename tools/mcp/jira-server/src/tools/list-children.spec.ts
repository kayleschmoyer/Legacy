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

  describe('compact: true', () => {
    it('renders only key/summary/status/type and requests fewer fields', async () => {
      mockSearchJql.mockResolvedValueOnce({ issues: children });

      const out = text(await listChildren({ key: 'LS-1', compact: true }));

      expect(mockSearchJql).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: ['summary', 'status', 'issuetype'],
        }),
      );
      expect(out).toContain('key|summary|status|type');
      expect(out).toContain('LS-100|Child one|To Do|Task');
      expect(out).toContain('LS-101|Child two|Done|Bug');
      expect(out).not.toContain('priority');
      expect(out).not.toContain('created');
      expect(out).not.toContain('High');
    });

    it('combines with includeBlockers', async () => {
      mockSearchJql.mockResolvedValueOnce({ issues: children });

      const out = text(
        await listChildren({
          key: 'LS-1',
          compact: true,
          includeBlockers: true,
        }),
      );

      expect(out).toContain('key|summary|status|type|blocked|blockers');
    });

    it('is off by default — full columns returned', async () => {
      mockSearchJql.mockResolvedValueOnce({ issues: children });

      const out = text(await listChildren({ key: 'LS-1' }));

      expect(out).toContain('key|summary|status|type|priority|created');
    });
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

    it('stops at the 500-item hard cap and sets truncated: true', async () => {
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

      // 6 pages of 100 = 600 items, should cap at the hard 500 ceiling even
      // though limit (1000) is higher.
      mockSearchJql.mockResolvedValue({
        issues: bigPage,
        nextPageToken: 'NEXT',
      });

      const result = await listChildren({
        key: 'LS-1',
        paginate: true,
        limit: 1000,
      });
      const payload = JSON.parse(text(result)) as PaginatedChildrenPayload;

      expect(payload.total).toBe(500);
      expect(payload.children).toHaveLength(500);
      expect(payload.truncated).toBe(true);
      // Should have stopped after 5 pages (500 items)
      expect(mockSearchJql).toHaveBeenCalledTimes(5);
    });

    it('bounds the total to `limit` (not just the 500 hard cap)', async () => {
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

      mockSearchJql.mockResolvedValue({
        issues: bigPage,
        nextPageToken: 'NEXT',
      });

      const result = await listChildren({
        key: 'LS-1',
        paginate: true,
        limit: 30,
      });
      const payload = JSON.parse(text(result)) as PaginatedChildrenPayload;

      expect(payload.total).toBe(30);
      expect(payload.children).toHaveLength(30);
      expect(payload.truncated).toBe(true);
      // Only needed 1 page (100 items) to reach the 30-item limit.
      expect(mockSearchJql).toHaveBeenCalledTimes(1);
    });

    it('defaults the paginate total cap to 25 when limit is omitted', async () => {
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

      mockSearchJql.mockResolvedValue({
        issues: bigPage,
        nextPageToken: 'NEXT',
      });

      const result = await listChildren({ key: 'LS-1', paginate: true });
      const payload = JSON.parse(text(result)) as PaginatedChildrenPayload;

      expect(payload.total).toBe(25);
      expect(payload.truncated).toBe(true);
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
  describe('includeBlockers', () => {
    const blockedBy = (key: string, status: string) => ({
      type: { name: 'Blocks', inward: 'is blocked by' },
      inwardIssue: { key, fields: { status: { name: status } } },
    });

    it('adds blocker columns without spending a second Jira request', async () => {
      mockSearchJql.mockResolvedValueOnce({
        issues: [
          {
            ...children[0],
            fields: {
              ...children[0].fields,
              issuelinks: [blockedBy('LS-8000', 'To Do')],
            },
          },
          {
            ...children[1],
            fields: { ...children[1].fields, issuelinks: [] },
          },
        ],
      });

      const out = text(
        await listChildren({ key: 'LS-1', includeBlockers: true }),
      );

      expect(mockSearchJql).toHaveBeenCalledTimes(1);
      expect(mockSearchJql).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            'summary',
            'status',
            'issuetype',
            'priority',
            'created',
            'issuelinks',
          ],
        }),
      );
      expect(out).toContain(
        'key|summary|status|type|priority|created|blocked|blockers',
      );
      expect(out).toContain('|yes|LS-8000(To Do)');
    });

    it('annotates blocked / blockers[] in paginate mode', async () => {
      mockSearchJql.mockResolvedValueOnce({
        issues: [
          {
            key: 'LS-100',
            fields: {
              summary: 'Child one',
              status: { name: 'To Do' },
              issuelinks: [blockedBy('LS-8000', 'To Do')],
            },
          },
          {
            key: 'LS-101',
            fields: {
              summary: 'Child two',
              status: { name: 'To Do' },
              issuelinks: [blockedBy('LS-8001', 'Done')],
            },
          },
        ],
      });

      const payload = JSON.parse(
        text(
          await listChildren({
            key: 'LS-1',
            paginate: true,
            includeBlockers: true,
          }),
        ),
      ) as {
        children: Array<{
          key: string;
          blocked: boolean;
          blockers: Array<{ key: string; status: string }>;
        }>;
      };

      expect(payload.children[0]).toEqual(
        expect.objectContaining({
          key: 'LS-100',
          blocked: true,
          blockers: [{ key: 'LS-8000', status: 'To Do' }],
        }),
      );
      expect(payload.children[1]).toEqual(
        expect.objectContaining({
          key: 'LS-101',
          blocked: false,
          blockers: [],
        }),
      );
    });

    it('is off by default — no issuelinks requested, no extra columns', async () => {
      mockSearchJql.mockResolvedValueOnce({ issues: children });

      const out = text(await listChildren({ key: 'LS-1' }));

      expect(mockSearchJql).toHaveBeenCalledWith(
        expect.not.objectContaining({
          fields: expect.arrayContaining(['issuelinks']) as string[],
        }),
      );
      expect(out).not.toContain('blocked');
    });
  });
});

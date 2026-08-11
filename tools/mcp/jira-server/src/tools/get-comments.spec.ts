import { getComments } from './get-comments';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../adf', () => ({
  extractAdfText: jest.fn((body: unknown) => String(body)),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

function text(result: { content: Array<{ type: string }> }): string {
  const block = result.content[0] as { type: string; text: string };
  return block.text;
}

function parseJson(result: { content: Array<{ type: string }> }) {
  return JSON.parse(text(result)) as Record<string, unknown>;
}

function makePage(
  ids: string[],
  total: number,
  body: (id: string) => string = (id) => `body of ${id}`,
): {
  comments: Array<{
    id: string;
    author: { displayName: string };
    body: string;
    created: string;
    updated: string;
  }>;
  total: number;
  startAt: number;
  maxResults: number;
} {
  return {
    comments: ids.map((id) => ({
      id,
      author: { displayName: 'Alice' },
      body: body(id),
      created: '2026-06-01T00:00:00.000-0400',
      updated: '2026-06-01T00:00:00.000-0400',
    })),
    total,
    startAt: 0,
    maxResults: 50,
  };
}

describe('getComments', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('single-key path (markdown table)', () => {
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

  describe('batch path (`keys`)', () => {
    it('returns per-key comment arrays in one call', async () => {
      mockJiraRequest
        .mockResolvedValueOnce(makePage(['a1'], 1))
        .mockResolvedValueOnce(makePage(['b1', 'b2'], 2));

      const result = await getComments({ keys: ['LS-1', 'LS-2'] });

      const data = parseJson(result) as {
        comments: Record<
          string,
          Array<{ id: string; author: string; body: string }>
        >;
        missing: string[];
      };
      expect(Object.keys(data.comments).sort()).toEqual(['LS-1', 'LS-2']);
      expect(data.comments['LS-1']?.map((c) => c.id)).toEqual(['a1']);
      expect(data.comments['LS-2']?.map((c) => c.id)).toEqual(['b1', 'b2']);
      // Per-key entries use the same pruned column set as the single-key
      // markdown path: id/author/created/body, no `updated`.
      const first = data.comments['LS-1']?.[0];
      expect(first).toEqual(
        expect.objectContaining({
          id: 'a1',
          author: 'Alice',
          body: 'body of a1',
        }),
      );
      expect(first).not.toHaveProperty('updated');
      expect(data.missing).toEqual([]);
    });

    it('isolates partial failures into missing[] while returning the rest', async () => {
      mockJiraRequest
        .mockResolvedValueOnce(makePage(['ok1'], 1))
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce(makePage(['ok2'], 1));

      const result = await getComments({
        keys: ['LS-1', 'LS-MISSING', 'LS-3'],
      });

      const data = parseJson(result) as {
        comments: Record<string, Array<{ id: string }>>;
        missing: string[];
      };
      expect(Object.keys(data.comments).sort()).toEqual(['LS-1', 'LS-3']);
      expect(data.comments['LS-1']?.map((c) => c.id)).toEqual(['ok1']);
      expect(data.comments['LS-3']?.map((c) => c.id)).toEqual(['ok2']);
      expect(data.missing).toEqual(['LS-MISSING']);
      // Per the MCP partial-failure rule: isError MUST be true when any key
      // fails so agents that only check the top-level flag don't silently drop
      // the partial failure.
      expect(result.isError).toBe(true);
    });

    it('does not set isError when every key succeeds', async () => {
      mockJiraRequest
        .mockResolvedValueOnce(makePage(['a1'], 1))
        .mockResolvedValueOnce(makePage(['b1'], 1));

      const result = await getComments({ keys: ['LS-1', 'LS-2'] });

      expect(result.isError).toBeFalsy();
    });

    it('rejects oversize batches with a validation error', async () => {
      const keys = Array.from({ length: 51 }, (_, i) => `LS-${i + 1}`);

      const result = await getComments({ keys });

      expect(result.isError).toBe(true);
      expect(text(result)).toContain('1 and 50');
      expect(mockJiraRequest).not.toHaveBeenCalled();
    });

    it('rejects empty batches with a validation error', async () => {
      const result = await getComments({ keys: [] });

      expect(result.isError).toBe(true);
      expect(mockJiraRequest).not.toHaveBeenCalled();
    });

    it('rejects when both key and keys are provided', async () => {
      const result = await getComments({ key: 'LS-1', keys: ['LS-2'] });

      expect(result.isError).toBe(true);
      expect(text(result)).toContain('not both');
      expect(mockJiraRequest).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('rejects when neither key nor keys is provided', async () => {
      const result = await getComments({});

      expect(result.isError).toBe(true);
      expect(mockJiraRequest).not.toHaveBeenCalled();
    });
  });
});

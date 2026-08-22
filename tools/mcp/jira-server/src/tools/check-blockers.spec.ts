import { checkBlockers } from './check-blockers';

jest.mock('../jql-search', () => ({
  searchJqlAll: jest.fn(),
}));

const { searchJqlAll: mockSearchJqlAll } = jest.requireMock<{
  searchJqlAll: jest.Mock;
}>('../jql-search');

function text(result: { content: Array<{ type: string }> }): string {
  return (result.content[0] as { text: string }).text;
}

function json(result: { content: Array<{ type: string }> }): unknown {
  return JSON.parse(text(result));
}

function issue(key: string, blockers: Array<[string, string]> = []) {
  return {
    key,
    fields: {
      issuelinks: blockers.map(([blockerKey, status]) => ({
        type: { name: 'Blocks', inward: 'is blocked by' },
        inwardIssue: { key: blockerKey, fields: { status: { name: status } } },
      })),
    },
  };
}

describe('checkBlockers', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('single key (legacy shape)', () => {
    it('returns the flat verdict, unwrapped', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([issue('LS-1')]);

      expect(json(await checkBlockers({ key: 'LS-1' }))).toEqual({
        canProceed: true,
        blockers: [],
        recommendation: 'base off main',
      });
    });

    it('reports the blocker branch when one blocker is In Review', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        issue('LS-1', [['LS-2', 'In Review']]),
      ]);

      expect(json(await checkBlockers({ key: 'LS-1' }))).toEqual({
        canProceed: true,
        blockers: [
          {
            key: 'LS-2',
            status: 'In Review',
            reason: 'In Review — use its branch as parent',
          },
        ],
        recommendation: 'base off LS-2 branch',
      });
    });

    it('errors when the key does not exist', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([]);

      const result = await checkBlockers({ key: 'LS-404' });

      expect(result.isError).toBe(true);
      expect(text(result)).toContain('LS-404');
    });
  });

  describe('batch', () => {
    it('resolves every key in a single JQL round-trip', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        issue('LS-1'),
        issue('LS-2', [['LS-9', 'In Progress']]),
        issue('LS-3', [['LS-8', 'Done']]),
      ]);

      const result = json(
        await checkBlockers({ keys: ['LS-1', 'LS-2', 'LS-3'] }),
      ) as {
        total: number;
        unblocked: string[];
        blocked: string[];
        results: Array<{ key: string; recommendation: string }>;
      };

      expect(mockSearchJqlAll).toHaveBeenCalledTimes(1);
      expect(mockSearchJqlAll).toHaveBeenCalledWith({
        jql: 'key IN (LS-1, LS-2, LS-3)',
        fields: ['issuelinks'],
      });
      expect(result.total).toBe(3);
      expect(result.unblocked).toEqual(['LS-1', 'LS-3']);
      expect(result.blocked).toEqual(['LS-2']);
      expect(result.results.map((r) => r.key)).toEqual([
        'LS-1',
        'LS-2',
        'LS-3',
      ]);
      expect(result.results[1].recommendation).toContain(
        'STOP — blocker(s) not ready: LS-9 (In Progress)',
      );
    });

    it('reports keys Jira did not return under notFound', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([issue('LS-1')]);

      const result = json(
        await checkBlockers({ keys: ['LS-1', 'LS-404'] }),
      ) as {
        total: number;
        notFound: string[];
      };

      expect(result.total).toBe(1);
      expect(result.notFound).toEqual(['LS-404']);
    });

    it('accepts a comma-separated key string as a batch', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([issue('LS-1'), issue('LS-2')]);

      const result = json(await checkBlockers({ key: 'LS-1, LS-2' })) as {
        total: number;
      };

      expect(result.total).toBe(2);
    });

    it('de-duplicates repeated keys', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([issue('LS-1')]);

      await checkBlockers({ keys: ['LS-1', 'LS-1'] });

      expect(mockSearchJqlAll).toHaveBeenCalledWith({
        jql: 'key IN (LS-1)',
        fields: ['issuelinks'],
      });
    });
  });

  describe('validation', () => {
    it('rejects a malformed key without calling Jira', async () => {
      const result = await checkBlockers({ keys: ['LS-1', 'not-a-key'] });

      expect(result.isError).toBe(true);
      expect(text(result)).toContain('not-a-key');
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
    });

    it('rejects an empty request', async () => {
      const result = await checkBlockers({});

      expect(result.isError).toBe(true);
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
    });

    it('rejects more than 50 keys', async () => {
      const keys = Array.from({ length: 51 }, (_, i) => `LS-${i + 1}`);

      const result = await checkBlockers({ keys });

      expect(result.isError).toBe(true);
      expect(text(result)).toContain('51');
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
    });
  });

  it('surfaces a Jira failure as a tool error', async () => {
    mockSearchJqlAll.mockRejectedValueOnce(new Error('502 Bad Gateway'));

    const result = await checkBlockers({ key: 'LS-1' });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('502 Bad Gateway');
  });
});

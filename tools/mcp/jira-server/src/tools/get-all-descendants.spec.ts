import { getAllDescendants } from './get-all-descendants';

jest.mock('../jql-search', () => ({
  searchJqlAll: jest.fn(),
}));

const { searchJqlAll: mockSearchJqlAll } = jest.requireMock(
  '../jql-search',
) as {
  searchJqlAll: jest.Mock;
};

function parse(result: { content: ReadonlyArray<unknown> }) {
  const block = result.content[0] as { text: string };
  return JSON.parse(block.text) as {
    root: string;
    total: number;
    descendants: Array<{
      key: string;
      summary: string;
      status: string;
      type: string;
      priority: string;
      blocked: boolean;
      blockers: Array<{ key: string; status: string }>;
    }>;
    skipped: { byStatus: number; byBlockers: number };
    errors?: Array<{ key: string; error: string }>;
  };
}

function makeIssue(
  key: string,
  type: string,
  status = 'To Do',
  issuelinks: unknown[] = [],
) {
  return {
    key,
    fields: {
      summary: `${key} summary`,
      status: { name: status },
      issuetype: { name: type },
      priority: { name: 'Medium' },
      issuelinks,
    },
  };
}

function blockedByLink(blockerKey: string, blockerStatus: string) {
  return {
    type: { name: 'Blocks', inward: 'is blocked by' },
    inwardIssue: {
      key: blockerKey,
      fields: { status: { name: blockerStatus } },
    },
  };
}

beforeEach(() => jest.clearAllMocks());

describe('getAllDescendants', () => {
  describe('basic traversal', () => {
    it('returns leaf-typed direct children', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task'),
        makeIssue('LS-11', 'Bug', 'To Do'),
      ]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.root).toBe('LS-1');
      expect(out.total).toBe(2);
      expect(out.descendants.map((d) => d.key)).toEqual(['LS-10', 'LS-11']);
    });

    it('recurses into container-typed children', async () => {
      // LS-1 → LS-Epic (Epic) → LS-10 (Task)
      mockSearchJqlAll
        .mockResolvedValueOnce([makeIssue('LS-Epic', 'Epic')])
        .mockResolvedValueOnce([makeIssue('LS-10', 'Task')]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(mockSearchJqlAll).toHaveBeenCalledTimes(2);
      expect(out.total).toBe(1);
      expect(out.descendants[0].key).toBe('LS-10');
    });

    it('recurses through Story containers too', async () => {
      // LS-1 → LS-Story (Story) → LS-10 (Task)
      mockSearchJqlAll
        .mockResolvedValueOnce([makeIssue('LS-Story', 'Story')])
        .mockResolvedValueOnce([makeIssue('LS-10', 'Task')]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.total).toBe(1);
      expect(out.descendants[0].key).toBe('LS-10');
    });

    it('traverses multiple levels deep', async () => {
      // LS-1 → LS-Epic → LS-Story → LS-10 (Task)
      mockSearchJqlAll
        .mockResolvedValueOnce([makeIssue('LS-Epic', 'Epic')])
        .mockResolvedValueOnce([makeIssue('LS-Story', 'Story')])
        .mockResolvedValueOnce([makeIssue('LS-10', 'Task')]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(mockSearchJqlAll).toHaveBeenCalledTimes(3);
      expect(out.total).toBe(1);
      expect(out.descendants[0].key).toBe('LS-10');
    });

    it('returns empty result when there are no leaf descendants', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.total).toBe(0);
      expect(out.descendants).toEqual([]);
    });

    it('deduplicates keys referenced under multiple parents', async () => {
      // Both LS-A and LS-B claim LS-10 as a child
      mockSearchJqlAll
        .mockResolvedValueOnce([
          makeIssue('LS-A', 'Story'),
          makeIssue('LS-B', 'Story'),
        ])
        .mockResolvedValueOnce([makeIssue('LS-10', 'Task')]) // LS-A children
        .mockResolvedValueOnce([makeIssue('LS-10', 'Task')]); // LS-B children (duplicate)

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.total).toBe(1);
      expect(out.descendants[0].key).toBe('LS-10');
    });
  });

  describe('status filter', () => {
    it('includes all statuses when status is omitted', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do'),
        makeIssue('LS-11', 'Task', 'Done'),
        makeIssue('LS-12', 'Task', 'In Progress'),
      ]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.total).toBe(3);
      expect(out.skipped.byStatus).toBe(0);
    });

    it('filters leaf tickets by the provided status', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do'),
        makeIssue('LS-11', 'Task', 'Done'),
        makeIssue('LS-12', 'Task', 'To Do'),
      ]);

      const out = parse(
        await getAllDescendants({ key: 'LS-1', status: 'To Do' }),
      );

      expect(out.total).toBe(2);
      expect(out.skipped.byStatus).toBe(1);
      expect(out.descendants.map((d) => d.key)).toEqual(['LS-10', 'LS-12']);
    });
  });

  describe('blocker annotation', () => {
    it('marks a ticket as unblocked when it has no issue links', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([makeIssue('LS-10', 'Task')]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.descendants[0].blocked).toBe(false);
      expect(out.descendants[0].blockers).toEqual([]);
    });

    it('marks a ticket as blocked when a blocker is not Done/In Review', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do', [
          blockedByLink('LS-9', 'In Progress'),
        ]),
      ]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.descendants[0].blocked).toBe(true);
      expect(out.descendants[0].blockers).toEqual([
        { key: 'LS-9', status: 'In Progress' },
      ]);
    });

    it('treats a Done blocker as resolved (unblocked)', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do', [blockedByLink('LS-9', 'Done')]),
      ]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.descendants[0].blocked).toBe(false);
      expect(out.descendants[0].blockers).toEqual([]);
    });

    it('treats an In Review blocker as resolved (unblocked)', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do', [
          blockedByLink('LS-9', 'In Review'),
        ]),
      ]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.descendants[0].blocked).toBe(false);
    });

    it('ignores outward "blocks" links — only inward "is blocked by" matters', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do', [
          {
            type: {
              name: 'Blocks',
              inward: 'is blocked by',
              outward: 'blocks',
            },
            outwardIssue: {
              key: 'LS-99',
              fields: { status: { name: 'To Do' } },
            },
          },
        ]),
      ]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.descendants[0].blocked).toBe(false);
    });
  });

  describe('unblockedOnly', () => {
    it('excludes blocked tickets when unblockedOnly is true', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do', [
          blockedByLink('LS-9', 'In Progress'),
        ]),
        makeIssue('LS-11', 'Task', 'To Do'),
      ]);

      const out = parse(
        await getAllDescendants({ key: 'LS-1', unblockedOnly: true }),
      );

      expect(out.total).toBe(1);
      expect(out.descendants[0].key).toBe('LS-11');
      expect(out.skipped.byBlockers).toBe(1);
    });

    it('includes blocked tickets when unblockedOnly is false (default)', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([
        makeIssue('LS-10', 'Task', 'To Do', [
          blockedByLink('LS-9', 'In Progress'),
        ]),
      ]);

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.total).toBe(1);
      expect(out.descendants[0].blocked).toBe(true);
      expect(out.skipped.byBlockers).toBe(0);
    });
  });

  describe('maxDepth', () => {
    it('stops recursion at maxDepth', async () => {
      // Depth 0: root → LS-Story (container) — this IS fetched
      // Depth 1: LS-Story children — NOT fetched because maxDepth=1 stops the loop
      mockSearchJqlAll.mockResolvedValueOnce([makeIssue('LS-Story', 'Story')]);

      const out = parse(await getAllDescendants({ key: 'LS-1', maxDepth: 1 }));

      expect(out.total).toBe(0);
      expect(mockSearchJqlAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('rejects malformed keys before any API calls', async () => {
      const result = await getAllDescendants({ key: 'bad-key' });

      expect(result.isError).toBe(true);
      const block = result.content[0] as { text: string };
      expect(JSON.parse(block.text).error).toContain('Invalid Jira issue key');
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
    });

    it('skips a failing container and reports the error without failing the whole call', async () => {
      mockSearchJqlAll
        .mockResolvedValueOnce([
          makeIssue('LS-Bad', 'Story'),
          makeIssue('LS-Good', 'Story'),
        ])
        .mockRejectedValueOnce(new Error('timeout')) // LS-Bad children
        .mockResolvedValueOnce([makeIssue('LS-10', 'Task')]); // LS-Good children

      const out = parse(await getAllDescendants({ key: 'LS-1' }));

      expect(out.total).toBe(1);
      expect(out.descendants[0].key).toBe('LS-10');
      expect(out.errors).toEqual([{ key: 'LS-Bad', error: 'timeout' }]);
    });
  });
});

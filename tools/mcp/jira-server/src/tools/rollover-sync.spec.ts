import { rolloverSync } from './rollover-sync';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../jql-search', () => ({
  searchJql: jest.fn(),
  searchJqlAll: jest.fn(),
}));

jest.mock('./bucket-epic', () => ({
  readBucketEpicKey: jest.fn(),
  writeBucketEpicKey: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};
const { searchJql: mockSearchJql, searchJqlAll: mockSearchJqlAll } =
  jest.requireMock('../jql-search') as {
    searchJql: jest.Mock;
    searchJqlAll: jest.Mock;
  };
const { readBucketEpicKey: mockReadKey, writeBucketEpicKey: mockWriteKey } =
  jest.requireMock('./bucket-epic') as {
    readBucketEpicKey: jest.Mock;
    writeBucketEpicKey: jest.Mock;
  };

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

const epic = (key: string, summary = key) => ({
  key,
  fields: { summary, status: { statusCategory: { key: 'new' } } },
});

describe('rolloverSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJiraRequest.mockResolvedValue(undefined);
    mockSearchJql.mockResolvedValue({ issues: [] });
    mockSearchJqlAll.mockResolvedValue([]);
    mockReadKey.mockResolvedValue(null);
    mockWriteKey.mockResolvedValue(undefined);
  });

  describe('check mode (default)', () => {
    it('reports a match without scanning for stranded tickets', async () => {
      mockReadKey.mockResolvedValue('LS-2000');
      mockSearchJql.mockResolvedValue({ issues: [epic('LS-2000')] });

      const result = await rolloverSync({});
      const data = parse(result);

      expect(result.isError).toBeFalsy();
      expect(data.success).toBe(true);
      expect(data.mode).toBe('check');
      expect(data.strandedTickets).toBe(0);
      // Property matches newest open epic for both buckets → no child scan.
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
      expect((data.report as string[]).join('\n')).toContain('✓');
    });

    it('counts stranded tickets when the property is stale', async () => {
      // client-bugs: property points at LS-100 but newest open epic is LS-200.
      mockReadKey.mockImplementation((bucket: string) =>
        Promise.resolve(bucket === 'client-bugs' ? 'LS-100' : 'LS-300'),
      );
      mockSearchJql.mockImplementation((opts: { jql: string }) => {
        if (opts.jql.includes('bucket:client-bugs')) {
          return Promise.resolve({ issues: [epic('LS-200')] });
        }
        return Promise.resolve({ issues: [epic('LS-300')] });
      });
      // Non-Done children of the stale epic LS-100.
      mockSearchJqlAll.mockResolvedValue([epic('LS-101', 'stranded one')]);

      const result = await rolloverSync({ mode: 'check' });
      const data = parse(result);

      expect(data.strandedTickets).toBe(1);
      expect((data.report as string[]).join('\n')).toContain('LS-101');
    });
  });

  describe('rollover mode', () => {
    it('returns an error when sprintName is missing', async () => {
      const result = await rolloverSync({ mode: 'rollover' });
      const data = parse(result);

      expect(result.isError).toBe(true);
      expect(data.success).toBe(false);
      expect(data.error).toContain('sprintName is required');
      expect(mockJiraRequest).not.toHaveBeenCalled();
    });

    it('creates a new sprint epic then runs sync (happy path)', async () => {
      // Newest open epic LS-900 does not match the new sprint summary, so a new
      // epic is created. Property already points at LS-900 so sync is a no-op close.
      mockReadKey.mockResolvedValue('LS-900');
      mockSearchJql.mockResolvedValue({ issues: [epic('LS-900')] });
      mockJiraRequest.mockImplementation(
        (opts: { method: string; path: string }) => {
          if (opts.method === 'POST' && opts.path === '/rest/api/3/issue') {
            return Promise.resolve(epic('LS-901')); // createEpic result
          }
          return Promise.resolve(undefined);
        },
      );

      const result = await rolloverSync({
        mode: 'rollover',
        sprintName: 'Sprint 9',
      });
      const data = parse(result);

      expect(result.isError).toBeFalsy();
      expect(data.success).toBe(true);
      expect(data.mode).toBe('rollover');
      // One epic created per bucket.
      expect(data.createdEpics).toEqual(['LS-901', 'LS-901']);
      // createEpic POSTed the sprint-suffixed summary for client-bugs.
      expect(mockJiraRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/rest/api/3/issue',
          body: expect.objectContaining({
            fields: expect.objectContaining({
              summary: 'Client Bugs — Sprint 9',
              labels: ['bucket:client-bugs', 'pinned-status'],
            }),
          }),
        }),
      );
      // sync ran afterward and reported completion.
      expect((data.sync as unknown[]).length).toBe(2);
    });
  });

  describe('sync mode', () => {
    it('updates the property when the newest open epic differs', async () => {
      mockReadKey.mockResolvedValue('LS-100');
      mockSearchJql.mockResolvedValue({ issues: [epic('LS-200')] });
      mockSearchJqlAll.mockResolvedValue([]); // no stranded children
      // Old epic LS-100 gets closed: transitions GET then the POST transition + comment.
      mockJiraRequest.mockImplementation(
        (opts: { method: string; path: string }) => {
          if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
            return Promise.resolve({
              transitions: [
                {
                  id: '31',
                  name: 'Done',
                  to: { name: 'Done', statusCategory: { key: 'done' } },
                },
              ],
            });
          }
          return Promise.resolve(undefined);
        },
      );

      const result = await rolloverSync({ mode: 'sync' });
      const data = parse(result);

      expect(result.isError).toBeFalsy();
      expect(data.success).toBe(true);
      // Both buckets roll LS-100 → LS-200.
      expect(mockWriteKey).toHaveBeenCalledWith('client-bugs', 'LS-200');
      expect(mockWriteKey).toHaveBeenCalledWith('mcp-gaps', 'LS-200');
    });

    it('surfaces an error when no open epic exists for a bucket', async () => {
      mockReadKey.mockResolvedValue('LS-100');
      mockSearchJql.mockResolvedValue({ issues: [] }); // no open epic

      const result = await rolloverSync({ mode: 'sync' });
      const data = parse(result);

      expect(result.isError).toBe(true);
      expect(data.success).toBe(false);
      expect(data.error).toContain('No open epic found');
      expect(mockWriteKey).not.toHaveBeenCalled();
    });

    it('sets the property but skips epic-closing when previousKey is null', async () => {
      mockReadKey.mockResolvedValue(null); // property never set
      mockSearchJql.mockResolvedValue({ issues: [epic('LS-200')] });

      const result = await rolloverSync({ mode: 'sync' });
      const data = parse(result);

      expect(result.isError).toBeFalsy();
      expect(data.success).toBe(true);
      // Property is written for both buckets...
      expect(mockWriteKey).toHaveBeenCalledWith('client-bugs', 'LS-200');
      expect(mockWriteKey).toHaveBeenCalledWith('mcp-gaps', 'LS-200');
      // ...but with no previous epic there is nothing to close or re-parent.
      expect(mockJiraRequest).not.toHaveBeenCalled();
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
    });

    it('closes the old epic via the statusCategory fallback when no transition is literally named "Done"', async () => {
      mockReadKey.mockResolvedValue('LS-100');
      mockSearchJql.mockResolvedValue({ issues: [epic('LS-200')] });
      mockSearchJqlAll.mockResolvedValue([]); // no stranded children
      mockJiraRequest.mockImplementation(
        (opts: { method: string; path: string }) => {
          if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
            // No transition literally named "Done" — only the statusCategory matches.
            return Promise.resolve({
              transitions: [
                {
                  id: '42',
                  name: 'Complete',
                  to: { name: 'Completed', statusCategory: { key: 'done' } },
                },
              ],
            });
          }
          return Promise.resolve(undefined);
        },
      );

      const result = await rolloverSync({ mode: 'sync' });
      const data = parse(result);

      expect(result.isError).toBeFalsy();
      expect(data.success).toBe(true);
      // Fallback selected transition id 42 and POSTed it to close LS-100.
      expect(mockJiraRequest).toHaveBeenCalledWith({
        method: 'POST',
        path: '/rest/api/3/issue/LS-100/transitions',
        body: { transition: { id: '42' } },
      });
    });
  });

  describe('fix mode', () => {
    it('re-parents non-Done children from historical epics to the current open epic', async () => {
      // Property is current (LS-200). A closed historical epic LS-100 still holds
      // a non-Done child LS-101 that must be re-parented to LS-200.
      mockReadKey.mockResolvedValue('LS-200');
      mockSearchJql.mockImplementation((opts: { jql: string }) => {
        if (opts.jql.includes('statusCategory = Done')) {
          // findAllClosedBucketEpics → one historical closed epic
          return Promise.resolve({ issues: [epic('LS-100')] });
        }
        // findOpenEpicsByLabel → current open epic
        return Promise.resolve({ issues: [epic('LS-200')] });
      });
      // findChildrenOf(LS-100) → one stranded non-Done child
      mockSearchJqlAll.mockResolvedValue([epic('LS-101', 'stranded child')]);

      const result = await rolloverSync({ mode: 'fix' });
      const data = parse(result);

      expect(result.isError).toBeFalsy();
      expect(data.success).toBe(true);
      expect(data.mode).toBe('fix');
      // Both buckets scan LS-100 and re-parent LS-101 → strandedFixed = 2.
      expect(data.strandedFixed).toBe(2);
      // Re-parent issued as a PUT carrying the new parent key.
      expect(mockJiraRequest).toHaveBeenCalledWith({
        method: 'PUT',
        path: '/rest/api/3/issue/LS-101',
        body: { fields: { parent: { key: 'LS-200' } } },
      });
    });

    it('skips a bucket whose property is unset', async () => {
      mockReadKey.mockResolvedValue(null);

      const result = await rolloverSync({ mode: 'fix' });
      const data = parse(result);

      expect(result.isError).toBeFalsy();
      expect(data.strandedFixed).toBe(0);
      expect((data.report as string[]).join('\n')).toContain('no property set');
      // No epic scans or re-parents when the property is unset.
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
    });
  });
});

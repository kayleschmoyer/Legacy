import { bulkListChildren } from './bulk-list-children';

jest.mock('../jql-search', () => ({
  searchJql: jest.fn(),
}));

interface ParentEntry {
  parent: string;
  count: number;
  children: Array<{ key: string }>;
}

interface SearchJqlCallArgs {
  jql: string;
  fields: string[];
  maxResults?: number;
  pageToken?: string;
}

interface ParsedResult {
  success: boolean;
  total: number;
  succeeded: ParentEntry[];
  failed: Array<{ key: string; error: string }>;
}

const { searchJql: mockSearchJql } = jest.requireMock<{
  searchJql: jest.Mock<
    Promise<{ issues: Array<{ key: string; fields: unknown }> }>,
    [SearchJqlCallArgs]
  >;
}>('../jql-search');

function parseResult(result: {
  content: ReadonlyArray<unknown>;
}): ParsedResult {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text) as ParsedResult;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bulkListChildren', () => {
  it('issues one JQL search per parent and returns their children grouped', async () => {
    mockSearchJql.mockImplementation(
      (params: { jql: string; maxResults: number }) => {
        const parent = params.jql.match(/parent = "([^"]+)"/)?.[1] ?? '';
        return Promise.resolve({
          issues: [
            {
              key: `${parent}-child`,
              fields: {
                summary: 's',
                status: { name: 'To Do' },
                issuetype: { name: 'Task' },
                priority: null,
                created: '2025-01-01',
              },
            },
          ],
        });
      },
    );

    const result = await bulkListChildren({ keys: ['LS-1', 'LS-2'] });

    expect(mockSearchJql).toHaveBeenCalledTimes(2);
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.total).toBe(2);
    const byParent = Object.fromEntries(
      parsed.succeeded.map((s) => [s.parent, s]),
    );
    expect(byParent['LS-1'].children[0].key).toBe('LS-1-child');
    expect(byParent['LS-2'].children[0].key).toBe('LS-2-child');
  });

  it('forwards the status filter into the JQL clause', async () => {
    mockSearchJql.mockResolvedValue({ issues: [] });
    await bulkListChildren({ keys: ['LS-1'], status: 'To Do' });
    const call = mockSearchJql.mock.calls[0][0];
    expect(call.jql).toContain('status = "To Do"');
  });

  it('reports partial failure when one parent search throws', async () => {
    mockSearchJql.mockImplementation((params: { jql: string }) => {
      if (params.jql.includes('LS-2')) throw new Error('JQL error');
      return Promise.resolve({ issues: [] });
    });

    const result = await bulkListChildren({ keys: ['LS-1', 'LS-2'] });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.succeeded.map((s) => s.parent)).toEqual(['LS-1']);
    expect(parsed.failed).toEqual([{ key: 'LS-2', error: 'JQL error' }]);
  });

  it('caps at 50 keys per call', async () => {
    const keys = Array.from({ length: 51 }, (_, i) => `LS-${i + 1}`);
    const result = await bulkListChildren({ keys });
    expect(result.isError).toBe(true);
    expect(mockSearchJql).not.toHaveBeenCalled();
  });
});

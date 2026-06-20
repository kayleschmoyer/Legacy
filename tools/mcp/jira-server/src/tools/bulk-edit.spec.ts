import { bulkEdit } from './bulk-edit';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('./get-active-sprint', () => ({
  getActiveSprintId: jest.fn(async () => 42),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

interface PutCall {
  method: string;
  path: string;
  body: { fields: Record<string, unknown> };
}

function parseResult(result: { content: ReadonlyArray<unknown> }): {
  success: boolean;
  total: number;
  succeeded: Array<{ key: string; updatedFields: string[] }>;
  failed: Array<{ key: string; error: string }>;
} {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJiraRequest.mockResolvedValue(undefined);
});

describe('bulkEdit', () => {
  it('issues one PUT per ticket combining all requested fields', async () => {
    const result = await bulkEdit({
      tickets: [
        { key: 'LS-1', summary: 'new', parent: 'LS-100' },
        { key: 'LS-2', sprint: 'current' },
        { key: 'LS-3', type: 'Bug', description: 'd' },
      ],
    });

    expect(mockJiraRequest).toHaveBeenCalledTimes(3);
    const calls = mockJiraRequest.mock.calls.map(([c]) => c as PutCall);
    const byKey = Object.fromEntries(
      calls.map((c) => [c.path.split('/').pop(), c]),
    );

    expect(byKey['LS-1'].body.fields.summary).toBe('new');
    expect(byKey['LS-1'].body.fields.parent).toEqual({ key: 'LS-100' });
    expect(byKey['LS-2'].body.fields.customfield_10020).toBe(42);
    expect(byKey['LS-3'].body.fields.issuetype).toEqual({ name: 'Bug' });
    expect(byKey['LS-3'].body.fields.description).toMatchObject({
      type: 'doc',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.total).toBe(3);
    expect(parsed.succeeded).toHaveLength(3);
    expect(parsed.failed).toHaveLength(0);
  });

  it('reports partial failure without failing the whole batch', async () => {
    mockJiraRequest.mockImplementation(async (opts: PutCall) => {
      if (opts.path.endsWith('LS-2')) throw new Error('400 Bad Request');
    });

    const result = await bulkEdit({
      tickets: [
        { key: 'LS-1', summary: 'a' },
        { key: 'LS-2', summary: 'b' },
      ],
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.succeeded.map((s) => s.key)).toEqual(['LS-1']);
    expect(parsed.failed).toEqual([{ key: 'LS-2', error: '400 Bad Request' }]);
  });

  it('rejects tickets with no editable fields without issuing a PUT', async () => {
    const result = await bulkEdit({
      tickets: [{ key: 'LS-1' }],
    });

    expect(mockJiraRequest).not.toHaveBeenCalled();
    const parsed = parseResult(result);
    expect(parsed.failed[0].error).toMatch(/At least one field/);
  });

  it('rejects an empty tickets array', async () => {
    const result = await bulkEdit({ tickets: [] });
    expect(result.isError).toBe(true);
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });

  it('caps at 50 tickets per call', async () => {
    const tickets = Array.from({ length: 51 }, (_, i) => ({
      key: `LS-${i + 1}`,
      summary: 's',
    }));
    const result = await bulkEdit({ tickets });
    expect(result.isError).toBe(true);
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });
});

import { bulkEdit } from './bulk-edit';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('./get-active-sprint', () => ({
  getActiveSprintId: jest.fn(() => Promise.resolve(42)),
}));

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

interface PutCall {
  method: string;
  path: string;
  body: { fields: Record<string, unknown> };
}

interface BulkEditResultPayload {
  success: boolean;
  total: number;
  succeeded: Array<{ key: string; updatedFields: string[] }>;
  failed: Array<{ key: string; error: string }>;
}

function parseResult(result: {
  content: ReadonlyArray<unknown>;
}): BulkEditResultPayload {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text) as BulkEditResultPayload;
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
    const byKey: Record<string, PutCall> = Object.fromEntries(
      calls.map((c) => [c.path.split('/').pop() ?? '', c] as const),
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
    mockJiraRequest.mockImplementation((opts: PutCall) => {
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

describe('bulkEdit — assignee (LS-9607)', () => {
  it('assigns each ticket via assigneeAccountId, with no status transition calls', async () => {
    const result = await bulkEdit({
      tickets: [
        { key: 'LS-1', assigneeAccountId: 'acct-1' },
        { key: 'LS-2', assigneeAccountId: 'acct-2' },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(
      parsed.succeeded.map((s) => ({
        key: s.key,
        updatedFields: s.updatedFields,
      })),
    ).toEqual([
      { key: 'LS-1', updatedFields: ['assignee'] },
      { key: 'LS-2', updatedFields: ['assignee'] },
    ]);

    const assigneeCalls = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(([opts]) => opts.path.includes('/assignee'));
    expect(assigneeCalls).toHaveLength(2);
    expect(assigneeCalls.map(([opts]) => opts.body)).toEqual([
      { accountId: 'acct-1' },
      { accountId: 'acct-2' },
    ]);
    expect(
      mockJiraRequest.mock.calls.some(([opts]: [{ path: string }]) =>
        opts.path.includes('/transitions'),
      ),
    ).toBe(false);
  });

  it('unassigns a ticket when assignee is empty, combined with a field update', async () => {
    const result = await bulkEdit({
      tickets: [{ key: 'LS-1', summary: 'renamed', assignee: '' }],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.succeeded).toEqual([
      { key: 'LS-1', updatedFields: ['summary', 'assignee'] },
    ]);

    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1',
      body: { fields: { summary: 'renamed' } },
    });
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1/assignee',
      body: { accountId: null },
    });
  });

  it('accepts an assignee-only ticket without the "at least one field" error', async () => {
    const result = await bulkEdit({
      tickets: [{ key: 'LS-1', assigneeAccountId: 'acct-1' }],
    });

    const parsed = parseResult(result);
    expect(parsed.failed).toHaveLength(0);
    expect(parsed.succeeded).toHaveLength(1);
  });
});

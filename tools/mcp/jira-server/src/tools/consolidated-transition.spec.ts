import { consolidatedTransition } from './transition';

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../jql-search', () => ({
  searchJqlAll: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

const { searchJqlAll: mockSearchJqlAll } = jest.requireMock<{
  searchJqlAll: jest.Mock;
}>('../jql-search');

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

const makeIssue = (key: string, statusName = 'To Do') => ({
  key,
  fields: {
    summary: `Ticket ${key}`,
    status: { name: statusName },
    issuetype: { name: 'Task' },
    description: null,
    assignee: null,
    reporter: { displayName: 'Reporter' },
    parent: undefined,
    issuelinks: [],
    labels: [],
    priority: { name: 'Medium' },
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env['JIRA_ASSIGNEE_EMAIL'];
  delete process.env['JIRA_ASSIGNEE_ACCOUNT_ID'];
  mockSearchJqlAll.mockResolvedValue([]);
});

describe('consolidatedTransition — validation', () => {
  it('rejects an empty status before calling Jira', async () => {
    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: '  ',
    });
    const data = parse(result);
    expect(result.isError).toBe(true);
    expect(data['success']).toBe(false);
    expect(String(data['error'])).toContain('non-empty');
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });

  it('rejects malformed keys', async () => {
    const result = await consolidatedTransition({
      keys: ['LS-1', 'bad-key'],
      status: 'Done',
    });
    const data = parse(result);
    expect(result.isError).toBe(true);
    expect(String(data['error'])).toContain('Invalid Jira key(s): bad-key');
  });

  it('rejects cascade with multiple keys', async () => {
    const result = await consolidatedTransition({
      keys: ['LS-1', 'LS-2'],
      status: 'Done',
      cascade: true,
    });
    const data = parse(result);
    expect(result.isError).toBe(true);
    expect(String(data['error'])).toContain('cascade=true');
  });

  it("rejects action='claim' with a non-In-Progress status", async () => {
    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: 'Done',
      action: 'claim',
    });
    const data = parse(result);
    expect(result.isError).toBe(true);
    expect(String(data['error'])).toContain("action: 'claim'");
  });
});

describe('consolidatedTransition — transition action', () => {
  it('transitions a single key', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '21', name: 'Start', to: { name: 'In Progress' } },
            ],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: 'In Progress',
    });
    const data = parse(result);
    expect(data['success']).toBe(true);
    expect(data['total']).toBe(1);
    expect(data['succeeded']).toBe(1);
    expect(data['failed']).toBe(0);
    expect(data['results']).toEqual({
      'LS-1': { status: 'In Progress' },
    });
  });

  it('transitions multiple keys in parallel', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: ['LS-1', 'LS-2', 'LS-3'],
      status: 'Done',
    });
    const data = parse(result);
    expect(data['success']).toBe(true);
    expect(data['total']).toBe(3);
    expect(data['succeeded']).toBe(3);
    const results = data['results'] as Record<string, { status: string }>;
    expect(results['LS-1']).toEqual({ status: 'Done' });
    expect(results['LS-2']).toEqual({ status: 'Done' });
    expect(results['LS-3']).toEqual({ status: 'Done' });
  });

  it("transitions a ticket to Won't Do via dynamic resolution", async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '3', name: "Won't Do", to: { name: "Won't Do" } },
            ],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: "Won't Do",
    });
    const data = parse(result);
    expect(data['success']).toBe(true);
    expect(data['results']).toEqual({
      'LS-1': { status: "Won't Do" },
    });
  });

  it('reports per-key errors on partial failure', async () => {
    // LS-1 succeeds; LS-2 has no transition to Done.
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          if (opts.path.includes('LS-2')) {
            return Promise.resolve({
              transitions: [{ id: '11', name: 'To Do', to: { name: 'To Do' } }],
            });
          }
          return Promise.resolve({
            transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: ['LS-1', 'LS-2'],
      status: 'Done',
    });
    const data = parse(result);
    expect(data['success']).toBe(false);
    expect(data['succeeded']).toBe(1);
    expect(data['failed']).toBe(1);
    const results = data['results'] as Record<string, PerKey>;
    expect(results['LS-1']).toEqual({ status: 'Done' });
    expect(results['LS-2']?.error).toContain('No transition to "Done"');
    // Per the MCP partial-failure rule, isError must be set when *any* item
    // fails in a batch — not only when all fail.
    expect(result.isError).toBe(true);
  });

  it('marks isError when every key fails', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [{ id: '11', name: 'To Do', to: { name: 'To Do' } }],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: ['LS-1', 'LS-2'],
      status: 'Done',
    });
    expect(result.isError).toBe(true);
    const data = parse(result);
    expect(data['failed']).toBe(2);
  });
});

describe('consolidatedTransition — claim action', () => {
  it('performs assignee-set + transition (PROCEED)', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/myself') {
          return Promise.resolve({ accountId: 'svc-account' });
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '21', name: 'Start', to: { name: 'In Progress' } },
            ],
          });
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/LS-1')) {
          return Promise.resolve(makeIssue('LS-1'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: 'In Progress',
      action: 'claim',
    });
    const data = parse(result);
    expect(data['success']).toBe(true);
    expect(data['action']).toBe('claim');
    const results = data['results'] as Record<string, PerKey>;
    expect(results['LS-1']?.['action']).toBe('PROCEED');
    expect(results['LS-1']?.['claimed']).toBe(true);
    expect(results['LS-1']?.status).toBe('In Progress');

    // Assignee was PUT.
    const putCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.endsWith('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
  });

  it('passes assigneeAccountId through to claimTicket, skipping any lookup', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '21', name: 'Start', to: { name: 'In Progress' } },
            ],
          });
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/LS-1')) {
          return Promise.resolve(makeIssue('LS-1'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: 'In Progress',
      action: 'claim',
      assignee: 'ignored@example.com',
      assigneeAccountId: 'direct-account-id',
    });
    const data = parse(result);
    expect(data['success']).toBe(true);

    const lookupCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) =>
        opts.path === '/rest/api/3/myself' ||
        opts.path === '/rest/api/3/user/search',
    );
    expect(lookupCalls).toHaveLength(0);

    const putCalls = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.endsWith('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].body).toEqual({ accountId: 'direct-account-id' });
  });

  it('returns ALREADY_CLAIMED without re-transitioning', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({ transitions: [] });
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/LS-1')) {
          return Promise.resolve(makeIssue('LS-1', 'In Progress'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: 'In Progress',
      action: 'claim',
    });
    const data = parse(result);
    const results = data['results'] as Record<string, PerKey>;
    expect(results['LS-1']?.['action']).toBe('ALREADY_CLAIMED');
    expect(results['LS-1']?.['claimed']).toBe(false);

    // No POST to transitions endpoint, no PUT to assignee.
    const mutations = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) =>
        (opts.method === 'POST' && opts.path.endsWith('/transitions')) ||
        (opts.method === 'PUT' && opts.path.endsWith('/assignee')),
    );
    expect(mutations).toHaveLength(0);
  });

  it('passes openPrs through to claimTicket, returning PR_EXISTS without transitioning (LS-9289)', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '21', name: 'Start', to: { name: 'In Progress' } },
            ],
          });
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/LS-1')) {
          return Promise.resolve(makeIssue('LS-1'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await consolidatedTransition({
      keys: 'LS-1',
      status: 'In Progress',
      action: 'claim',
      openPrs: [{ number: 6941 }],
    });
    const data = parse(result);
    const results = data['results'] as Record<string, PerKey>;
    expect(results['LS-1']?.['action']).toBe('PR_EXISTS');
    expect(results['LS-1']?.['claimed']).toBe(false);

    const mutations = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) =>
        (opts.method === 'POST' && opts.path.endsWith('/transitions')) ||
        (opts.method === 'PUT' && opts.path.endsWith('/assignee')),
    );
    expect(mutations).toHaveLength(0);
  });
});

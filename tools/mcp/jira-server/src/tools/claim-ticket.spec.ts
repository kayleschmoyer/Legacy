import { claimTicket } from './claim-ticket';

// claim-ticket.ts logs assignee warnings/errors via LOGGER. Mock the server
// logging module so tests stay hermetic and don't pull the real logging chain.
jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../jql-search', () => ({
  searchJqlAll: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

const { searchJqlAll: mockSearchJqlAll } = jest.requireMock(
  '../jql-search',
) as {
  searchJqlAll: jest.Mock;
};

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

/** Minimal Jira issue response for a claimable ticket. */
const makeIssue = (statusName = 'To Do') => ({
  key: 'LS-1',
  fields: {
    summary: 'Test ticket',
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

const makeTransitions = () => ({
  transitions: [
    { id: '21', name: 'Start Progress', to: { name: 'In Progress' } },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env['JIRA_ASSIGNEE_EMAIL'];

  // Default happy-path mock sequence:
  // 1. GET /issue/:key   → issue details
  // 2. JQL children      → [] (no children)
  // 3. GET /transitions  → available transitions
  mockJiraRequest.mockImplementation(
    (opts: { method: string; path: string }) => {
      if (opts.method === 'GET' && opts.path === '/rest/api/3/myself') {
        return Promise.resolve({ accountId: 'service-account' });
      }
      if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
        return Promise.resolve(makeTransitions());
      }
      if (opts.method === 'GET' && opts.path.includes('/issue/')) {
        return Promise.resolve(makeIssue());
      }
      // POST transition, PUT assignee, user search
      return Promise.resolve(undefined);
    },
  );

  mockSearchJqlAll.mockResolvedValue([]);
});

describe('claimTicket — auto-assign behaviour', () => {
  it('assigns to the service account (self) when no assignee email is configured', async () => {
    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);

    // No user search should happen — we go straight to /myself.
    const userSearchCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(([opts]) => opts.path === '/rest/api/3/user/search');
    expect(userSearchCalls).toHaveLength(0);

    const putCalls = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].body).toEqual({ accountId: 'service-account' });
    expect((data['warnings'] as string[]).length).toBe(0);
  });

  it('assigns to the explicit assignee param, overriding the env var', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'env-default@example.com';

    mockJiraRequest.mockImplementation(
      (opts: {
        method: string;
        path: string;
        query?: Record<string, string>;
      }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          // Echo back a distinct accountId so we can assert which email won.
          const q = opts.query?.['query'];
          return Promise.resolve([{ accountId: `id-for-${q}` }]);
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve(makeIssue());
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await claimTicket({
      key: 'LS-1',
      assignee: 'override@example.com',
    });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');

    const putCalls = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].body).toEqual({
      accountId: 'id-for-override@example.com',
    });
    expect((data['warnings'] as string[]).length).toBe(0);
  });

  it('assigns the ticket when JIRA_ASSIGNEE_EMAIL is set and the user is found', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'agent@example.com';

    // User search returns a match
    mockJiraRequest.mockImplementation(
      (opts: {
        method: string;
        path: string;
        query?: Record<string, string>;
      }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          return Promise.resolve([{ accountId: 'abc123' }]);
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve(makeIssue());
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);

    const putCalls = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].body).toEqual({ accountId: 'abc123' });
    expect((data['warnings'] as string[]).length).toBe(0);
  });

  it('adds a warning (and does not assign) when JIRA_ASSIGNEE_EMAIL is set but no user is found', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'nobody@example.com';

    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          return Promise.resolve([]); // empty result
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve(makeIssue());
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);

    const putCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putCalls).toHaveLength(0);

    const warnings = data['warnings'] as string[];
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('no Jira user found');
  });

  it('adds a warning and proceeds when the assignee PUT call throws', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'agent@example.com';

    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          return Promise.resolve([{ accountId: 'abc123' }]);
        }
        if (opts.method === 'PUT' && opts.path.includes('/assignee')) {
          return Promise.reject(new Error('403 Forbidden'));
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve(makeIssue());
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);

    const warnings = data['warnings'] as string[];
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('Assignee update failed');
    expect(warnings[0]).toContain('403 Forbidden');
  });
});

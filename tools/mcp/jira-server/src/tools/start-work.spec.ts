import { startWork } from './start-work';
import { _resetAssigneeCache } from '../assignee';

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../netrc', () => ({
  getJiraCredentials: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

const { getJiraCredentials: mockGetJiraCredentials } = jest.requireMock<{
  getJiraCredentials: jest.Mock;
}>('../netrc');

type JiraCall = [
  { method: string; path: string; body?: Record<string, unknown> },
];

const transitionPostCalls = () =>
  (mockJiraRequest.mock.calls as JiraCall[]).filter(
    ([opts]) => opts.method === 'POST' && opts.path.endsWith('/transitions'),
  );

const assigneePutCalls = () =>
  (mockJiraRequest.mock.calls as JiraCall[]).filter(
    ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
  );

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

const makeIssue = (statusName = 'To Do') => ({
  key: 'LS-1',
  fields: {
    status: { name: statusName },
    assignee: null,
  },
});

const makeTransitions = () => ({
  transitions: [
    { id: '21', name: 'Start Progress', to: { name: 'In Progress' } },
    { id: '31', name: 'Done', to: { name: 'Done' } },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  // Email -> accountId resolution is memoised for the process lifetime.
  _resetAssigneeCache();
  delete process.env['JIRA_ASSIGNEE_EMAIL'];
  delete process.env['JIRA_ASSIGNEE_ACCOUNT_ID'];
  // Basic auth by default so the pre-existing /myself-success tests keep
  // exercising that path; the OAuth/hosted-Lambda skip path (LS-8773) gets
  // its own dedicated test below.
  mockGetJiraCredentials.mockResolvedValue({
    type: 'basic',
    login: 'a',
    password: 'b',
  });

  mockJiraRequest.mockImplementation(
    (opts: { method: string; path: string }) => {
      if (opts.method === 'GET' && opts.path === '/rest/api/3/myself') {
        return Promise.resolve({
          accountId: 'service-account',
          displayName: 'Service Account',
        });
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
});

describe('startWork', () => {
  it('transitions a To Do ticket to In Progress and assigns it', async () => {
    const result = await startWork({ key: 'LS-1' });
    const data = parse(result);

    expect(result.isError).not.toBe(true);
    expect(data['key']).toBe('LS-1');
    expect(data['status']).toBe('In Progress');
    expect(data['previousStatus']).toBe('To Do');
    expect(data['idempotent']).toBe(false);
    expect(data['assignee']).toBe('Service Account');

    const transitionPosts = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'POST' && opts.path.endsWith('/transitions'),
    );
    expect(transitionPosts).toHaveLength(1);
    expect(transitionPosts[0][0].body).toEqual({
      transition: { id: '21' },
    });

    const putAssignee = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putAssignee).toHaveLength(1);
    expect(putAssignee[0][0].body).toEqual({ accountId: 'service-account' });
  });

  it('transitions a Backlog ticket to In Progress (previousStatus surfaced)', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/myself') {
          return Promise.resolve({
            accountId: 'service-account',
            displayName: 'Service Account',
          });
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve(makeIssue('Backlog'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await startWork({ key: 'LS-1' });
    const data = parse(result);

    expect(data['status']).toBe('In Progress');
    expect(data['previousStatus']).toBe('Backlog');
  });

  it('is idempotent when the ticket is already In Progress (no transition POST)', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve({
            key: 'LS-1',
            fields: {
              status: { name: 'In Progress' },
              assignee: { displayName: 'Alice' },
            },
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await startWork({ key: 'LS-1' });
    const data = parse(result);

    expect(result.isError).not.toBe(true);
    expect(data['status']).toBe('In Progress');
    expect(data['previousStatus']).toBe('In Progress');
    expect(data['idempotent']).toBe(true);
    expect(data['assignee']).toBe('Alice');

    const transitionPosts = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) => opts.method === 'POST' && opts.path.endsWith('/transitions'),
    );
    expect(transitionPosts).toHaveLength(0);

    const putAssignee = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putAssignee).toHaveLength(0);
  });

  it('refuses Done tickets with an isError result explaining why', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve(makeIssue('Done'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await startWork({ key: 'LS-1' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('LS-1');
    expect(text).toContain('Done');

    const transitionPosts = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) => opts.method === 'POST' && opts.path.endsWith('/transitions'),
    );
    expect(transitionPosts).toHaveLength(0);
  });

  it('uses the explicit assignee param over JIRA_ASSIGNEE_EMAIL', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'env-default@example.com';

    mockJiraRequest.mockImplementation(
      (opts: {
        method: string;
        path: string;
        query?: Record<string, string>;
      }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          const q = opts.query?.['query'];
          return Promise.resolve([
            { accountId: `id-for-${q}`, displayName: `User ${q}` },
          ]);
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

    const result = await startWork({
      key: 'LS-1',
      assignee: 'override@example.com',
    });
    const data = parse(result);

    expect(data['status']).toBe('In Progress');
    expect(data['assignee']).toBe('User override@example.com');

    const putAssignee = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putAssignee).toHaveLength(1);
    expect(putAssignee[0][0].body).toEqual({
      accountId: 'id-for-override@example.com',
    });
  });

  it('assigns from JIRA_ASSIGNEE_ACCOUNT_ID without /myself or /user/search', async () => {
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = '712020:abcd-1234';

    const result = await startWork({ key: 'LS-1' });
    const data = parse(result);

    expect(data['status']).toBe('In Progress');

    const lookupCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) =>
        opts.path === '/rest/api/3/myself' ||
        opts.path === '/rest/api/3/user/search',
    );
    expect(lookupCalls).toHaveLength(0);

    const putAssignee = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putAssignee).toHaveLength(1);
    expect(putAssignee[0][0].body).toEqual({ accountId: '712020:abcd-1234' });
  });

  it('prefers JIRA_ASSIGNEE_ACCOUNT_ID over JIRA_ASSIGNEE_EMAIL', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'agent@example.com';
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'env-account-id';

    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          return Promise.resolve([{ accountId: 'from-email-lookup' }]);
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

    const result = await startWork({ key: 'LS-1' });
    const data = parse(result);

    expect(data['status']).toBe('In Progress');

    // ACCOUNT_ID must win and /rest/api/3/user/search must never be called —
    // it structurally 401s under the Lambda's client-credentials scopes
    // (LS-7891/LS-8302).
    const userSearchCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) =>
        opts.method === 'GET' && opts.path === '/rest/api/3/user/search',
    );
    expect(userSearchCalls).toHaveLength(0);

    const putAssignee = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putAssignee).toHaveLength(1);
    expect(putAssignee[0][0].body).toEqual({ accountId: 'env-account-id' });
  });

  it('assigns from the explicit assigneeAccountId param without any lookup call', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'agent@example.com';
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'env-account-id';

    const result = await startWork({
      key: 'LS-1',
      assignee: 'explicit@example.com',
      assigneeAccountId: 'explicit-account-id',
    });
    const data = parse(result);

    expect(data['status']).toBe('In Progress');

    const lookupCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) =>
        opts.path === '/rest/api/3/myself' ||
        opts.path === '/rest/api/3/user/search',
    );
    expect(lookupCalls).toHaveLength(0);

    const putAssignee = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putAssignee).toHaveLength(1);
    expect(putAssignee[0][0].body).toEqual({
      accountId: 'explicit-account-id',
    });
  });

  it('refuses to start work (isError, no transition) when /myself 401s (LS-7891 scope error)', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/myself') {
          return Promise.reject(
            new Error(
              'Jira API GET /rest/api/3/myself failed (401): {"code":401,"message":"Unauthorized; scope does not match"}',
            ),
          );
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

    const result = await startWork({ key: 'LS-1' });

    // Refusal is plain text, not the JSON success payload.
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(
      /^Refusing to start work on LS-1 without an assignee: /,
    );
    expect(text).toContain('scope does not match');
    expect(text).toContain('assigneeAccountId');
    expect(transitionPostCalls()).toHaveLength(0);
    expect(assigneePutCalls()).toHaveLength(0);
  });

  it('LS-8773/LS-10069: skips the doomed /myself round trip under OAuth and refuses to start work instead of leaving the ticket unassigned', async () => {
    mockGetJiraCredentials.mockResolvedValue({
      type: 'oauth',
      clientId: 'id',
      clientSecret: 'secret',
      cloudId: 'cloud-1',
      siteUrl: 'https://example.atlassian.net',
    });

    const result = await startWork({ key: 'LS-1' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(
      /^Refusing to start work on LS-1 without an assignee: /,
    );
    expect(text).toContain('assigneeAccountId');
    expect(text).toContain('JIRA_ASSIGNEE_EMAIL');
    expect(text).toContain('JIRA_ASSIGNEE_ACCOUNT_ID');

    const myselfCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(([opts]) => opts.path === '/rest/api/3/myself');
    expect(myselfCalls).toHaveLength(0);
    expect(transitionPostCalls()).toHaveLength(0);
    expect(assigneePutCalls()).toHaveLength(0);
  });

  it('LS-10069: refuses a machine caller with no explicit assignee, ignoring the shared env var, without transitioning', async () => {
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'shared-env-account';

    const result = await startWork({
      key: 'LS-1',
      caller: { kind: 'machine', token: 'machine-token', sub: 'client-123' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(
      /^Refusing to start work on LS-1 without an assignee: /,
    );
    expect(text).toContain('machine');
    expect(text).toContain('assigneeAccountId');
    expect(transitionPostCalls()).toHaveLength(0);
    expect(assigneePutCalls()).toHaveLength(0);
  });

  it('LS-10069: surfaces a failed assignee PUT as a warning after transitioning', async () => {
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'acct-1';
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
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

    const result = await startWork({ key: 'LS-1' });
    const data = parse(result);

    expect(result.isError).not.toBe(true);
    expect(data['status']).toBe('In Progress');
    expect(data['assignee']).toBeNull();
    expect(transitionPostCalls()).toHaveLength(1);
    const warnings = data['warnings'] as string[];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Assignee update failed');
    expect(warnings[0]).toContain('403 Forbidden');
  });

  it('returns an error when no In Progress transition is available', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }],
          });
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve(makeIssue());
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await startWork({ key: 'LS-1' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No "In Progress" transition');
    expect(text).toContain('Done');
  });

  it('wraps API errors with the ticket key in the message', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.reject(new Error('404 Not Found'));
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await startWork({ key: 'LS-1' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('LS-1');
    expect(text).toContain('404 Not Found');
  });
});

describe('startWork — unowned In Progress repair (LS-9513)', () => {
  beforeEach(() => {
    mockJiraRequest.mockImplementation(
      (opts: {
        method: string;
        path: string;
        query?: Record<string, string>;
      }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          return Promise.resolve([
            { accountId: 'acct-1', displayName: 'Brad Krupa' },
          ]);
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          return Promise.resolve({
            key: 'LS-1',
            fields: { status: { name: 'In Progress' }, assignee: null },
          });
        }
        return Promise.resolve(undefined);
      },
    );
  });

  it('assigns an In Progress ticket that nobody owns, without re-transitioning', async () => {
    const result = await startWork({
      key: 'LS-1',
      assignee: 'agent@example.com',
    });
    const data = parse(result);

    expect(data['idempotent']).toBe(true);
    expect(data['status']).toBe('In Progress');
    expect(data['assignee']).toBe('Brad Krupa');

    const putAssignee = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putAssignee).toHaveLength(1);
    expect(putAssignee[0][0].body).toEqual({ accountId: 'acct-1' });

    const transitionPosts = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) => opts.method === 'POST' && opts.path.endsWith('/transitions'),
    );
    expect(transitionPosts).toHaveLength(0);
  });
});

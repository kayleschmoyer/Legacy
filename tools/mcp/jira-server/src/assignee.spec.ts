import { _resetAssigneeCache, resolveAndAssign } from './assignee';

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('./jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('./jql-search', () => ({
  searchJql: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('./jira-api');

const { searchJql: mockSearchJql } = jest.requireMock<{
  searchJql: jest.Mock;
}>('./jql-search');

/** The 401 the hosted Lambda's client-credentials token gets on user lookups. */
const scopeError = new Error(
  'Jira API GET /rest/api/3/user/search failed (401): {"code":401,"message":"Unauthorized; scope does not match"}',
);

const putAssigneeCalls = () =>
  (
    mockJiraRequest.mock.calls as Array<
      [{ method: string; path: string; body?: Record<string, unknown> }]
    >
  ).filter(
    ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
  );

beforeEach(() => {
  jest.clearAllMocks();
  _resetAssigneeCache();
  delete process.env['JIRA_ASSIGNEE_EMAIL'];
  delete process.env['JIRA_ASSIGNEE_ACCOUNT_ID'];
  mockJiraRequest.mockResolvedValue(undefined);
  mockSearchJql.mockResolvedValue({ issues: [] });
});

describe('resolveAndAssign — email resolution (LS-9513)', () => {
  it('uses /user/search when the scope allows it, without touching JQL', async () => {
    mockJiraRequest.mockImplementation((opts: { path: string }) =>
      opts.path === '/rest/api/3/user/search'
        ? Promise.resolve([{ accountId: 'acct-1', displayName: 'Local User' }])
        : Promise.resolve(undefined),
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'agent@example.com',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBe('acct-1');
    expect(mockSearchJql).not.toHaveBeenCalled();
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: 'acct-1' });
  });

  it('falls back to JQL when /user/search 401s on the hosted Lambda', async () => {
    mockJiraRequest.mockImplementation((opts: { path: string }) => {
      if (opts.path === '/rest/api/3/user/search')
        return Promise.reject(scopeError);
      return Promise.resolve(undefined);
    });
    mockSearchJql.mockResolvedValue({
      issues: [
        {
          key: 'LS-99',
          fields: {
            assignee: { accountId: 'acct-jql', displayName: 'Brad Krupa' },
          },
        },
      ],
    });

    const result = await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'agent@example.com',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBe('acct-jql');
    expect(result.displayName).toBe('Brad Krupa');
    expect(result.warnings).toEqual([]);
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: 'acct-jql' });

    const jql = (mockSearchJql.mock.calls as Array<[{ jql: string }]>)[0][0]
      .jql;
    expect(jql).toContain('assignee = "agent@example.com"');
  });

  it('falls back to JQL when /user/search succeeds but matches nobody', async () => {
    mockJiraRequest.mockImplementation((opts: { path: string }) =>
      opts.path === '/rest/api/3/user/search'
        ? Promise.resolve([])
        : Promise.resolve(undefined),
    );
    mockSearchJql.mockResolvedValue({
      issues: [
        { key: 'LS-99', fields: { assignee: { accountId: 'acct-jql' } } },
      ],
    });

    const result = await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'agent@example.com',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBe('acct-jql');
  });

  it('warns without assigning when neither path resolves the email', async () => {
    mockJiraRequest.mockImplementation((opts: { path: string }) => {
      if (opts.path === '/rest/api/3/user/search')
        return Promise.reject(scopeError);
      return Promise.resolve(undefined);
    });

    const result = await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'nobody@example.com',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBeUndefined();
    expect(putAssigneeCalls()).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('no Jira user found');
    // The JQL fallback's blind spot is called out so it isn't read as
    // "this user does not exist".
    expect(result.warnings.join(' ')).toContain('at least one issue assigned');
    // LS-9428 AC4: the warning names a concrete remedy, not just the failure.
    expect(result.warnings.join(' ')).toContain('assigneeAccountId');
  });

  it('warns with a concrete remedy (not the raw error) when the JQL fallback itself throws (LS-9428)', async () => {
    mockJiraRequest.mockImplementation((opts: { path: string }) => {
      if (opts.path === '/rest/api/3/user/search')
        return Promise.reject(scopeError);
      return Promise.resolve(undefined);
    });
    mockSearchJql.mockRejectedValue(
      new Error(
        'Jira API POST /rest/api/3/search/jql failed (400): {"errorMessages":["bad jql"]}',
      ),
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'agent@example.com',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBeUndefined();
    expect(putAssigneeCalls()).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('no Jira user found');
    expect(result.warnings.join(' ')).toContain('assigneeAccountId');
  });

  it('escapes quotes in the email before interpolating it into JQL', async () => {
    mockJiraRequest.mockImplementation((opts: { path: string }) => {
      if (opts.path === '/rest/api/3/user/search')
        return Promise.reject(scopeError);
      return Promise.resolve(undefined);
    });

    await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'we"ird@example.com',
      toolName: 'jira_transition',
    });

    const jql = (mockSearchJql.mock.calls as Array<[{ jql: string }]>)[0][0]
      .jql;
    expect(jql).toContain('assignee = "we\\"ird@example.com"');
  });

  it('memoises a resolved email across calls', async () => {
    mockJiraRequest.mockImplementation((opts: { path: string }) => {
      if (opts.path === '/rest/api/3/user/search')
        return Promise.reject(scopeError);
      return Promise.resolve(undefined);
    });
    mockSearchJql.mockResolvedValue({
      issues: [
        { key: 'LS-99', fields: { assignee: { accountId: 'acct-jql' } } },
      ],
    });

    await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'agent@example.com',
      toolName: 'jira_transition',
    });
    await resolveAndAssign({
      key: 'LS-2',
      explicitAssignee: 'agent@example.com',
      toolName: 'jira_transition',
    });

    expect(mockSearchJql).toHaveBeenCalledTimes(1);
    // Both tickets still got assigned.
    expect(putAssigneeCalls()).toHaveLength(2);
  });

  it('resolves JIRA_ASSIGNEE_EMAIL through the same fallback, with the shared-Lambda warning', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'env@example.com';
    mockJiraRequest.mockImplementation((opts: { path: string }) => {
      if (opts.path === '/rest/api/3/user/search')
        return Promise.reject(scopeError);
      return Promise.resolve(undefined);
    });
    mockSearchJql.mockResolvedValue({
      issues: [
        { key: 'LS-99', fields: { assignee: { accountId: 'acct-env' } } },
      ],
    });

    const result = await resolveAndAssign({
      key: 'LS-1',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBe('acct-env');
    expect(result.warnings[0]).toContain('JIRA_ASSIGNEE_EMAIL');
  });

  it('names a concrete remedy when the assignee PUT itself fails (LS-9428)', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'PUT' && opts.path.includes('/assignee')) {
          return Promise.reject(new Error('Jira API PUT failed (403)'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      explicitAssigneeAccountId: 'acct-direct',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('Assignee update failed');
    // A remedy that fits this failure mode, not a generic "pass assigneeAccountId"
    // (the caller already did) — verifying the accountId/scope is the real next step.
    expect(result.warnings.join(' ')).toContain('verify the accountId');
  });

  it('skips every lookup when an explicit accountId is passed', async () => {
    const result = await resolveAndAssign({
      key: 'LS-1',
      explicitAssigneeAccountId: 'acct-direct',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBe('acct-direct');
    expect(mockSearchJql).not.toHaveBeenCalled();
    const lookups = (
      mockJiraRequest.mock.calls as Array<[{ path: string }]>
    ).filter(([opts]) => opts.path.startsWith('/rest/api/3/user'));
    expect(lookups).toHaveLength(0);
  });
});

describe('resolveAndAssign — unassign (LS-9607)', () => {
  it('PUTs accountId: null and skips all resolution when unassign is true', async () => {
    const result = await resolveAndAssign({
      key: 'LS-1',
      toolName: 'jira_edit_ticket',
      unassign: true,
    });

    expect(result.accountId).toBeUndefined();
    expect(result.displayName).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(mockSearchJql).not.toHaveBeenCalled();
    expect(putAssigneeCalls()).toHaveLength(1);
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: null });
  });

  it('ignores explicit assignee/assigneeAccountId params when unassign is true', async () => {
    await resolveAndAssign({
      key: 'LS-1',
      explicitAssignee: 'agent@example.com',
      explicitAssigneeAccountId: 'acct-1',
      toolName: 'jira_edit_ticket',
      unassign: true,
    });

    expect(mockSearchJql).not.toHaveBeenCalled();
    expect(putAssigneeCalls()).toHaveLength(1);
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: null });
  });

  it('returns a non-fatal warning when the unassign PUT fails', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'PUT' && opts.path.includes('/assignee')) {
          return Promise.reject(new Error('Jira API PUT failed (404)'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      toolName: 'jira_edit_ticket',
      unassign: true,
    });

    expect(result.accountId).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('Failed to unassign LS-1');
  });
});

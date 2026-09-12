import {
  _resetAssigneeCache,
  putAssignee,
  resolveAndAssign,
  resolveAssignee,
} from './assignee';

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('./caller-email', () => ({
  resolveCallerEmail: jest.fn(),
}));

jest.mock('./jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('./jql-search', () => ({
  searchJql: jest.fn(),
}));

jest.mock('./netrc', () => ({
  getJiraCredentials: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('./jira-api');

const { searchJql: mockSearchJql } = jest.requireMock<{
  searchJql: jest.Mock;
}>('./jql-search');

const { getJiraCredentials: mockGetJiraCredentials } = jest.requireMock<{
  getJiraCredentials: jest.Mock;
}>('./netrc');

const { resolveCallerEmail: mockResolveCallerEmail } = jest.requireMock<{
  resolveCallerEmail: jest.Mock;
}>('./caller-email');

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
  mockGetJiraCredentials.mockResolvedValue({
    type: 'basic',
    login: 'a',
    password: 'b',
  });
  mockResolveCallerEmail.mockResolvedValue(undefined);
});

describe('resolveAssignee — hosted caller identity (LS-10069)', () => {
  const USER_CALLER = {
    kind: 'user' as const,
    token: 'user-token',
    sub: 'sub-1',
  };
  const MACHINE_CALLER = {
    kind: 'machine' as const,
    token: 'machine-token',
    sub: 'client-1',
  };

  /** /user/search echoes a distinct accountId per queried email. */
  function mockUserSearchEcho() {
    mockJiraRequest.mockImplementation(
      (opts: { path: string; query?: Record<string, string> }) =>
        opts.path === '/rest/api/3/user/search'
          ? Promise.resolve([
              {
                accountId: `id-for-${opts.query?.['query']}`,
                displayName: 'Caller Person',
              },
            ])
          : Promise.resolve(undefined),
    );
  }

  const lookupCalls = () =>
    (mockJiraRequest.mock.calls as Array<[{ path: string }]>).filter(
      ([opts]) =>
        opts.path === '/rest/api/3/myself' ||
        opts.path.startsWith('/rest/api/3/user'),
    );

  it("resolves a user caller to the account behind the caller's own email", async () => {
    mockResolveCallerEmail.mockResolvedValue('caller@example.com');
    mockUserSearchEcho();

    const result = await resolveAssignee({
      key: 'LS-1',
      caller: USER_CALLER,
      toolName: 'jira_transition',
    });

    expect(result).toEqual({
      ok: true,
      accountId: 'id-for-caller@example.com',
      displayName: 'Caller Person',
    });
    expect(mockResolveCallerEmail).toHaveBeenCalledWith(USER_CALLER);
    // resolveAssignee never writes.
    expect(putAssigneeCalls()).toHaveLength(0);
  });

  it('refuses a machine caller with an error naming the explicit-assignee remedy', async () => {
    const result = await resolveAssignee({
      key: 'LS-1',
      caller: MACHINE_CALLER,
      toolName: 'jira_transition',
    });

    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain('machine');
    expect(error).toContain('`assignee`');
    expect(error).toContain('assigneeAccountId');
    expect(lookupCalls()).toHaveLength(0);
  });

  it.each([
    ['JIRA_ASSIGNEE_ACCOUNT_ID', 'shared-env-account'],
    ['JIRA_ASSIGNEE_EMAIL', 'shared-env@example.com'],
  ])('never consults %s when a caller is present', async (envVar, envValue) => {
    process.env[envVar] = envValue;

    const machine = await resolveAssignee({
      key: 'LS-1',
      caller: MACHINE_CALLER,
      toolName: 'jira_transition',
    });
    expect(machine.ok).toBe(false);

    mockResolveCallerEmail.mockResolvedValue('caller@example.com');
    mockUserSearchEcho();
    const user = await resolveAssignee({
      key: 'LS-1',
      caller: USER_CALLER,
      toolName: 'jira_transition',
    });
    expect(user).toEqual(
      expect.objectContaining({
        ok: true,
        accountId: 'id-for-caller@example.com',
      }),
    );
  });

  it('refuses a user caller whose email cannot be determined, without falling back to env or /myself', async () => {
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'shared-env-account';
    mockResolveCallerEmail.mockResolvedValue(undefined);

    const result = await resolveAssignee({
      key: 'LS-1',
      caller: USER_CALLER,
      toolName: 'jira_transition',
    });

    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain('email');
    expect(error).toContain('assigneeAccountId');
    expect(lookupCalls()).toHaveLength(0);
    expect(mockGetJiraCredentials).not.toHaveBeenCalled();
  });

  it('refuses a user caller whose email maps to no Jira user', async () => {
    mockResolveCallerEmail.mockResolvedValue('ghost@example.com');
    mockJiraRequest.mockImplementation((opts: { path: string }) =>
      opts.path === '/rest/api/3/user/search'
        ? Promise.resolve([])
        : Promise.resolve(undefined),
    );

    const result = await resolveAssignee({
      key: 'LS-1',
      caller: USER_CALLER,
      toolName: 'jira_transition',
    });

    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain('no Jira user found');
    expect(error).toContain('ghost@example.com');
    expect(error).toContain('at least one issue assigned');
    expect(error).toContain('assigneeAccountId');
  });

  it('lets an explicit assigneeAccountId beat the caller (no email lookup at all)', async () => {
    mockResolveCallerEmail.mockResolvedValue('caller@example.com');

    const result = await resolveAssignee({
      key: 'LS-1',
      explicitAssigneeAccountId: 'explicit-acct',
      caller: MACHINE_CALLER,
      toolName: 'jira_transition',
    });

    expect(result).toEqual({ ok: true, accountId: 'explicit-acct' });
    expect(mockResolveCallerEmail).not.toHaveBeenCalled();
    expect(lookupCalls()).toHaveLength(0);
  });

  it('lets an explicit assignee email beat the caller', async () => {
    mockResolveCallerEmail.mockResolvedValue('caller@example.com');
    mockUserSearchEcho();

    const result = await resolveAssignee({
      key: 'LS-1',
      explicitAssignee: 'explicit@example.com',
      caller: USER_CALLER,
      toolName: 'jira_transition',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        accountId: 'id-for-explicit@example.com',
      }),
    );
    expect(mockResolveCallerEmail).not.toHaveBeenCalled();
  });
});

describe('resolveAssignee — local stdio fallbacks (no caller)', () => {
  it('refuses under OAuth creds without calling /myself', async () => {
    mockGetJiraCredentials.mockResolvedValue({
      type: 'oauth',
      clientId: 'id',
      clientSecret: 'secret',
      cloudId: 'cloud-1',
      siteUrl: 'https://example.atlassian.net',
    });

    const result = await resolveAssignee({
      key: 'LS-1',
      toolName: 'jira_transition',
    });

    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain('assigneeAccountId');
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });

  it('refuses an explicit email that resolves to no Jira user', async () => {
    const result = await resolveAssignee({
      key: 'LS-1',
      explicitAssignee: 'nobody@example.com',
      toolName: 'jira_transition',
    });

    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain('no Jira user found');
    expect(error).toContain('at least one issue assigned');
    expect(error).toContain('assigneeAccountId');
  });
});

describe('putAssignee (LS-10069)', () => {
  it('returns undefined after a successful PUT of the accountId', async () => {
    await expect(
      putAssignee('LS-1', 'acct-1', 'jira_transition'),
    ).resolves.toBeUndefined();
    expect(putAssigneeCalls()).toHaveLength(1);
    expect(putAssigneeCalls()[0][0].path).toBe(
      '/rest/api/3/issue/LS-1/assignee',
    );
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: 'acct-1' });
  });

  it('returns a remedy-bearing warning (never throws) when the PUT fails', async () => {
    mockJiraRequest.mockRejectedValue(new Error('Jira API PUT failed (403)'));

    const warning = await putAssignee('LS-1', 'acct-1', 'jira_transition');

    expect(warning).toContain('Assignee update failed');
    expect(warning).toContain('Jira API PUT failed (403)');
    expect(warning).toContain('verify the accountId');
  });
});

describe('resolveAndAssign — with a hosted caller (LS-10069)', () => {
  it("assigns to the user caller's resolved account", async () => {
    mockResolveCallerEmail.mockResolvedValue('caller@example.com');
    mockJiraRequest.mockImplementation((opts: { path: string }) =>
      opts.path === '/rest/api/3/user/search'
        ? Promise.resolve([{ accountId: 'acct-caller', displayName: 'Caller' }])
        : Promise.resolve(undefined),
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      caller: { kind: 'user', token: 't', sub: 'sub-1' },
      toolName: 'jira_transition',
    });

    expect(result).toEqual({
      accountId: 'acct-caller',
      displayName: 'Caller',
      warnings: [],
    });
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: 'acct-caller' });
  });

  it('warns (never assigns the shared env account) for a machine caller', async () => {
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'shared-env-account';

    const result = await resolveAndAssign({
      key: 'LS-1',
      caller: { kind: 'machine', token: 't', sub: 'client-1' },
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBeUndefined();
    expect(putAssigneeCalls()).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^Could not assign LS-1: /);
    expect(result.warnings[0]).toContain('machine');
  });
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

  it('resolves JIRA_ASSIGNEE_EMAIL through the same fallback, silently (env fallback is stdio-only now)', async () => {
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
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: 'acct-env' });
    // No caller means the local single-user stdio server, so the env default
    // is no longer flagged as shared across callers (LS-10069).
    expect(result.warnings).toEqual([]);
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

describe('resolveAndAssign — current-user fallback (LS-8773)', () => {
  it('skips the GET /rest/api/3/myself round trip under OAuth and warns with a concrete remedy', async () => {
    mockGetJiraCredentials.mockResolvedValue({
      type: 'oauth',
      clientId: 'id',
      clientSecret: 'secret',
      cloudId: 'cloud-1',
      siteUrl: 'https://example.atlassian.net',
    });

    const result = await resolveAndAssign({
      key: 'LS-1',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBeUndefined();
    expect(putAssigneeCalls()).toHaveLength(0);
    const myselfCalls = (
      mockJiraRequest.mock.calls as Array<[{ path: string }]>
    ).filter(([opts]) => opts.path === '/rest/api/3/myself');
    expect(myselfCalls).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('JIRA_ASSIGNEE_EMAIL');
    expect(result.warnings.join(' ')).toContain('JIRA_ASSIGNEE_ACCOUNT_ID');
    expect(result.warnings.join(' ')).toContain('assigneeAccountId');
  });

  it('surfaces a warning (not an uncaught rejection) when getJiraCredentials itself throws', async () => {
    mockGetJiraCredentials.mockRejectedValue(
      new Error('No Jira credentials found.'),
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBeUndefined();
    expect(putAssigneeCalls()).toHaveLength(0);
    // A resolution failure (not a failed PUT) is reported as such.
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^Could not assign LS-1: /);
    expect(result.warnings[0]).toContain('No Jira credentials found');
    expect(result.warnings[0]).toContain('current-user lookup');
    expect(result.warnings[0]).not.toContain('Assignee update failed');
  });

  it('still attempts GET /rest/api/3/myself under basic auth (local sessions)', async () => {
    mockGetJiraCredentials.mockResolvedValue({
      type: 'basic',
      login: 'a',
      password: 'b',
    });
    mockJiraRequest.mockImplementation((opts: { path: string }) =>
      opts.path === '/rest/api/3/myself'
        ? Promise.resolve({ accountId: 'acct-self', displayName: 'Self' })
        : Promise.resolve(undefined),
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBe('acct-self');
    expect(putAssigneeCalls()[0][0].body).toEqual({ accountId: 'acct-self' });
  });

  it('names the current-user remedy (not the generic bypass-email one) when the basic-auth /myself call itself fails', async () => {
    mockGetJiraCredentials.mockResolvedValue({
      type: 'basic',
      login: 'a',
      password: 'b',
    });
    mockJiraRequest.mockImplementation((opts: { path: string }) =>
      opts.path === '/rest/api/3/myself'
        ? Promise.reject(
            new Error('Jira API GET /rest/api/3/myself failed (401)'),
          )
        : Promise.resolve(undefined),
    );

    const result = await resolveAndAssign({
      key: 'LS-1',
      toolName: 'jira_transition',
    });

    expect(result.accountId).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('current-user lookup');
    expect(result.warnings.join(' ')).toContain('JIRA_ASSIGNEE_EMAIL');
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

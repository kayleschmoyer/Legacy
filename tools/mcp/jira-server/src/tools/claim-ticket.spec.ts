import { claimTicket } from './claim-ticket';
import { _resetAssigneeCache } from '../assignee';

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
  searchJql: jest.fn(),
}));

jest.mock('../netrc', () => ({
  getJiraCredentials: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

const { searchJqlAll: mockSearchJqlAll, searchJql: mockSearchJql } =
  jest.requireMock<{ searchJqlAll: jest.Mock; searchJql: jest.Mock }>(
    '../jql-search',
  );

const { getJiraCredentials: mockGetJiraCredentials } = jest.requireMock<{
  getJiraCredentials: jest.Mock;
}>('../netrc');

/** Model the hosted Lambda's client-credentials OAuth token (LS-8773). */
function useOAuth() {
  mockGetJiraCredentials.mockResolvedValue({
    type: 'oauth',
    clientId: 'id',
    clientSecret: 'secret',
    cloudId: 'cloud-1',
    siteUrl: 'https://example.atlassian.net',
  });
}

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
  // The email -> accountId resolution is memoised for the process lifetime;
  // without this, a resolution from one test leaks into the next.
  _resetAssigneeCache();
  delete process.env['JIRA_ASSIGNEE_EMAIL'];
  delete process.env['JIRA_ASSIGNEE_ACCOUNT_ID'];
  // Default: a local basic-auth session with no caller, so an owner always
  // resolves via GET /myself (mocked below as 'service-account'). A claim
  // with no resolvable owner now refuses (LS-10069), so the guard tests that
  // are not about assignment need this default to reach PROCEED. Tests that
  // model the hosted Lambda's client-credentials token call useOAuth().
  mockGetJiraCredentials.mockResolvedValue({
    type: 'basic',
    login: 'a',
    password: 'b',
  });

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
  // Default: the JQL email-resolution fallback finds nobody.
  mockSearchJql.mockResolvedValue({ issues: [] });
});

describe('claimTicket — auto-assign behaviour', () => {
  it('assigns to the current user (self) via /myself under basic auth (local sessions) when no assignee email is configured', async () => {
    mockGetJiraCredentials.mockResolvedValue({
      type: 'basic',
      login: 'a',
      password: 'b',
    });

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

  it('LS-8773/LS-10069: skips the doomed /myself round trip under OAuth and refuses the claim (STOP) instead of leaving it unassigned', async () => {
    // No email or accountId configured, and credentials are OAuth (the
    // hosted Lambda's client-credentials token, which always 401s on
    // GET /rest/api/3/myself — LS-7891/LS-8773). The call is skipped, and
    // with no resolvable owner the claim now stops before touching the
    // ticket (LS-10069) rather than transitioning it unassigned.
    useOAuth();
    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('STOP');
    expect(data['claimed']).toBe(false);
    expect(data['reason']).toMatch(/^Cannot claim LS-1 without an assignee: /);
    expect(data['reason']).toContain('assigneeAccountId');
    expect(data['reason']).toContain('JIRA_ASSIGNEE_EMAIL');
    expect(data['reason']).toContain('JIRA_ASSIGNEE_ACCOUNT_ID');

    const myselfCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(([opts]) => opts.path === '/rest/api/3/myself');
    expect(myselfCalls).toHaveLength(0);

    expect(transitionPostCalls()).toHaveLength(0);
    expect(assigneePutCalls()).toHaveLength(0);
    expect(data['warnings']).toEqual([]);
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

    // The env fallback is now stdio-only (no caller), where there is exactly
    // one user — so it is silent rather than flagged as shared (LS-10069).
    expect(data['warnings']).toEqual([]);
  });

  it('refuses the claim (STOP, no transition) when JIRA_ASSIGNEE_EMAIL is set but no user is found', async () => {
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

    expect(data['action']).toBe('STOP');
    expect(data['claimed']).toBe(false);
    expect(data['reason']).toMatch(/^Cannot claim LS-1 without an assignee: /);
    expect(data['reason']).toContain('no Jira user found');
    expect(data['reason']).toContain('nobody@example.com');
    expect(data['reason']).toContain('at least one issue assigned');
    expect(data['reason']).toContain('assigneeAccountId');
    expect(transitionPostCalls()).toHaveLength(0);
    expect(assigneePutCalls()).toHaveLength(0);
  });

  it('assigns directly from JIRA_ASSIGNEE_ACCOUNT_ID without any user-lookup API call', async () => {
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = '712020:abcd-1234';

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);

    // Neither /myself nor /user/search should be called — both require the
    // read:jira-user scope, which the Lambda's token lacks (LS-7891).
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
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].body).toEqual({ accountId: '712020:abcd-1234' });
    expect(data['warnings']).toEqual([]);
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

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');

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

    const putCalls = (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].body).toEqual({ accountId: 'env-account-id' });
  });

  it('assigns from the explicit assigneeAccountId param without any lookup call', async () => {
    process.env['JIRA_ASSIGNEE_EMAIL'] = 'agent@example.com';
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'env-account-id';

    const result = await claimTicket({
      key: 'LS-1',
      assignee: 'explicit@example.com',
      assigneeAccountId: 'explicit-account-id',
    });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');

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
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0][0].body).toEqual({
      accountId: 'explicit-account-id',
    });
    expect((data['warnings'] as string[]).length).toBe(0);
  });

  it('refuses the claim (STOP, no transition) when /myself fails under basic auth (e.g. an expired local token)', async () => {
    // No email or accountId configured, basic-auth creds (the default) —
    // falls through to /myself (the OAuth/hosted-Lambda case is covered by
    // the LS-8773 test above, which never attempts this call).
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

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('STOP');
    expect(data['claimed']).toBe(false);
    expect(data['reason']).toMatch(/^Cannot claim LS-1 without an assignee: /);
    expect(data['reason']).toContain('scope does not match');
    expect(data['reason']).toContain('assigneeAccountId');
    expect(transitionPostCalls()).toHaveLength(0);
    expect(assigneePutCalls()).toHaveLength(0);
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

    // The transition already happened, so a failed PUT is non-fatal: the
    // claim still proceeds, with a single warning naming the PUT failure.
    expect(transitionPostCalls()).toHaveLength(1);
    const warnings = data['warnings'] as string[];
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('Assignee update failed');
    expect(warnings[0]).toContain('403 Forbidden');
    expect(warnings[0]).toContain('verify the accountId');
    // The ticket card must not report an owner the PUT never set.
    expect((data['ticket'] as { assignee: string }).assignee).toBe('');
  });
});

describe('claimTicket — hosted caller identity (LS-10069)', () => {
  const USER_CALLER = {
    kind: 'user' as const,
    token: 'user-access-token',
    sub: 'sub-owner',
    email: 'owner@example.com',
  };
  const MACHINE_CALLER = {
    kind: 'machine' as const,
    token: 'machine-token',
    sub: 'client-123',
  };

  beforeEach(() => {
    // The hosted Lambda runs under OAuth. The env var set here is the
    // shared, Lambda-wide default that must be ignored whenever a caller is
    // present.
    useOAuth();
    process.env['JIRA_ASSIGNEE_ACCOUNT_ID'] = 'shared-env-account';
    mockJiraRequest.mockImplementation(
      (opts: {
        method: string;
        path: string;
        query?: Record<string, string>;
      }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          const q = opts.query?.['query'];
          return Promise.resolve([
            { accountId: `id-for-${q}`, displayName: 'Owner Person' },
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
  });

  it("assigns a user caller's claim to the caller's own resolved account, ignoring the shared env var", async () => {
    const result = await claimTicket({ key: 'LS-1', caller: USER_CALLER });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);
    expect(transitionPostCalls()).toHaveLength(1);
    expect(assigneePutCalls()).toHaveLength(1);
    expect(assigneePutCalls()[0][0].body).toEqual({
      accountId: 'id-for-owner@example.com',
    });
    expect((data['ticket'] as { assignee: string }).assignee).toBe(
      'Owner Person',
    );
    expect(data['warnings']).toEqual([]);
  });

  it('refuses a machine caller with no explicit assignee (STOP) without transitioning or assigning', async () => {
    const result = await claimTicket({ key: 'LS-1', caller: MACHINE_CALLER });
    const data = parse(result);

    expect(data['action']).toBe('STOP');
    expect(data['claimed']).toBe(false);
    expect(data['reason']).toMatch(/^Cannot claim LS-1 without an assignee: /);
    expect(data['reason']).toContain('machine');
    expect(data['reason']).toContain('assigneeAccountId');
    expect(transitionPostCalls()).toHaveLength(0);
    expect(assigneePutCalls()).toHaveLength(0);
  });

  it('lets a machine caller claim when it passes an explicit assignee', async () => {
    const result = await claimTicket({
      key: 'LS-1',
      caller: MACHINE_CALLER,
      assignee: 'someone@example.com',
    });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);
    expect(transitionPostCalls()).toHaveLength(1);
    expect(assigneePutCalls()).toHaveLength(1);
    expect(assigneePutCalls()[0][0].body).toEqual({
      accountId: 'id-for-someone@example.com',
    });
  });
});

describe('claimTicket — duplicate-work guard (LS-9289)', () => {
  it('returns PR_EXISTS instead of PROCEED when an open PR references the ticket', async () => {
    const result = await claimTicket({
      key: 'LS-1',
      openPrs: [{ number: 6941, url: 'https://github.com/o/r/pull/6941' }],
    });
    const data = parse(result);

    expect(data['action']).toBe('PR_EXISTS');
    expect(data['claimed']).toBe(false);
    expect(data['reason']).toContain('#6941');
    expect(data['openPrs']).toEqual([
      { number: 6941, url: 'https://github.com/o/r/pull/6941' },
    ]);

    // Must not have transitioned or assigned the ticket.
    const postCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(([opts]) => opts.method === 'POST' || opts.method === 'PUT');
    expect(postCalls).toHaveLength(0);
  });

  it('proceeds as PROCEED when openPrs is an empty array (checked, none found)', async () => {
    const result = await claimTicket({ key: 'LS-1', openPrs: [] });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);
  });

  it('proceeds as PROCEED when openPrs is omitted (not checked — unchanged behaviour)', async () => {
    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);
  });

  it('does not false-positive when the only PR referencing the ticket has merged (caller passes no open PRs)', async () => {
    // A merged-PR-only ticket: the caller's open-PR lookup (e.g.
    // github_pr_dashboard(state: 'open')) would not surface a merged PR, so
    // it correctly passes an empty/omitted openPrs — claim proceeds.
    const result = await claimTicket({ key: 'LS-1', openPrs: [] });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);
  });
});

describe('claimTicket — duplicate-ticket guard (LS-9567)', () => {
  const LS_9545_SUMMARY =
    'fix(app): football [leagueId].spec.tsx fails on main — Chip missing from shared-components mock breaks 3 FLD-017 bracket-toggle tests';
  const LS_9550_SUMMARY =
    'test(app): main is red — football [leagueId].spec.tsx missing Chip in shared-components mock after LS-6330 + LS-6322 land together';

  /** Route the children-count query to [] and the similarity query to `similar`. */
  function mockSearchJqlAllByJql(
    similar: Array<{
      key: string;
      fields: { summary: string; status: { name: string } };
    }>,
  ) {
    mockSearchJqlAll.mockImplementation((opts: { jql: string }) => {
      if (opts.jql.startsWith('project =')) {
        return Promise.resolve(similar);
      }
      return Promise.resolve([]); // parent = "..." children query
    });
  }

  it('returns POSSIBLE_DUPLICATE instead of PROCEED when claiming LS-9550 with LS-9545 still open (AC2 reproduction)', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          const issue = makeIssue();
          issue.key = 'LS-9550';
          issue.fields.summary = LS_9550_SUMMARY;
          return Promise.resolve(issue);
        }
        return Promise.resolve(undefined);
      },
    );
    mockSearchJqlAllByJql([
      {
        key: 'LS-9545',
        fields: { summary: LS_9545_SUMMARY, status: { name: 'In Review' } },
      },
    ]);

    const result = await claimTicket({ key: 'LS-9550' });
    const data = parse(result);

    expect(data['action']).toBe('POSSIBLE_DUPLICATE');
    expect(data['claimed']).toBe(false);
    expect(data['reason']).toContain('LS-9545');
    expect(data['similarTickets']).toEqual([
      expect.objectContaining({ key: 'LS-9545', status: 'In Review' }),
    ]);

    // Must not have transitioned or assigned the ticket.
    const postCalls = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(([opts]) => opts.method === 'POST' || opts.method === 'PUT');
    expect(postCalls).toHaveLength(0);
  });

  it('proceeds as PROCEED when no similar ticket is found', async () => {
    mockSearchJqlAllByJql([]);

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);
  });

  it('does not block the claim when the similarity search itself throws (non-fatal)', async () => {
    mockSearchJqlAll.mockImplementation((opts: { jql: string }) => {
      if (opts.jql.startsWith('project =')) {
        return Promise.reject(new Error('Jira API GET failed (500)'));
      }
      return Promise.resolve([]);
    });

    const result = await claimTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(data['action']).toBe('PROCEED');
    expect(data['claimed']).toBe(true);
    expect((data['warnings'] as string[]).join(' ')).toContain(
      'Duplicate-ticket check failed',
    );
  });

  it('checks for duplicate tickets even when openPrs is empty/omitted', async () => {
    mockSearchJqlAllByJql([
      {
        key: 'LS-9545',
        fields: { summary: LS_9545_SUMMARY, status: { name: 'To Do' } },
      },
    ]);
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          const issue = makeIssue();
          issue.fields.summary = LS_9550_SUMMARY;
          return Promise.resolve(issue);
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await claimTicket({ key: 'LS-1', openPrs: [] });
    const data = parse(result);

    expect(data['action']).toBe('POSSIBLE_DUPLICATE');
  });
});

describe('claimTicket — ALREADY_CLAIMED assignee repair (LS-9513)', () => {
  /** Mock sequence for a ticket already In Progress with the given assignee. */
  function mockInProgress(assignee: { displayName: string } | null) {
    mockJiraRequest.mockImplementation(
      (opts: {
        method: string;
        path: string;
        query?: Record<string, string>;
      }) => {
        if (opts.method === 'GET' && opts.path === '/rest/api/3/user/search') {
          return Promise.resolve([{ accountId: 'acct-from-search' }]);
        }
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve(makeTransitions());
        }
        if (opts.method === 'GET' && opts.path.includes('/issue/')) {
          const issue = makeIssue('In Progress');
          issue.fields.assignee = assignee as never;
          return Promise.resolve(issue);
        }
        return Promise.resolve(undefined);
      },
    );
  }

  const putAssigneeCalls = () =>
    (
      mockJiraRequest.mock.calls as Array<
        [{ method: string; path: string; body?: Record<string, unknown> }]
      >
    ).filter(
      ([opts]) => opts.method === 'PUT' && opts.path.includes('/assignee'),
    );

  it('assigns an In Progress ticket that has no assignee', async () => {
    mockInProgress(null);

    const result = await claimTicket({
      key: 'LS-1',
      assignee: 'agent@example.com',
    });
    const data = parse(result);

    // Still refuses to re-claim — this only fills in the missing owner.
    expect(data['action']).toBe('ALREADY_CLAIMED');
    expect(data['claimed']).toBe(false);

    expect(putAssigneeCalls()).toHaveLength(1);
    expect(putAssigneeCalls()[0][0].body).toEqual({
      accountId: 'acct-from-search',
    });
    expect((data['warnings'] as string[]).join(' ')).toContain(
      'In Progress with no assignee',
    );

    // The returned ticket card reflects the repair rather than the stale snapshot.
    expect((data['ticket'] as { assignee: string }).assignee).toBe(
      'agent@example.com',
    );
  });

  it('leaves an already-assigned In Progress ticket alone', async () => {
    mockInProgress({ displayName: 'Someone Else' });

    const result = await claimTicket({
      key: 'LS-1',
      assignee: 'agent@example.com',
    });
    const data = parse(result);

    expect(data['action']).toBe('ALREADY_CLAIMED');
    expect(putAssigneeCalls()).toHaveLength(0);
    expect((data['ticket'] as { assignee: string }).assignee).toBe(
      'Someone Else',
    );
  });

  it('does not transition the ticket while repairing the assignee', async () => {
    mockInProgress(null);

    await claimTicket({ key: 'LS-1', assignee: 'agent@example.com' });

    const transitionPosts = (
      mockJiraRequest.mock.calls as Array<[{ method: string; path: string }]>
    ).filter(
      ([opts]) => opts.method === 'POST' && opts.path.endsWith('/transitions'),
    );
    expect(transitionPosts).toHaveLength(0);
  });
});

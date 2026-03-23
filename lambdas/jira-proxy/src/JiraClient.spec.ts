import { createJiraBug, searchJiraBugs } from './JiraClient';

jest.mock('./oauth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('test-access-token'),
  getApiBaseUrl: jest
    .fn()
    .mockResolvedValue('https://api.atlassian.com/ex/jira/test-cloud-id'),
  getSiteUrl: jest.fn().mockResolvedValue('https://test.atlassian.net'),
  _resetCache: jest.fn(),
}));

const API_BASE = 'https://api.atlassian.com/ex/jira/test-cloud-id';
const SITE_URL = 'https://test.atlassian.net';

type FetchCall = [string, RequestInit];

/** Narrow T | undefined → T, failing the test if undefined. */
function defined<T>(val: T | undefined): T {
  if (val === undefined) throw new Error('Expected value to be defined');
  return val;
}

function makeUserSearchResponse(
  users: Array<{ accountId: string; emailAddress: string }>,
): Response {
  return new Response(JSON.stringify(users), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeCreateIssueResponse(): Response {
  return new Response(
    JSON.stringify({
      id: '10001',
      key: 'LS-1',
      self: `${API_BASE}/rest/api/3/issue/10001`,
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
}

function findCreateIssueFetchCall(calls: FetchCall[]): FetchCall | undefined {
  return calls.find(
    ([url]) =>
      url.includes('/rest/api/3/issue') && !url.includes('/user/search'),
  );
}

describe('createJiraBug — reporter resolution', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('sets reporter when reporterEmail matches a Jira account', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        makeUserSearchResponse([
          { accountId: 'abc123', emailAddress: 'user@example.com' },
        ]),
      )
      .mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test bug', reporterEmail: 'user@example.com' },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    expect(createCall).toBeDefined();
    const body = JSON.parse(defined(createCall)[1].body as string) as {
      fields: { reporter?: { id: string } };
    };
    expect(body.fields.reporter).toEqual({ id: 'abc123' });
  });

  it('does not set reporter when reporterEmail has no matching Jira account', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeUserSearchResponse([]))
      .mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test bug', reporterEmail: 'unknown@example.com' },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    expect(createCall).toBeDefined();
    const body = JSON.parse(defined(createCall)[1].body as string) as {
      fields: { reporter?: { id: string } };
    };
    expect(body.fields.reporter).toBeUndefined();
  });

  it('does not set reporter when no reporterEmail is provided', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug({ summary: 'Test bug' }, 'LS', 'jira-secret');

    // Only one fetch call — no user search
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const body = JSON.parse(calls[0][1].body as string) as {
      fields: { reporter?: { id: string } };
    };
    expect(body.fields.reporter).toBeUndefined();
  });

  it('falls back gracefully when the user search API returns an error', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValueOnce(makeCreateIssueResponse());

    const result = await createJiraBug(
      { summary: 'Test bug', reporterEmail: 'user@example.com' },
      'LS',
      'jira-secret',
    );
    expect(result.issueKey).toBe('LS-1');

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    const body = JSON.parse(defined(createCall)[1].body as string) as {
      fields: { reporter?: { id: string } };
    };
    expect(body.fields.reporter).toBeUndefined();
  });

  it('uses Bearer auth and cloud API URL for user search', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeUserSearchResponse([]))
      .mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test', reporterEmail: 'reporter@example.com' },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const searchCall = calls.find(([url]) => url.includes('/user/search'));
    expect(searchCall).toBeDefined();
    expect(defined(searchCall)[0]).toContain(API_BASE);
    expect(defined(searchCall)[0]).toContain(
      encodeURIComponent('reporter@example.com'),
    );
    const headers = defined(searchCall)[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-access-token');
  });

  it('builds browse URL using site_url, not cloud API URL', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    const result = await createJiraBug(
      { summary: 'Test bug' },
      'LS',
      'jira-secret',
    );

    expect(result.issueUrl).toBe(`${SITE_URL}/browse/LS-1`);
  });
});

describe('createJiraBug — epic parent field', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('sets parent field when epicKey is provided', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test bug' },
      'LS',
      'jira-secret',
      'LS-1322',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    expect(createCall).toBeDefined();
    const body = JSON.parse(defined(createCall)[1].body as string) as {
      fields: { parent?: { key: string } };
    };
    expect(body.fields.parent).toEqual({ key: 'LS-1322' });
  });

  it('does not set parent field when epicKey is omitted', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug({ summary: 'Test bug' }, 'LS', 'jira-secret');

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    expect(createCall).toBeDefined();
    const body = JSON.parse(defined(createCall)[1].body as string) as {
      fields: { parent?: { key: string } };
    };
    expect(body.fields.parent).toBeUndefined();
  });
});

describe('searchJiraBugs', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  function makeSearchResponse(
    issues: Array<{
      key: string;
      fields: { summary: string; status: { name: string } };
    }>,
    total?: number,
  ): Response {
    return new Response(
      JSON.stringify({ total: total ?? issues.length, issues }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('returns matching issues from Jira search', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeSearchResponse([
        {
          key: 'LS-50',
          fields: {
            summary: 'Login page broken',
            status: { name: 'To Do' },
          },
        },
        {
          key: 'LS-51',
          fields: {
            summary: 'Login button unresponsive',
            status: { name: 'In Progress' },
          },
        },
      ]),
    );

    const result = await searchJiraBugs('login broken', 'LS', 'jira-secret');

    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].issueKey).toBe('LS-50');
    expect(result.issues[0].summary).toBe('Login page broken');
    expect(result.issues[0].status).toBe('To Do');
    expect(result.issues[0].issueUrl).toBe(`${SITE_URL}/browse/LS-50`);
    expect(result.issues[1].issueKey).toBe('LS-51');
    expect(result.total).toBe(2);
  });

  it('returns empty result when Jira API errors', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const result = await searchJiraBugs('crash', 'LS', 'jira-secret');
    expect(result.issues).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('escapes double quotes in query to prevent JQL injection', async () => {
    fetchSpy.mockResolvedValueOnce(makeSearchResponse([], 0));

    await searchJiraBugs('test "injected" query', 'LS', 'jira-secret');

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const url = calls[0][0];
    expect(url).toContain(encodeURIComponent('\\"injected\\"'));
  });

  it('caps maxResults to 10', async () => {
    fetchSpy.mockResolvedValueOnce(makeSearchResponse([], 0));

    await searchJiraBugs('test', 'LS', 'jira-secret', 50);

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const url = calls[0][0];
    expect(url).toContain('maxResults=10');
  });

  it('uses Bearer auth and cloud API URL', async () => {
    fetchSpy.mockResolvedValueOnce(makeSearchResponse([], 0));

    await searchJiraBugs('test', 'LS', 'jira-secret');

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    expect(calls[0][0]).toContain(API_BASE);
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-access-token');
  });
});

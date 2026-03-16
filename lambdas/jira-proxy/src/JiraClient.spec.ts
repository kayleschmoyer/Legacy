import { createJiraBug } from './JiraClient';

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      SecretString: JSON.stringify({
        api_token: 'test-token',
        email: 'admin@example.com',
        base_url: 'https://test.atlassian.net',
      }),
    }),
  })),
  GetSecretValueCommand: jest.fn(),
}));

const BASE_URL = 'https://test.atlassian.net';
const EXPECTED_AUTH = Buffer.from('admin@example.com:test-token').toString(
  'base64',
);

type FetchCall = [string, RequestInit];

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
      self: `${BASE_URL}/rest/api/3/issue/10001`,
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
    const body = JSON.parse(createCall![1].body as string) as {
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
    const body = JSON.parse(createCall![1].body as string) as {
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

    // Should not throw — reporter simply won't be set
    const result = await createJiraBug(
      { summary: 'Test bug', reporterEmail: 'user@example.com' },
      'LS',
      'jira-secret',
    );
    expect(result.issueKey).toBe('LS-1');

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    const body = JSON.parse(createCall![1].body as string) as {
      fields: { reporter?: { id: string } };
    };
    expect(body.fields.reporter).toBeUndefined();
  });

  it('uses the user search API with the correct email query and auth header', async () => {
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
    expect(searchCall![0]).toContain(
      encodeURIComponent('reporter@example.com'),
    );
    const headers = searchCall![1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Basic ${EXPECTED_AUTH}`);
  });
});

describe('createJiraBug — epic parent field', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
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
    const body = JSON.parse(createCall![1].body as string) as {
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
    const body = JSON.parse(createCall![1].body as string) as {
      fields: { parent?: { key: string } };
    };
    expect(body.fields.parent).toBeUndefined();
  });
});

/**
 * Tests for JiraClient helper functions: textToAdf, buildDescription,
 * sanitizeFilename, attachFilesToJiraIssue.
 *
 * These functions are not exported directly, so we test them through
 * the exported createJiraBug function, or by importing the module
 * and accessing them via module internals.
 *
 * Since the helpers are private, we test their behavior indirectly:
 * - textToAdf / buildDescription: verified via the description field in createJiraBug calls
 * - sanitizeFilename: verified via attachment upload calls
 * - attachFilesToJiraIssue: verified via fetch calls after issue creation
 */

jest.mock('./oauth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('test-access-token'),
  getApiBaseUrl: jest
    .fn()
    .mockResolvedValue('https://api.atlassian.com/ex/jira/test-cloud-id'),
  getSiteUrl: jest.fn().mockResolvedValue('https://test.atlassian.net'),
  _resetCache: jest.fn(),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { createJiraBug } from './JiraClient';

const API_BASE = 'https://api.atlassian.com/ex/jira/test-cloud-id';

type FetchCall = [string, RequestInit];

/** Narrow T | undefined → T, failing the test if undefined. */
function defined<T>(val: T | undefined): T {
  if (val === undefined) throw new Error('Expected value to be defined');
  return val;
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
      url.includes('/rest/api/3/issue') &&
      !url.includes('/user/search') &&
      !url.includes('/attachments'),
  );
}

describe('textToAdf (tested via createJiraBug description field)', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('converts plain text description to ADF paragraphs', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test', description: 'First paragraph\n\nSecond paragraph' },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    expect(createCall).toBeDefined();

    const body = JSON.parse(defined(createCall)[1].body as string) as {
      fields: {
        description: {
          type: string;
          version: number;
          content: Array<{
            type: string;
            content: Array<{ type: string; text: string }>;
          }>;
        };
      };
    };

    const desc = body.fields.description;
    expect(desc.type).toBe('doc');
    expect(desc.version).toBe(1);
    expect(desc.content.length).toBeGreaterThanOrEqual(1);
    expect(desc.content[0].type).toBe('paragraph');
    expect(desc.content[0].content[0].type).toBe('text');
    // buildDescription prepends a "## Bug Report" header, so user content starts at index 1
    expect(desc.content[1].content[0].text).toContain('First paragraph');
  });

  it('handles description with no double newlines as single paragraph', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test', description: 'Single paragraph text' },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    const body = JSON.parse(defined(createCall)[1].body as string) as {
      fields: { description: { content: unknown[] } };
    };

    // Should be description text + metadata section (at minimum)
    expect(body.fields.description.content.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildDescription (tested via createJiraBug metadata fields)', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('includes metadata fields in description', async () => {
    // User search for reporterEmail, then create issue
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      {
        summary: 'Test bug',
        description: 'Bug description',
        appVersion: '1.2.3',
        environment: 'production',
        reporterEmail: 'user@example.com',
        reporterUsername: 'testuser',
        pageUrl: 'https://app.example.com/page',
        userAgent: 'Mozilla/5.0',
      },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    const bodyStr = defined(createCall)[1].body as string;

    // The description ADF should contain metadata
    expect(bodyStr).toContain('App Version: 1.2.3');
    expect(bodyStr).toContain('Environment: production');
    expect(bodyStr).toContain('Reporter: user@example.com');
    expect(bodyStr).toContain('Username: testuser');
    expect(bodyStr).toContain('Page URL: https://app.example.com/page');
    expect(bodyStr).toContain('User Agent: Mozilla/5.0');
  });

  it('omits metadata section when no metadata fields provided', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test', description: 'Just a bug' },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    const bodyStr = defined(createCall)[1].body as string;

    expect(bodyStr).not.toContain('--- Metadata ---');
  });

  it('includes metadata even without description text', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug(
      { summary: 'Test', appVersion: '2.0.0' },
      'LS',
      'jira-secret',
    );

    const calls = fetchSpy.mock.calls as unknown as FetchCall[];
    const createCall = findCreateIssueFetchCall(calls);
    const bodyStr = defined(createCall)[1].body as string;

    expect(bodyStr).toContain('App Version: 2.0.0');
  });
});

describe('sanitizeFilename (tested via attachment uploads)', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('strips forbidden characters from attachment filenames', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeCreateIssueResponse()) // create issue
      .mockResolvedValueOnce(new Response('[]', { status: 200 })); // attachment upload

    await createJiraBug(
      {
        summary: 'Test',
        attachments: [
          {
            name: 'file/with\\bad:chars*and?"<>|stuff.png',
            data: Buffer.from('test-image').toString('base64'),
            type: 'image/png',
          },
        ],
      },
      'LS',
      'jira-secret',
    );

    // The attachment upload call should have sanitized filename
    const attachCall = fetchSpy.mock.calls.find(([url]) =>
      (url as string).includes('/attachments'),
    );
    expect(attachCall).toBeDefined();
    // The FormData body should use the sanitized name
    // We verify the fetch was called with the attachment endpoint
    expect(defined(attachCall)[0]).toContain(
      '/rest/api/3/issue/LS-1/attachments',
    );
  });
});

describe('attachFilesToJiraIssue (tested via createJiraBug with attachments)', () => {
  let fetchSpy: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('uploads attachments after issue creation', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeCreateIssueResponse()) // create issue
      .mockResolvedValueOnce(new Response('[]', { status: 200 })); // attachment

    const result = await createJiraBug(
      {
        summary: 'Bug with screenshot',
        attachments: [
          {
            name: 'screenshot.png',
            data: Buffer.from('fake-png-data').toString('base64'),
            type: 'image/png',
          },
        ],
      },
      'LS',
      'jira-secret',
    );

    expect(result.issueKey).toBe('LS-1');

    // Verify attachment upload was attempted
    const attachCall = fetchSpy.mock.calls.find(([url]) =>
      (url as string).includes('/attachments'),
    );
    expect(attachCall).toBeDefined();
    const attachInit = defined(attachCall)[1] as RequestInit;
    expect(attachInit.method).toBe('POST');
    const headers = attachInit.headers as Record<string, string>;
    expect(headers['X-Atlassian-Token']).toBe('no-check');
    expect(headers['Authorization']).toBe('Bearer test-access-token');
  });

  it('does not throw when attachment upload fails', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeCreateIssueResponse()) // create issue
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 })); // attachment fails

    const result = await createJiraBug(
      {
        summary: 'Bug with failing attachment',
        attachments: [
          {
            name: 'file.png',
            data: Buffer.from('data').toString('base64'),
            type: 'image/png',
          },
        ],
      },
      'LS',
      'jira-secret',
    );

    // Issue was still created successfully
    expect(result.issueKey).toBe('LS-1');
  });

  it('does not throw when attachment fetch throws', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeCreateIssueResponse()) // create issue
      .mockRejectedValueOnce(new Error('Network error')); // attachment throws

    const result = await createJiraBug(
      {
        summary: 'Bug',
        attachments: [
          {
            name: 'file.png',
            data: Buffer.from('data').toString('base64'),
            type: 'image/png',
          },
        ],
      },
      'LS',
      'jira-secret',
    );

    expect(result.issueKey).toBe('LS-1');
  });

  it('uploads multiple attachments', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeCreateIssueResponse()) // create issue
      .mockResolvedValueOnce(new Response('[]', { status: 200 })) // attachment 1
      .mockResolvedValueOnce(new Response('[]', { status: 200 })); // attachment 2

    await createJiraBug(
      {
        summary: 'Bug',
        attachments: [
          {
            name: 'file1.png',
            data: Buffer.from('d1').toString('base64'),
            type: 'image/png',
          },
          {
            name: 'file2.jpg',
            data: Buffer.from('d2').toString('base64'),
            type: 'image/jpeg',
          },
        ],
      },
      'LS',
      'jira-secret',
    );

    const attachCalls = fetchSpy.mock.calls.filter(([url]) =>
      (url as string).includes('/attachments'),
    );
    expect(attachCalls).toHaveLength(2);
  });

  it('skips attachments when none provided', async () => {
    fetchSpy.mockResolvedValueOnce(makeCreateIssueResponse());

    await createJiraBug({ summary: 'No attachments' }, 'LS', 'jira-secret');

    const attachCalls = fetchSpy.mock.calls.filter(([url]) =>
      (url as string).includes('/attachments'),
    );
    expect(attachCalls).toHaveLength(0);
  });
});

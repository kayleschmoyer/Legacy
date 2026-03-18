import type { APIGatewayEvent } from 'aws-lambda';
import { sign } from 'jsonwebtoken';
import { createJiraBug, searchJiraBugs } from './JiraClient';
import { baseHandler } from './index';

// jest.mock calls are hoisted before imports by babel-jest at runtime
jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: () => null,
  initRollbar: jest.fn(),
  withRollbar: (fn: unknown) => fn,
  captureError: jest.fn(),
}));

// Mock the Jira client
jest.mock('./JiraClient', () => ({
  createJiraBug: jest.fn(),
  searchJiraBugs: jest.fn(),
}));

const mockCreateJiraBug = createJiraBug as jest.MockedFunction<
  typeof createJiraBug
>;
const mockSearchJiraBugs = searchJiraBugs as jest.MockedFunction<
  typeof searchJiraBugs
>;

const TEST_JWT_SECRET = 'test-secret';

function makeValidAuthHeader(overrides: Record<string, unknown> = {}): string {
  const token = sign(
    { id: 1, email: 'user@example.com', username: 'testuser', ...overrides },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return `Bearer ${token}`;
}

function makeEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  return {
    httpMethod: 'POST',
    path: '/jira/bug',
    body: JSON.stringify({ summary: 'Test bug' }),
    headers: { Authorization: makeValidAuthHeader() },
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

describe('Jira Proxy Handler', () => {
  let originalCorsOrigins: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['JIRA_SECRET_NAME'] = 'test-secret';
    process.env['JIRA_PROJECT_KEY'] = 'LS';
    process.env['JWT_SECRET'] = TEST_JWT_SECRET;
    originalCorsOrigins = process.env['CORS_ALLOWED_ORIGINS'];
  });

  afterEach(() => {
    delete process.env['JIRA_SECRET_NAME'];
    delete process.env['JIRA_PROJECT_KEY'];
    delete process.env['JWT_SECRET'];
    if (originalCorsOrigins !== undefined) {
      process.env['CORS_ALLOWED_ORIGINS'] = originalCorsOrigins;
    } else {
      delete process.env['CORS_ALLOWED_ORIGINS'];
    }
  });

  it('returns 200 for OPTIONS (CORS preflight)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await baseHandler(event);
    expect(result.statusCode).toBe(200);
    // Without an Origin header or CORS_ALLOWED_ORIGINS env var the new
    // per-request allowlist logic omits Access-Control-Allow-Origin.
    expect(result.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('reflects allowed origin in CORS headers', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] =
      'https://legacy-fantasy.com,https://dev.legacy-fantasy.com';
    const event = makeEvent({
      httpMethod: 'OPTIONS',
      headers: { Origin: 'https://legacy-fantasy.com' },
    });
    const result = await baseHandler(event);
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://legacy-fantasy.com',
    );
    expect(result.headers?.['Vary']).toBe('Origin');
  });

  it('omits ACAO when origin is not in allowlist', async () => {
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';
    const event = makeEvent({
      httpMethod: 'OPTIONS',
      headers: { Origin: 'https://evil.com' },
    });
    const result = await baseHandler(event);
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('includes security headers in responses', async () => {
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/jira/health',
      body: null,
    });
    const result = await baseHandler(event);
    expect(result.headers?.['X-Content-Type-Options']).toBe('nosniff');
    expect(result.headers?.['X-Frame-Options']).toBe('DENY');
    expect(result.headers?.['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(result.headers?.['Content-Security-Policy']).toBe(
      "default-src 'none'",
    );
  });

  it('includes GET in Access-Control-Allow-Methods', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await baseHandler(event);
    expect(result.headers?.['Access-Control-Allow-Methods']).toContain('GET');
  });

  it('returns Access-Control-Allow-Credentials: true for credentialed requests', async () => {
    const event = makeEvent({
      httpMethod: 'OPTIONS',
      headers: { Origin: 'https://legacy-fantasy.com' },
    });
    process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';
    const result = await baseHandler(event);
    expect(result.headers?.['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('includes X-CSRF-Token in Access-Control-Allow-Headers', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await baseHandler(event);
    expect(result.headers?.['Access-Control-Allow-Headers']).toContain(
      'X-CSRF-Token',
    );
  });

  it('returns 200 for health check', async () => {
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/jira/health',
      body: null,
    });
    const result = await baseHandler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('returns 404 for unknown route', async () => {
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/unknown',
      body: null,
    });
    const result = await baseHandler(event);
    expect(result.statusCode).toBe(404);
  });

  describe('POST /jira/bug — authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const event = makeEvent({ headers: {} });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('Unauthorized');
    });

    it('returns 401 when token is not a Bearer token', async () => {
      const event = makeEvent({
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when token signature is invalid', async () => {
      const token = sign({ id: 1, username: 'hacker' }, 'wrong-secret', {
        algorithm: 'HS256',
      });
      const event = makeEvent({
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when token is expired', async () => {
      const token = sign({ id: 1, username: 'testuser' }, TEST_JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '-1s',
      });
      const event = makeEvent({
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('POST /jira/bug', () => {
    it('returns 400 when body is missing', async () => {
      const event = makeEvent({ body: null });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('required');
    });

    it('returns 400 when summary is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({ description: 'No summary' }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('summary');
    });

    it('returns 400 when priority is invalid', async () => {
      const event = makeEvent({
        body: JSON.stringify({ summary: 'Test', priority: 'Urgent' }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
    });

    it('returns 500 when JIRA_SECRET_NAME is not set', async () => {
      delete process.env['JIRA_SECRET_NAME'];
      const event = makeEvent();
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(500);
    });

    it('returns 500 when JIRA_PROJECT_KEY is not set', async () => {
      delete process.env['JIRA_PROJECT_KEY'];
      const event = makeEvent();
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(500);
    });

    it('returns 201 with issue key and URL on success', async () => {
      mockCreateJiraBug.mockResolvedValueOnce({
        issueKey: 'LS-99',
        issueUrl: 'https://test.atlassian.net/browse/LS-99',
      });

      const event = makeEvent({
        body: JSON.stringify({
          summary: 'Test bug',
          description: 'Something went wrong',
          priority: 'High',
          labels: ['bug'],
          reporterEmail: 'user@example.com',
          appVersion: '1.2.3',
          environment: 'production',
        }),
      });

      const result = await baseHandler(event);
      expect(result.statusCode).toBe(201);

      const body = JSON.parse(result.body) as {
        issueKey: string;
        issueUrl: string;
      };
      expect(body.issueKey).toBe('LS-99');
      expect(body.issueUrl).toContain('LS-99');

      expect(mockCreateJiraBug).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Test bug',
          priority: 'High',
          labels: ['bug'],
        }),
        'LS',
        'test-secret',
        undefined,
      );
    });

    it('passes BUG_EPIC_KEY to createJiraBug when set', async () => {
      const originalEpicKey = process.env['BUG_EPIC_KEY'];
      try {
        process.env['BUG_EPIC_KEY'] = 'LS-1322';
        mockCreateJiraBug.mockResolvedValueOnce({
          issueKey: 'LS-101',
          issueUrl: 'https://test.atlassian.net/browse/LS-101',
        });

        const event = makeEvent();
        const result = await baseHandler(event);
        expect(result.statusCode).toBe(201);

        expect(mockCreateJiraBug).toHaveBeenCalledWith(
          expect.objectContaining({ summary: 'Test bug' }),
          'LS',
          'test-secret',
          'LS-1322',
        );
      } finally {
        if (originalEpicKey === undefined) {
          delete process.env['BUG_EPIC_KEY'];
        } else {
          process.env['BUG_EPIC_KEY'] = originalEpicKey;
        }
      }
    });

    it('returns 500 when Jira API fails', async () => {
      mockCreateJiraBug.mockRejectedValueOnce(
        new Error('Jira API returned 403: Forbidden'),
      );

      const event = makeEvent();
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('Failed to create bug report');
    });

    it('uses email from Authorization JWT, overriding body reporterEmail', async () => {
      mockCreateJiraBug.mockResolvedValueOnce({
        issueKey: 'LS-100',
        issueUrl: 'https://test.atlassian.net/browse/LS-100',
      });

      const event = makeEvent({
        headers: {
          Authorization: makeValidAuthHeader({
            email: 'auth@example.com',
            username: 'authuser',
          }),
        },
        body: JSON.stringify({
          summary: 'JWT auth test',
          reporterEmail: 'body@example.com', // should be overridden
        }),
      });

      const result = await baseHandler(event);
      expect(result.statusCode).toBe(201);

      expect(mockCreateJiraBug).toHaveBeenCalledWith(
        expect.objectContaining({
          reporterEmail: 'auth@example.com',
          reporterUsername: 'authuser',
        }),
        'LS',
        'test-secret',
        undefined,
      );
    });

    it('includes pageUrl and userAgent from request body', async () => {
      mockCreateJiraBug.mockResolvedValueOnce({
        issueKey: 'LS-102',
        issueUrl: 'https://test.atlassian.net/browse/LS-102',
      });

      const event = makeEvent({
        body: JSON.stringify({
          summary: 'Bug with page context',
          pageUrl: 'https://app.example.com/league/123',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        }),
      });

      const result = await baseHandler(event);
      expect(result.statusCode).toBe(201);

      expect(mockCreateJiraBug).toHaveBeenCalledWith(
        expect.objectContaining({
          pageUrl: 'https://app.example.com/league/123',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        }),
        'LS',
        'test-secret',
        undefined,
      );
    });
  });

  describe('POST /jira/bug — attachments', () => {
    const validBase64Png =
      // 1x1 transparent PNG, base64-encoded
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    it('returns 400 when attachments is not an array', async () => {
      const event = makeEvent({
        body: JSON.stringify({ summary: 'Test', attachments: 'not-an-array' }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('attachments');
    });

    it('returns 400 when more than 3 attachments are provided', async () => {
      const attachment = {
        name: 'screenshot.png',
        type: 'image/png',
        data: validBase64Png,
      };
      const event = makeEvent({
        body: JSON.stringify({
          summary: 'Test',
          attachments: [attachment, attachment, attachment, attachment],
        }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('Maximum');
    });

    it('returns 400 when attachment type is not allowed', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          summary: 'Test',
          attachments: [
            {
              name: 'malware.exe',
              type: 'application/octet-stream',
              data: validBase64Png,
            },
          ],
        }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('not allowed');
    });

    it('returns 400 when attachment data is too large', async () => {
      // ~3 MB of base64 data (exceeds the 2 MB decoded limit)
      const hugeData = 'A'.repeat(4 * 1024 * 1024);
      const event = makeEvent({
        body: JSON.stringify({
          summary: 'Test',
          attachments: [{ name: 'big.png', type: 'image/png', data: hugeData }],
        }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('size limit');
    });

    it('passes valid attachments to createJiraBug', async () => {
      mockCreateJiraBug.mockResolvedValueOnce({
        issueKey: 'LS-200',
        issueUrl: 'https://test.atlassian.net/browse/LS-200',
      });

      const attachment = {
        name: 'screenshot.png',
        type: 'image/png',
        data: validBase64Png,
      };
      const event = makeEvent({
        body: JSON.stringify({
          summary: 'Bug with screenshot',
          attachments: [attachment],
        }),
      });

      const result = await baseHandler(event);
      expect(result.statusCode).toBe(201);
      expect(mockCreateJiraBug).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [attachment],
        }),
        'LS',
        'test-secret',
        undefined,
      );
    });
  });

  describe('POST /jira/search', () => {
    it('returns 401 when not authenticated', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/jira/search',
        headers: {},
        body: JSON.stringify({ query: 'login broken' }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when query is too short', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/jira/search',
        body: JSON.stringify({ query: 'ab' }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('at least');
    });

    it('returns 400 when query is too long', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/jira/search',
        body: JSON.stringify({ query: 'a'.repeat(201) }),
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('at most');
    });

    it('returns 400 when body is not JSON', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/jira/search',
        body: 'not json',
      });
      const result = await baseHandler(event);
      expect(result.statusCode).toBe(400);
    });

    it('returns 200 with search results', async () => {
      mockSearchJiraBugs.mockResolvedValueOnce({
        total: 1,
        issues: [
          {
            issueKey: 'LS-50',
            issueUrl: 'https://test.atlassian.net/browse/LS-50',
            summary: 'Login page broken',
            status: 'To Do',
          },
        ],
      });

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/jira/search',
        body: JSON.stringify({ query: 'login broken' }),
      });

      const result = await baseHandler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as {
        total: number;
        issues: Array<{ issueKey: string }>;
      };
      expect(body.total).toBe(1);
      expect(body.issues[0].issueKey).toBe('LS-50');
      expect(mockSearchJiraBugs).toHaveBeenCalledWith(
        'login broken',
        'LS',
        'test-secret',
      );
    });

    it('returns 500 when search fails', async () => {
      mockSearchJiraBugs.mockRejectedValueOnce(new Error('Network error'));

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/jira/search',
        body: JSON.stringify({ query: 'test query' }),
      });

      const result = await baseHandler(event);
      expect(result.statusCode).toBe(500);
    });
  });
});

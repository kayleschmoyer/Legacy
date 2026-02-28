import type { APIGatewayEvent } from 'aws-lambda';
import { createJiraBug } from './JiraClient';
import { baseHandler } from './index';

// jest.mock calls are hoisted before imports by babel-jest at runtime
jest.mock('@legacy-sports/sentry', () => ({
  getSentryConfigFromEnv: () => null,
  initSentry: jest.fn(),
  withSentry: (fn: unknown) => fn,
  captureError: jest.fn(),
}));

// Mock the Jira client
jest.mock('./JiraClient', () => ({
  createJiraBug: jest.fn(),
}));

const mockCreateJiraBug = createJiraBug as jest.MockedFunction<
  typeof createJiraBug
>;

function makeEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  return {
    httpMethod: 'POST',
    path: '/jira/bug',
    body: JSON.stringify({ summary: 'Test bug' }),
    headers: {},
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
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['JIRA_SECRET_NAME'] = 'test-secret';
    process.env['JIRA_PROJECT_KEY'] = 'LS';
  });

  afterEach(() => {
    delete process.env['JIRA_SECRET_NAME'];
    delete process.env['JIRA_PROJECT_KEY'];
  });

  it('returns 200 for OPTIONS (CORS preflight)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await baseHandler(event);
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
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
      );
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
  });
});

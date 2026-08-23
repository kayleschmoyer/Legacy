import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * The hosted Lambda serves its own tool reference at GET /docs, gated behind the
 * same bearer its tools require. These cover the gate and the routing: a docs
 * request must never be answered before auth, and a non-docs request must fall
 * through to the MCP transport untouched.
 */

const mockAuthenticate =
  jest.fn<() => Promise<{ statusCode: number; body: string } | null>>();

jest.mock('@legacy-sports/mcp-bearer-auth', () => ({
  MCP_SCOPE: { rollbar: 'mcp/rollbar' },
  authenticateMcpRequest: () => mockAuthenticate(),
  handleOAuthMetadataRequest: () => null,
  extractCaller: () => null,
}));

const docsEvent = (method = 'GET', rawPath = '/docs') =>
  ({
    rawPath,
    rawQueryString: '',
    headers: {},
    requestContext: { http: { method }, domainName: 'example.test' },
  }) as never;

describe('rollbar lambda GET /docs', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
    jest.resetModules();
  });

  it('serves the tool reference to an authenticated caller', async () => {
    mockAuthenticate.mockResolvedValue(null);

    const { handler } = await import('./lambda.js');
    const response = (await handler(docsEvent())) as {
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('<title>Rollbar MCP Tools</title>');
    expect(response.body).toContain('rollbar_list_items');
  });

  it('returns the auth error instead of the page when the bearer is rejected', async () => {
    const authError = { statusCode: 200, body: '{"error":"unauthorized"}' };
    mockAuthenticate.mockResolvedValue(authError);

    const { handler } = await import('./lambda.js');
    const response = await handler(docsEvent());

    expect(response).toBe(authError);
  });

  it('leaves non-docs paths to the MCP transport', async () => {
    mockAuthenticate.mockResolvedValue(null);

    const { handler } = await import('./lambda.js');
    const response = (await handler(docsEvent('POST', '/'))) as {
      headers?: Record<string, string>;
    };

    expect(response.headers?.['content-type']).not.toBe(
      'text/html; charset=utf-8',
    );
  });
});

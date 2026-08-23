import { handleMcpDocsRequest } from './index';

const PAGE = '<title>Test MCP Tools</title><p>hello</p>';

/** Minimal API Gateway v2 event shape the handler reads. */
const event = (method: string, rawPath: string) =>
  ({ rawPath, requestContext: { http: { method } } }) as never;

describe('handleMcpDocsRequest', () => {
  it('serves the page for GET /docs', () => {
    const response = handleMcpDocsRequest(event('GET', '/docs'), PAGE);

    expect(response).not.toBeNull();
    expect(response).toMatchObject({ statusCode: 200, body: PAGE });
    expect(response?.headers?.['content-type']).toBe(
      'text/html; charset=utf-8',
    );
  });

  it.each(['/docs/', '/docs/index.html'])('also serves %s', (path) => {
    expect(handleMcpDocsRequest(event('GET', path), PAGE)).toMatchObject({
      statusCode: 200,
      body: PAGE,
    });
  });

  it('answers HEAD with headers but no body', () => {
    const response = handleMcpDocsRequest(event('HEAD', '/docs'), PAGE);

    expect(response).toMatchObject({ statusCode: 200, body: '' });
  });

  it('sets a content-security-policy that allows only the font host', () => {
    const csp = handleMcpDocsRequest(event('GET', '/docs'), PAGE)?.headers?.[
      'content-security-policy'
    ] as string;

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).not.toContain('connect-src');
  });

  it('never caches, so a redeployed page is never served stale', () => {
    expect(
      handleMcpDocsRequest(event('GET', '/docs'), PAGE)?.headers?.[
        'cache-control'
      ],
    ).toBe('no-store');
  });

  // Returning null (not a 404) is what leaves every other path to the MCP
  // transport — the JSON-RPC endpoint must keep working untouched.
  it.each([
    ['POST', '/docs'],
    ['GET', '/'],
    ['GET', '/docs-other'],
    ['GET', '/.well-known/oauth-protected-resource'],
    ['DELETE', '/docs'],
  ])('returns null for %s %s', (method, path) => {
    expect(handleMcpDocsRequest(event(method, path), PAGE)).toBeNull();
  });

  it('ignores a query string on the docs path', () => {
    expect(
      handleMcpDocsRequest(event('GET', '/docs?theme=dark'), PAGE),
    ).not.toBeNull();
  });

  it('tolerates a missing path and method', () => {
    expect(
      handleMcpDocsRequest({ requestContext: {} } as never, PAGE),
    ).toBeNull();
  });
});

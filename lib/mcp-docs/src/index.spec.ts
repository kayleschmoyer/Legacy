import { createHash } from 'node:crypto';
import { handleMcpDocsRequest, type McpDocsCsp } from './index';

const STYLE_BLOCK = 'body { color: red; }';
const SCRIPT_BLOCK = "console.log('hi');";
const PAGE = `<title>Test MCP Tools</title><style>${STYLE_BLOCK}</style><p>hello</p><script>${SCRIPT_BLOCK}</script>`;

/** sha256-<base64>, independently of anything in the generator. */
function hashSource(content: string): string {
  return `sha256-${createHash('sha256').update(content, 'utf-8').digest('base64')}`;
}

const CSP: McpDocsCsp = {
  styleSrc: [hashSource(STYLE_BLOCK)],
  scriptSrc: [hashSource(SCRIPT_BLOCK)],
};

/** Minimal API Gateway v2 event shape the handler reads. */
const event = (method: string, rawPath: string) =>
  ({ rawPath, requestContext: { http: { method } } }) as never;

describe('handleMcpDocsRequest', () => {
  it('serves the page for GET /docs', () => {
    const response = handleMcpDocsRequest(event('GET', '/docs'), PAGE, CSP);

    expect(response).not.toBeNull();
    expect(response).toMatchObject({ statusCode: 200, body: PAGE });
    expect(response?.headers?.['content-type']).toBe(
      'text/html; charset=utf-8',
    );
  });

  it.each(['/docs/', '/docs/index.html'])('also serves %s', (path) => {
    expect(handleMcpDocsRequest(event('GET', path), PAGE, CSP)).toMatchObject({
      statusCode: 200,
      body: PAGE,
    });
  });

  it('answers HEAD with headers but no body', () => {
    const response = handleMcpDocsRequest(event('HEAD', '/docs'), PAGE, CSP);

    expect(response).toMatchObject({ statusCode: 200, body: '' });
  });

  it('sets a content-security-policy that allows only the font host and the hashed inline blocks', () => {
    const csp = handleMcpDocsRequest(event('GET', '/docs'), PAGE, CSP)
      ?.headers?.['content-security-policy'] as string;

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).not.toContain('connect-src');
  });

  it('carries no unsafe-inline, and its digests match the inline blocks actually present in the page', () => {
    const csp = handleMcpDocsRequest(event('GET', '/docs'), PAGE, CSP)
      ?.headers?.['content-security-policy'] as string;

    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain(`style-src '${hashSource(STYLE_BLOCK)}'`);
    expect(csp).toContain(`script-src '${hashSource(SCRIPT_BLOCK)}'`);
  });

  it('never caches, so a redeployed page is never served stale', () => {
    expect(
      handleMcpDocsRequest(event('GET', '/docs'), PAGE, CSP)?.headers?.[
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
    expect(handleMcpDocsRequest(event(method, path), PAGE, CSP)).toBeNull();
  });

  it('ignores a query string on the docs path', () => {
    expect(
      handleMcpDocsRequest(event('GET', '/docs?theme=dark'), PAGE, CSP),
    ).not.toBeNull();
  });

  it('tolerates a missing path and method', () => {
    expect(
      handleMcpDocsRequest({ requestContext: {} } as never, PAGE, CSP),
    ).toBeNull();
  });
});

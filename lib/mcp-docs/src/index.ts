import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

/**
 * Serves a hosted MCP server's own tool reference over HTTP — the Swagger-UI
 * equivalent for these JSON-RPC endpoints.
 *
 * The page is generated at build time from the server sources by
 * `scripts/generate-mcp-api-reference.mjs` (see `src/pages/*.generated.ts`) and
 * embedded in the Lambda bundle, so serving it needs no filesystem, no network,
 * and no runtime parsing.
 *
 * Deliberately gated: callers must pass the same Cognito bearer the tools
 * require, so this must be invoked AFTER `authenticateMcpRequest`. Tool
 * descriptions name internal buckets, workflows, and ticket keys, and a public
 * docs route would publish all of it to anyone holding the API Gateway URL.
 */

/** Paths that serve the reference. */
const DOCS_PATHS = new Set(['/docs', '/docs/', '/docs/index.html']);

/**
 * sha256 hash-sources for every inline `<style>`/`<script>` block in a
 * generated docs page, computed at build time by
 * `scripts/generate-mcp-api-reference.mjs` and exported as `CSP` alongside
 * `PAGE` from each `lib/mcp-docs/src/pages/*.generated.ts` module. The page
 * and its CSP are generated together and must be passed to
 * {@link handleMcpDocsRequest} as a pair.
 */
export interface McpDocsCsp {
  readonly styleSrc: readonly string[];
  readonly scriptSrc: readonly string[];
}

/**
 * Handle a docs request, or return null when the request is not one.
 *
 * Returning null (rather than a 404) leaves every other path to the MCP
 * transport, exactly like the OAuth-metadata branch alongside it.
 */
export function handleMcpDocsRequest(
  event: Pick<APIGatewayProxyEventV2, 'rawPath' | 'requestContext'>,
  page: string,
  csp: McpDocsCsp,
): APIGatewayProxyStructuredResultV2 | null {
  const method = event.requestContext?.http?.method;
  if (method !== 'GET' && method !== 'HEAD') return null;

  const path = normalizePath(event.rawPath);
  if (!DOCS_PATHS.has(path)) return null;

  const styleSrc = [...csp.styleSrc.map(quote), 'https://fonts.googleapis.com'];
  const scriptSrc = csp.scriptSrc.map(quote);

  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // The page is regenerated on every deploy and is small enough that a
      // stale copy is never worth the confusion of debugging against it.
      'cache-control': 'no-store',
      // Served to a browser, so keep the usual hardening on: the page is
      // fully self-contained apart from the Google Fonts stylesheet. Inline
      // style/script blocks are allowed by exact sha256 hash rather than
      // 'unsafe-inline' — the hashes come from the same generation step
      // that produced `page`, so they always match what's actually inline.
      'content-security-policy':
        `default-src 'none'; style-src ${styleSrc.join(' ')}; ` +
        `font-src https://fonts.gstatic.com; script-src ${scriptSrc.join(' ')}; img-src data:`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
    body: method === 'HEAD' ? '' : page,
  };
}

/** Wrap a `sha256-<base64>` hash-source in the quotes CSP requires. */
function quote(hashSource: string): string {
  return `'${hashSource}'`;
}

/** Strip a stage prefix and any trailing slash noise from the request path. */
function normalizePath(rawPath: string | undefined): string {
  if (!rawPath) return '/';
  const path = rawPath.split('?')[0] ?? '/';
  return path.length > 1 ? path.replace(/\/{2,}/g, '/') : path;
}

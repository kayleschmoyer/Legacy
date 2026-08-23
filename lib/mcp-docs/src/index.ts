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
 * Handle a docs request, or return null when the request is not one.
 *
 * Returning null (rather than a 404) leaves every other path to the MCP
 * transport, exactly like the OAuth-metadata branch alongside it.
 */
export function handleMcpDocsRequest(
  event: Pick<APIGatewayProxyEventV2, 'rawPath' | 'requestContext'>,
  page: string,
): APIGatewayProxyStructuredResultV2 | null {
  const method = event.requestContext?.http?.method;
  if (method !== 'GET' && method !== 'HEAD') return null;

  const path = normalizePath(event.rawPath);
  if (!DOCS_PATHS.has(path)) return null;

  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // The page is regenerated on every deploy and is small enough that a
      // stale copy is never worth the confusion of debugging against it.
      'cache-control': 'no-store',
      // Served to a browser, so keep the usual hardening on: the page is
      // fully self-contained apart from the Google Fonts stylesheet.
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; img-src data:",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
    body: method === 'HEAD' ? '' : page,
  };
}

/** Strip a stage prefix and any trailing slash noise from the request path. */
function normalizePath(rawPath: string | undefined): string {
  if (!rawPath) return '/';
  const path = rawPath.split('?')[0] ?? '/';
  return path.length > 1 ? path.replace(/\/{2,}/g, '/') : path;
}

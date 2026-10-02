import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  captureWarning,
} from '@legacy-sports/rollbar';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils/node';

/**
 * Origins permitted to make cross-origin requests to this API.
 * Reads from the CORS_ALLOWED_ORIGINS env var (comma-separated list).
 * Defaults to the production web domain when the env var is not set.
 */
function getAllowedOrigins(): Set<string> {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? 'https://legacy-fantasy.com';
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

// Matches http(s)://localhost or http(s)://127.0.0.1 on any port (or no
// port). Local dev/preview tooling (vite, vite preview, storybook, a
// worktree's own dev server, Playwright's webServer health check, ...) picks
// an arbitrary port per app/session, so a growing exact-match list of ports
// in CORS_ALLOWED_ORIGINS goes stale every time a new one shows up — see
// LS-4546, LS-9160, LS-8342, LS-10065, all filed for exactly this reason.
const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * True if `origin` should be treated as allowed: either an exact match in
 * `allowed`, or — only when CORS_ALLOW_ANY_LOCALHOST_PORT is enabled, which
 * is wired to "true" for the dev environment only (see
 * terraform/main/lambda-graphql.tf) — any localhost/127.0.0.1 origin
 * regardless of port. Production/staging never set that env var, so origin
 * matching there stays exact-match only.
 */
function isOriginAllowed(origin: string, allowed: Set<string>): boolean {
  if (allowed.has(origin)) {
    return true;
  }
  return (
    process.env.CORS_ALLOW_ANY_LOCALHOST_PORT === 'true' &&
    LOCALHOST_ORIGIN_PATTERN.test(origin)
  );
}

/**
 * True if `origin` is this API's own origin (derived from the request's Host
 * header, so there is no static list to go stale). A same-origin request needs
 * no CORS headers, so it is neither reflected nor worth a Rollbar warning —
 * Rollbar #215 (LS-9160, LS-10065, LS-10373) was `https://api.legacy-fantasy.com`
 * hitting `https://api.legacy-fantasy.com`, e.g. a page or scanner that sends
 * Origin equal to Host.
 */
function isSameOrigin(event: APIGatewayProxyEvent, origin: string): boolean {
  const host = event.headers?.Host ?? event.headers?.host;
  return !!host && origin.toLowerCase() === `https://${host.toLowerCase()}`;
}

/**
 * Build CORS + security headers for a request, reflecting the validated origin.
 * If the request origin is not in the allowlist, Access-Control-Allow-Origin is
 * omitted so the browser rejects the cross-origin response. A same-origin
 * request is also left without Access-Control-Allow-Origin (the browser does
 * not need it) but is not reported as a rejection.
 */
export function getCorsHeaders(
  event: APIGatewayProxyEvent,
): Record<string, string> {
  const origin = event.headers?.Origin ?? event.headers?.origin;
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, apollo-require-preflight, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'none'",
  };
  if (origin && isOriginAllowed(origin, allowed)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  } else if (origin && !isSameOrigin(event, origin)) {
    LOGGER.warn(
      'CORS: rejected unrecognized origin — check CORS_ALLOWED_ORIGINS env var',
      { origin },
    );
    captureWarning(new Error('CORS: rejected unrecognized origin'), {
      origin,
      allowedOrigins: [...allowed],
    });
  }
  return headers;
}

// Static base headers for backward compatibility; does not include
// Access-Control-Allow-Origin (which requires a validated request origin).
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Requested-With, apollo-require-preflight, X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'",
};

/**
 * Wrap the Apollo handler with CORS, health checks, and error handling.
 */
export function createLambdaHandler(
  baseHandler: unknown,
): (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult> {
  return async (
    event: APIGatewayProxyEvent,
    context: Context,
  ): Promise<APIGatewayProxyResult> => {
    LOGGER.debug('GraphQL lambda invoked', {
      httpMethod: event.httpMethod,
      path: event.path,
    });
    addBreadcrumb(`GraphQL request: ${event.httpMethod} ${event.path}`);

    // Ensure Lambda doesn't wait for empty event loop
    context.callbackWaitsForEmptyEventLoop = false;

    // Handle preflight OPTIONS requests
    if (event.httpMethod === 'OPTIONS') {
      LOGGER.debug('Handling OPTIONS preflight request');
      addBreadcrumb('Handling OPTIONS preflight request');
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: '',
      };
    }

    // Handle version/health check endpoint
    if (event.path === '/version' || event.path === '/health') {
      const versionInfo = getVersionInfo('legacy-sports-gql');
      LOGGER.debug('Version endpoint called', versionInfo);

      return {
        statusCode: 200,
        headers: {
          ...getCorsHeaders(event),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'healthy',
          ...versionInfo,
          timestamp: new Date().toISOString(),
          formatted: formatVersionInfo(versionInfo),
        }),
      };
    }

    // shields.io endpoint badge — returns live health JSON consumed directly by the README badge
    if (event.path === '/badge' || event.path === '/dev/badge') {
      return {
        statusCode: 200,
        headers: {
          ...getCorsHeaders(event),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: 1,
          label: 'GraphQL Lambda',
          message: 'healthy',
          color: 'brightgreen',
          cacheSeconds: 60,
          style: 'flat',
        }),
      };
    }

    try {
      LOGGER.debug('Calling Apollo Server handler');

      // Call Apollo Server handler - it may be callback-based despite returning a Promise
      const result = await new Promise<APIGatewayProxyResult>(
        (resolve, reject) => {
          // Define callback function type
          type CallbackFunction = (
            error: unknown,
            result?: APIGatewayProxyResult,
          ) => void;

          const callback: CallbackFunction = (
            error: unknown,
            result?: APIGatewayProxyResult,
          ) => {
            if (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
              reject(new Error(`Apollo Server error: ${errorMessage}`));
            } else if (result) {
              resolve(result);
            } else {
              reject(new Error('No result from Apollo Server'));
            }
          };

          // Type assertion for handler function
          type HandlerFunction = (
            event: APIGatewayProxyEvent,
            context: Context,
            callback: CallbackFunction,
          ) => unknown;

          const callbackResult = (baseHandler as HandlerFunction)(
            event,
            context,
            callback,
          );

          // If it returns a Promise instead, use that
          if (
            callbackResult &&
            typeof callbackResult === 'object' &&
            callbackResult !== null
          ) {
            const maybePromise = callbackResult as { then?: unknown };
            if (typeof maybePromise.then === 'function') {
              const promiseResult =
                callbackResult as Promise<APIGatewayProxyResult>;
              void promiseResult.then(resolve).catch(reject);
            }
          }
        },
      );

      LOGGER.debug('Apollo Server result received, adding CORS headers');

      // Ensure result is valid
      if (!result) {
        throw new Error('Apollo Server returned no result');
      }

      // Add CORS headers to the result.
      // Omit Content-Security-Policy for HTML responses (e.g. the Apollo
      // landing page) because "default-src 'none'" blocks its scripts/styles.
      const corsHeaders = getCorsHeaders(event);
      const resultCt =
        (result.headers?.['Content-Type'] as string | undefined) ??
        (result.headers?.['content-type'] as string | undefined) ??
        '';
      if (resultCt.includes('text/html')) {
        delete corsHeaders['Content-Security-Policy'];
      }
      return {
        ...result,
        headers: {
          ...corsHeaders,
          ...(result.headers ?? {}),
        },
      };
    } catch (error) {
      LOGGER.error('GraphQL lambda handler error', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Capture error with request context
      captureError(error as Error, {
        httpMethod: event.httpMethod,
        path: event.path,
        query: event.queryStringParameters,
        headers: event.headers,
        operation: 'graphql_request',
      });

      return {
        statusCode: 500,
        headers: {
          ...getCorsHeaders(event),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Internal server error',
        }),
      };
    }
  };
}

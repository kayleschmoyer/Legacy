import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { addBreadcrumb, captureError } from '@legacy-sports/rollbar';
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

/**
 * Build CORS + security headers for a request, reflecting the validated origin.
 * If the request origin is not in the allowlist, Access-Control-Allow-Origin is
 * omitted so the browser rejects the cross-origin response.
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
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
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

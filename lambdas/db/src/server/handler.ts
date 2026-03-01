import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { addBreadcrumb, captureError } from '@legacy-sports/sentry';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils';

// CORS headers constant
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Requested-With, apollo-require-preflight',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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
        headers: CORS_HEADERS,
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
          ...CORS_HEADERS,
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
          ...CORS_HEADERS,
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

      // Add CORS headers to the result
      return {
        ...result,
        headers: {
          ...CORS_HEADERS,
          ...(result.headers || {}),
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
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  };
}

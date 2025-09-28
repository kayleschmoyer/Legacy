import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  handleGoogleAuth,
  handleGoogleRefresh,
  handleSecureGoogleAuth,
} from './handlers/Google';
import { handleLogin, handleRegister } from './handlers/Local';
import { handleVerify } from './handlers/Verify';

/**
 * Add CORS headers to API Gateway response
 */
function addCorsHeaders(result: APIGatewayProxyResult): APIGatewayProxyResult {
  return {
    ...result,
    headers: {
      ...result.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
  };
}

/**
 * Handle OPTIONS preflight requests for CORS
 */
function handleOptions(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: '',
  };
}

/**
 * Main Lambda handler that routes requests to appropriate handlers
 *
 * Log Levels:
 * Use the LOG_LEVEL environment variable to control logging verbosity:
 * - debug: Most verbose, shows all operations and state changes
 * - info: Standard operational messages (default)
 * - warn: Warning conditions
 * - error: Error conditions
 * - fatal: Critical failures
 *
 * Previously controlled by VERBOSE_LOGGING=true, now use LOG_LEVEL=debug for same effect
 */
export const handler = async (
  event: APIGatewayEvent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  // Enhanced logging version - 2025-09-26
  LOGGER.info(
    `OAuth Proxy Handler - Method: ${event.httpMethod}, Path: ${event.path}`,
  );

  LOGGER.debug('Environment Variables Check:', {
    CLIENT_ID: process.env.CLIENT_ID ? '[SET]' : '[MISSING]',
    GOOGLE_OAUTH_CLIENT_SECRET_PATH: process.env.GOOGLE_OAUTH_CLIENT_SECRET_PATH
      ? '[SET]'
      : '[MISSING]',
    JWT_SECRET_KEY_PATH: process.env.JWT_SECRET_KEY_PATH
      ? '[SET]'
      : '[MISSING]',
    COOKIE_SECRET_KEY_PATH: process.env.COOKIE_SECRET_KEY_PATH
      ? '[SET]'
      : '[MISSING]',
    NODE_ENV: process.env.NODE_ENV,
    AWS_REGION: process.env.AWS_REGION,
  });
  LOGGER.debug('Request Details:', {
    headers: event.headers,
    body: event.body ? '[BODY_PRESENT]' : '[NO_BODY]',
    queryStringParameters: event.queryStringParameters,
  });

  try {
    // Handle OPTIONS preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return handleOptions();
    }

    // Route to appropriate handler based on path
    switch (event.path) {
      case '/oauth':
      case '/dev/oauth':
        // Root OAuth path - could be used for health checks or general info
        return addCorsHeaders({
          statusCode: 200,
          body: JSON.stringify({
            message: 'Secure OAuth Proxy Service',
            description:
              'OAuth authentication with user pre-authorization security',
            endpoints: [
              '/oauth/verify',
              '/oauth/google (NEW: secure flow with user pre-check)',
              '/oauth/google/legacy (original flow for backward compatibility)',
              '/oauth/google/refresh',
              '/oauth/login',
              '/oauth/register',
            ],
            security:
              'Only pre-authorized users can complete OAuth authentication',
            note: 'User management is handled internally during authentication flow',
          }),
        });

      case '/oauth/verify':
      case '/dev/oauth/verify':
        if (event.httpMethod === 'POST') {
          const result = await handleVerify(event);
          return addCorsHeaders(result);
        }
        break;

      case '/oauth/google':
      case '/dev/oauth/google':
        if (event.httpMethod === 'POST') {
          // Use the new secure authentication flow that checks user existence first
          const result = await handleSecureGoogleAuth(event);
          return addCorsHeaders(result);
        }
        break;

      // Legacy OAuth endpoint (for backward compatibility during migration)
      case '/oauth/google/legacy':
      case '/dev/oauth/google/legacy':
        if (event.httpMethod === 'POST') {
          const result = await handleGoogleAuth(event);
          return addCorsHeaders(result);
        }
        break;

      case '/oauth/google/refresh':
      case '/dev/oauth/google/refresh':
        if (event.httpMethod === 'POST') {
          const result = await handleGoogleRefresh(event);
          return addCorsHeaders(result);
        }
        break;

      case '/oauth/login':
      case '/dev/oauth/login':
        if (event.httpMethod === 'POST') {
          const result = await handleLogin(event);
          return addCorsHeaders(result);
        }
        break;

      case '/oauth/register':
      case '/dev/oauth/register':
        if (event.httpMethod === 'POST') {
          const result = await handleRegister(event);
          return addCorsHeaders(result);
        }
        break;

      default:
        LOGGER.warn(`Unknown path: ${event.path}`);
        return addCorsHeaders({
          statusCode: 404,
          body: JSON.stringify({ error: 'Not Found' }),
        });
    }

    // Method not allowed
    return addCorsHeaders({
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    });
  } catch (error) {
    LOGGER.error(
      'OAuth Proxy Handler Error:',
      error instanceof Error ? error.message : String(error),
    );

    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    });
  }
};

// Export individual handlers for backward compatibility and testing
export * from './handlers/Google';
export * from './handlers/Local';
export * from './handlers/Verify';

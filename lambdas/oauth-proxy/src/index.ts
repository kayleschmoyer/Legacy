import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils/node';
import {
  handleGoogleAuth,
  handleGoogleAuthorize,
  handleGoogleCallback,
  handleGoogleRefresh,
  handleSecureGoogleAuth,
} from './handlers/Google';
import { handleLogin, handleRegister } from './handlers/Local';
import { handleVerify } from './handlers/Verify';
import { handleRefreshJwt } from './handlers/RefreshJwt';
import {
  handleDeviceAuthorize,
  handleDeviceCompleteLocal,
  handleDeviceToken,
  handleDeviceVerify,
} from './handlers/DeviceFlow';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

/**
 * Origins permitted to make cross-origin requests.
 * Reads from CORS_ALLOWED_ORIGINS env var (comma-separated list).
 * Defaults to the production web domain when not set.
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

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  // Security headers
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'",
};

function getCorsHeaders(event: APIGatewayEvent): Record<string, string> {
  const origin = event.headers?.Origin ?? event.headers?.origin;
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = { ...BASE_CORS_HEADERS };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

/**
 * Add CORS and security headers to API Gateway response.
 * Content-Security-Policy is omitted for HTML responses because
 * "default-src 'none'" would block inline styles/scripts used by OAuth pages.
 */
function addCorsHeaders(
  result: APIGatewayProxyResult,
  event: APIGatewayEvent,
): APIGatewayProxyResult {
  const corsHeaders = getCorsHeaders(event);
  const ct =
    (result.headers?.['Content-Type'] as string | undefined) ??
    (result.headers?.['content-type'] as string | undefined) ??
    '';
  if (ct.includes('text/html')) {
    delete corsHeaders['Content-Security-Policy'];
  }
  return {
    ...result,
    headers: {
      ...result.headers,
      ...corsHeaders,
    },
  };
}

/**
 * Handle OPTIONS preflight requests for CORS
 */
function handleOptions(event: APIGatewayEvent): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: getCorsHeaders(event),
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
const baseOAuthHandler = async (
  event: APIGatewayEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  // Request-scoped CORS helpers that close over the incoming origin
  const cors = (r: APIGatewayProxyResult) => addCorsHeaders(r, event);
  const options = () => handleOptions(event);

  // Enhanced logging version - 2025-09-26
  LOGGER.info(
    `OAuth Proxy Handler - Method: ${event.httpMethod}, Path: ${event.path}`,
  );
  addBreadcrumb(`OAuth request: ${event.httpMethod} ${event.path}`);

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
      return options();
    }

    // Route to appropriate handler based on path
    switch (event.path) {
      case '/oauth/version':
      case '/dev/oauth/version':
      case '/oauth/health':
      case '/dev/oauth/health': {
        // Version and health check endpoint
        const versionInfo = getVersionInfo('legacy-sports-oauth-proxy');
        LOGGER.debug('Version endpoint called', versionInfo);

        return cors({
          statusCode: 200,
          body: JSON.stringify({
            status: 'healthy',
            ...versionInfo,
            timestamp: new Date().toISOString(),
            formatted: formatVersionInfo(versionInfo),
          }),
        });
      }

      case '/oauth/badge':
      case '/dev/oauth/badge': {
        // shields.io endpoint badge — returns live health JSON consumed directly by the README badge
        return cors({
          statusCode: 200,
          body: JSON.stringify({
            schemaVersion: 1,
            label: 'OAuth Proxy Lambda',
            message: 'healthy',
            color: 'brightgreen',
            cacheSeconds: 60,
            style: 'flat',
          }),
        });
      }

      case '/oauth':
      case '/dev/oauth':
        // Root OAuth path - could be used for health checks or general info
        return cors({
          statusCode: 200,
          body: JSON.stringify({
            message: 'Secure OAuth Proxy Service',
            description:
              'OAuth authentication with automatic user provisioning',
            endpoints: [
              '/oauth/version (version information)',
              '/oauth/health (health check)',
              '/oauth/verify',
              '/oauth/google (secure flow with auto-provisioning)',
              '/oauth/google/legacy (original flow for backward compatibility)',
              '/oauth/google/authorize (OAuth initiation)',
              '/oauth/google/callback (OAuth callback)',
              '/oauth/google/refresh',
              '/oauth/refresh-jwt (silent JWT refresh for live sessions)',
              '/oauth/login',
              '/oauth/register',
              '/oauth/device/authorize (CLI device flow)',
              '/oauth/device/token (CLI device flow)',
              '/oauth/device/verify (CLI device flow)',
              '/oauth/device/complete-local (CLI device flow with local auth)',
            ],
            security:
              'New users are automatically created on first OAuth login with default access level',
            note: 'User management is handled internally during authentication flow',
          }),
        });

      case '/oauth/verify':
      case '/dev/oauth/verify':
        if (event.httpMethod === 'POST') {
          const result = await handleVerify(event);
          return cors(result);
        }
        break;

      case '/oauth/google':
      case '/dev/oauth/google':
        if (event.httpMethod === 'POST') {
          // Use the new secure authentication flow that checks user existence first
          const result = await handleSecureGoogleAuth(event);
          return cors(result);
        }
        break;

      // Legacy OAuth endpoint (for backward compatibility during migration)
      case '/oauth/google/legacy':
      case '/dev/oauth/google/legacy':
        if (event.httpMethod === 'POST') {
          const result = await handleGoogleAuth(event);
          return cors(result);
        }
        break;

      case '/oauth/google/authorize':
      case '/dev/oauth/google/authorize':
        if (event.httpMethod === 'GET') {
          const result = await handleGoogleAuthorize(event);
          return cors(result);
        }
        break;

      case '/oauth/google/callback':
      case '/dev/oauth/google/callback':
        if (event.httpMethod === 'GET') {
          const result = await handleGoogleCallback(event);
          return cors(result);
        }
        break;

      case '/oauth/google/refresh':
      case '/dev/oauth/google/refresh':
        if (event.httpMethod === 'POST') {
          const result = await handleGoogleRefresh(event);
          return cors(result);
        }
        break;

      case '/oauth/refresh-jwt':
      case '/dev/oauth/refresh-jwt':
        if (event.httpMethod === 'POST') {
          const result = await handleRefreshJwt(event);
          return cors(result);
        }
        break;

      case '/oauth/login':
      case '/dev/oauth/login':
        if (event.httpMethod === 'POST') {
          const result = await handleLogin(event);
          return cors(result);
        }
        break;

      case '/oauth/register':
      case '/dev/oauth/register':
        if (event.httpMethod === 'POST') {
          const result = await handleRegister(event);
          return cors(result);
        }
        break;

      // Device flow endpoints for CLI authentication
      case '/oauth/device/authorize':
      case '/dev/oauth/device/authorize':
        if (event.httpMethod === 'POST') {
          const result = await handleDeviceAuthorize(event);
          return cors(result);
        }
        break;

      case '/oauth/device/token':
      case '/dev/oauth/device/token':
        if (event.httpMethod === 'POST') {
          const result = await handleDeviceToken(event);
          return cors(result);
        }
        break;

      case '/oauth/device/verify':
      case '/dev/oauth/device/verify':
        if (event.httpMethod === 'GET') {
          const result = await handleDeviceVerify(event);
          return cors(result);
        }
        break;

      case '/oauth/device/complete-local':
      case '/dev/oauth/device/complete-local':
        if (event.httpMethod === 'POST') {
          const result = await handleDeviceCompleteLocal(event);
          return cors(result);
        }
        break;

      default:
        LOGGER.warn(`Unknown path: ${event.path}`);
        return cors({
          statusCode: 404,
          body: JSON.stringify({ error: 'Not Found' }),
        });
    }

    // Method not allowed
    return cors({
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    });
  } catch (error) {
    LOGGER.error(
      'OAuth Proxy Handler Error:',
      error instanceof Error ? error.message : String(error),
    );

    // Capture error with request context
    captureError(error as Error, {
      httpMethod: event.httpMethod,
      path: event.path,
      query: event.queryStringParameters,
      headers: event.headers,
      operation: 'oauth_request',
    });

    return cors({
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
      }),
    });
  }
};

// Export the Rollbar-wrapped handler
export const handler = withRollbar(baseOAuthHandler);

// Export individual handlers for backward compatibility and testing
export * from './handlers/Google';
export * from './handlers/Local';
export * from './handlers/Verify';
export * from './handlers/DeviceFlow';
export * from './handlers/RefreshJwt';

import { APIGatewayEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  captureWarning,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { prefetchSecret } from '@legacy-sports/aws-utils';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils/node';
import {
  handleGoogleAuth,
  handleGoogleAuthorize,
  handleGoogleCallback,
  handleGoogleLink,
  handleGoogleUnlink,
  handleSecureGoogleAuth,
} from './handlers/Google';
import {
  handleAppleLink,
  handleAppleUnlink,
  handleSecureAppleAuth,
} from './handlers/Apple';
import { handleLogin, handleRegister } from './handlers/Local';
import {
  handleForgotPassword,
  handleForgotPasswordPage,
  handleResetPassword,
  handleResetPasswordPage,
} from './handlers/PasswordReset';
import { handleVerify } from './handlers/Verify';
import { handleRefreshJwt } from './handlers/RefreshJwt';
import { handleLogout } from './handlers/Logout';
import {
  handleDeviceAuthorize,
  handleDeviceCompleteLocal,
  handleDeviceToken,
  handleDeviceVerify,
} from './handlers/DeviceFlow';
import {
  checkDiscordRedirectUriConfig,
  handleDiscordAuth,
  handleDiscordAuthorize,
  handleDiscordLink,
  handleDiscordUnlink,
} from './handlers/Discord';
import {
  handleImpersonate,
  handleStopImpersonate,
} from './handlers/Impersonate';
import {
  handleMfaDisable,
  handleMfaEnroll,
  handleMfaStatus,
  handleMfaVerifySetup,
} from './handlers/Mfa';
import { handleStepUpVerify } from './handlers/StepUp';
import { handleAndroidDownload } from './handlers/AppDownload';
import { withRateLimit } from './util/rate-limit';
import { describeErrorCause, sanitizeHeaders } from './util/lambda';

// Defense-in-depth rate-limit budgets for auth endpoints. Per-IP, per
// Lambda execution context (see util/rate-limit.ts). Edge throttling
// (API Gateway / WAF) should be layered on top — these are a floor.
const AUTH_RATE_LIMIT = { limit: 5, windowMs: 60 * 1000 };
// Looser than AUTH_RATE_LIMIT: a download is a navigation a tester may retry
// (sign-in bounce, a tap-back, a failed transfer) without it being an attack,
// but still bounded so the route cannot be used to farm presigned URLs.
const DOWNLOAD_RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };
const DEVICE_POLL_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

/**
 * Whether to dump the environment-variable audit and sanitized request headers
 * on every invocation.
 *
 * These are diagnostic aids for a misconfigured deployment, not something the
 * hot path needs. LOG_LEVEL is pinned to `debug` in the deployed environment,
 * so they ran on every request — building the objects, and paying CloudWatch
 * ingest — for output nobody reads outside an investigation. Gated behind an
 * explicit opt-in so turning them on is a deliberate act (LS-9530).
 */
const REQUEST_DUMP_ENABLED = process.env.OAUTH_DEBUG_REQUEST_DUMP === 'true';

// Initialize Rollbar. This is module scope, so it runs during the Lambda INIT
// phase, not per request — despite CloudWatch tagging the "Rollbar initialized"
// line with the first request id. `rollbar.init` resolves its access token from
// Secrets Manager asynchronously (a plaintext token in a Lambda env var failed
// security review in LS-2790), and on a cold VPC container that first outbound
// call outlives INIT and lands mid-invocation. See warmSecrets below for why
// that no longer costs the request anything (LS-9530).
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

/**
 * Start resolving every secret this lambda reads on an auth path, at module
 * scope and all at once.
 *
 * Two things made secret reads expensive on the request path before LS-9530:
 * they were re-read on every invocation, and they were issued one at a time.
 * The JWT signing key alone cost 333 ms on a warm container because it queued
 * behind Rollbar's still-in-flight token fetch on a cold HTTPS agent.
 *
 * Kicking them off together here means they share one TLS handshake to the
 * Secrets Manager VPC endpoint and resolve concurrently during INIT, and
 * `retrieveSecretParameterValue` caches each result (with a TTL) so warm
 * invocations read none of them. A request that arrives before a prefetch
 * settles joins the in-flight promise rather than issuing a duplicate.
 *
 * Failures are deliberately ignored: the real read on the request path is what
 * surfaces them, with its existing error handling.
 */
function warmSecrets(): void {
  const secretNames = [
    process.env.JWT_SECRET_KEY_PATH,
    process.env.COOKIE_SECRET_KEY_PATH,
    process.env.DB_SECRET_NAME,
    process.env.STRIPE_SECRET_KEY_SECRET_NAME,
  ];

  for (const name of secretNames) {
    if (name) prefetchSecret(name);
  }
}

warmSecrets();

// Startup self-check: surface a misconfigured Discord redirect URI at cold
// start (LGN-015 / LS-6670) instead of as a generic exchange failure later.
checkDiscordRedirectUriConfig();

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
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
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
  } else if (origin) {
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

  if (REQUEST_DUMP_ENABLED) {
    LOGGER.debug('Environment Variables Check:', {
      CLIENT_ID: process.env.CLIENT_ID ? '[SET]' : '[MISSING]',
      GOOGLE_OAUTH_CLIENT_SECRET_PATH: process.env
        .GOOGLE_OAUTH_CLIENT_SECRET_PATH
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
      headers: sanitizeHeaders(event.headers),
      body: event.body ? '[BODY_PRESENT]' : '[NO_BODY]',
      queryStringParameters: event.queryStringParameters,
    });
  }

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
              '/oauth/apple (native Sign in with Apple, secure flow)',
              '/oauth/google/authorize (OAuth initiation)',
              '/oauth/google/callback (OAuth callback)',
              '/oauth/refresh-jwt (silent JWT refresh for live sessions)',
              '/oauth/login',
              '/oauth/register',
              '/oauth/forgot-password (request a password-reset link)',
              '/oauth/reset-password (consume a reset token, set new password)',
              '/oauth/device/authorize (CLI device flow)',
              '/oauth/device/token (CLI device flow)',
              '/oauth/device/verify (CLI device flow)',
              '/oauth/device/complete-local (CLI device flow with local auth)',
              '/oauth/impersonate (start admin impersonation session)',
              '/oauth/stop-impersonate (end admin impersonation session)',
              '/oauth/discord/authorize (Discord OAuth initiation)',
              '/oauth/discord (Discord OAuth login)',
              '/oauth/discord/link (link Discord to existing account)',
              '/oauth/discord/unlink (unlink Discord from account)',
              '/oauth/step-up/verify (re-authenticate before sensitive actions)',
              '/oauth/mfa/status (get TOTP enrollment status)',
              '/oauth/mfa/enroll (begin TOTP enrollment)',
              '/oauth/mfa/verify-setup (confirm TOTP enrollment)',
              '/oauth/mfa/disable (disable TOTP 2FA)',
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

      case '/oauth/apple':
      case '/dev/oauth/apple':
        if (event.httpMethod === 'POST') {
          // Native Sign in with Apple — verify the Apple identity token and
          // exchange it for a Legacy Sports JWT (App Store guideline 4.8).
          const result = await handleSecureAppleAuth(event);
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

      case '/oauth/refresh-jwt':
      case '/dev/oauth/refresh-jwt':
        if (event.httpMethod === 'POST') {
          const result = await handleRefreshJwt(event);
          return cors(result);
        }
        break;

      case '/oauth/logout':
      case '/dev/oauth/logout':
        if (event.httpMethod === 'POST') {
          const result = handleLogout(event);
          return cors(result);
        }
        break;

      case '/oauth/download/android':
      case '/dev/oauth/download/android':
        // Browser navigation, not an API call: the response is a 302 to a
        // presigned S3 URL or an HTML page, so it is deliberately not wrapped
        // in cors() — there is no cross-origin caller to satisfy.
        if (event.httpMethod === 'GET') {
          return await withRateLimit(
            event,
            { route: 'oauth.download.android', ...DOWNLOAD_RATE_LIMIT },
            () => handleAndroidDownload(event),
          );
        }
        break;

      case '/oauth/login':
      case '/dev/oauth/login':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.login', ...AUTH_RATE_LIMIT },
            () => handleLogin(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/register':
      case '/dev/oauth/register':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.register', ...AUTH_RATE_LIMIT },
            () => handleRegister(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/forgot-password':
      case '/dev/oauth/forgot-password':
        // GET renders the request-a-link page; POST issues the reset token and
        // sends the email (rate-limited as a credential endpoint).
        if (event.httpMethod === 'GET') {
          return cors(handleForgotPasswordPage(event));
        }
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.forgot-password', ...AUTH_RATE_LIMIT },
            () => handleForgotPassword(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/reset-password':
      case '/dev/oauth/reset-password':
        // GET renders the choose-a-password page; POST consumes the token.
        if (event.httpMethod === 'GET') {
          return cors(handleResetPasswordPage(event));
        }
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.reset-password', ...AUTH_RATE_LIMIT },
            () => handleResetPassword(event),
          );
          return cors(result);
        }
        break;

      // Device flow endpoints for CLI authentication
      case '/oauth/device/authorize':
      case '/dev/oauth/device/authorize':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.device.authorize', ...AUTH_RATE_LIMIT },
            () => handleDeviceAuthorize(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/device/token':
      case '/dev/oauth/device/token':
        if (event.httpMethod === 'POST') {
          // Polling endpoint — higher budget than auth-credential routes.
          const result = await withRateLimit(
            event,
            { route: 'oauth.device.token', ...DEVICE_POLL_RATE_LIMIT },
            () => handleDeviceToken(event),
          );
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
          const result = await withRateLimit(
            event,
            { route: 'oauth.device.complete-local', ...AUTH_RATE_LIMIT },
            () => handleDeviceCompleteLocal(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/impersonate':
      case '/dev/oauth/impersonate':
        if (event.httpMethod === 'POST') {
          const result = await handleImpersonate(event);
          return cors(result);
        }
        break;

      case '/oauth/stop-impersonate':
      case '/dev/oauth/stop-impersonate':
        if (event.httpMethod === 'POST') {
          return cors(handleStopImpersonate(event));
        }
        break;

      case '/oauth/step-up/verify':
      case '/dev/oauth/step-up/verify':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.step-up.verify', ...AUTH_RATE_LIMIT },
            () => handleStepUpVerify(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/mfa/status':
      case '/dev/oauth/mfa/status':
        if (event.httpMethod === 'GET') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.mfa.status', ...AUTH_RATE_LIMIT },
            () => handleMfaStatus(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/mfa/enroll':
      case '/dev/oauth/mfa/enroll':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.mfa.enroll', ...AUTH_RATE_LIMIT },
            () => handleMfaEnroll(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/mfa/verify-setup':
      case '/dev/oauth/mfa/verify-setup':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.mfa.verify-setup', ...AUTH_RATE_LIMIT },
            () => handleMfaVerifySetup(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/mfa/disable':
      case '/dev/oauth/mfa/disable':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.mfa.disable', ...AUTH_RATE_LIMIT },
            () => handleMfaDisable(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/discord/authorize':
      case '/dev/oauth/discord/authorize':
        if (event.httpMethod === 'GET') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.discord.authorize', ...AUTH_RATE_LIMIT },
            () => Promise.resolve(handleDiscordAuthorize(event)),
          );
          return cors(result);
        }
        break;

      case '/oauth/discord':
      case '/dev/oauth/discord':
        if (event.httpMethod === 'POST') {
          const result = await withRateLimit(
            event,
            { route: 'oauth.discord', ...AUTH_RATE_LIMIT },
            () => handleDiscordAuth(event),
          );
          return cors(result);
        }
        break;

      case '/oauth/discord/link':
      case '/dev/oauth/discord/link':
        if (event.httpMethod === 'POST') {
          const result = await handleDiscordLink(event);
          return cors(result);
        }
        break;

      case '/oauth/discord/unlink':
      case '/dev/oauth/discord/unlink':
        if (event.httpMethod === 'POST') {
          const result = await handleDiscordUnlink(event);
          return cors(result);
        }
        break;

      case '/oauth/google/link':
      case '/dev/oauth/google/link':
        if (event.httpMethod === 'POST') {
          const result = await handleGoogleLink(event);
          return cors(result);
        }
        break;

      case '/oauth/google/unlink':
      case '/dev/oauth/google/unlink':
        if (event.httpMethod === 'POST') {
          const result = await handleGoogleUnlink(event);
          return cors(result);
        }
        break;

      case '/oauth/apple/link':
      case '/dev/oauth/apple/link':
        if (event.httpMethod === 'POST') {
          const result = await handleAppleLink(event);
          return cors(result);
        }
        break;

      case '/oauth/apple/unlink':
      case '/dev/oauth/apple/unlink':
        if (event.httpMethod === 'POST') {
          const result = await handleAppleUnlink(event);
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
    // A DrizzleQueryError's `message` is only "Failed query: <sql>"; the real
    // Postgres failure lives in `error.cause`. Surface it so 500s are
    // diagnosable from CloudWatch and not just Rollbar (LS-7935).
    LOGGER.error(
      'OAuth Proxy Handler Error:',
      error instanceof Error ? error.message : String(error),
      describeErrorCause(error),
    );

    // Capture error with request context
    captureError(error as Error, {
      httpMethod: event.httpMethod,
      path: event.path,
      query: event.queryStringParameters,
      headers: sanitizeHeaders(event.headers),
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
export * from './handlers/PasswordReset';
export * from './handlers/Verify';
export * from './handlers/DeviceFlow';
export * from './handlers/RefreshJwt';
export * from './handlers/Impersonate';
export * from './handlers/Mfa';
export * from './handlers/StepUp';

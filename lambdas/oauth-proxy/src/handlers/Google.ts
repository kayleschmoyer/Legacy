import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { Credentials, OAuth2Client } from 'google-auth-library';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';

import { readSecret } from '@legacy-sports/aws-utils';
import memoizeOne from 'memoize-one';
import { InternalUser } from '@legacy-sports/db-client';
import { z } from 'zod';
import { getOrCreateUser } from './UserManager';
import { completeDeviceFlow } from './DeviceFlow';
import { EnvironmentVariable, Secret, SECRET_CONFIG } from '../util';
import { getUserFromGoogleEmail } from '../util/users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { encryptCookies } from '../util/cookie';
import { buildAuthCookies, generateCsrfToken } from '../util/jwt-cookie';
import {
  buildClearOauthStateCookie,
  buildOauthStateCookie,
  decodeOauthState,
  encodeOauthState,
  generateOauthState,
  verifyOauthState,
} from '../util/oauth-state';
import { parseEventBody } from '../util/lambda';
import { withDbClient } from '../util/db';
import { getAuthSuccessHtml, htmlEscape } from '../util/html';

// Extended API Gateway Event with cached OAuth data to prevent duplicate processing
interface ExtendedAPIGatewayEvent extends APIGatewayEvent {
  _credential?: string; // Cached validated credential
  _exchangedTokens?: Credentials; // Cached token exchange result
  _resolvedUser?: InternalUser; // Pre-fetched user to skip second DB round-trip
  _googlePicture?: string; // Pre-extracted picture from verified token
}

const GOOGLE_JWT_COOKIE = 'GOOGLE_JWT';

interface GoogleAuthSettings {
  clientId: string;
  clientSecret: string;
}

// Module-level cache — persists across warm Lambda invocations; safe because
// the secret and client ID do not change between requests.
let _cachedGoogleAuthSettings: GoogleAuthSettings | undefined;

async function getGoogleAuthSettings(): Promise<GoogleAuthSettings> {
  if (_cachedGoogleAuthSettings) {
    LOGGER.debug('Using cached Google auth settings');
    return _cachedGoogleAuthSettings;
  }

  LOGGER.debug('Getting Google auth settings...');

  const clientId = getEnvVarRequired(EnvironmentVariable.CLIENT_ID);

  LOGGER.debug('CLIENT_ID retrieved successfully');
  LOGGER.debug(
    'Attempting to read Google OAuth client secret from AWS Secrets Manager...',
  );

  const clientSecret = await readSecret(
    SECRET_CONFIG[Secret.GOOGLE_OAUTH_CLIENT_SECRET],
  );

  LOGGER.debug('Google OAuth client secret retrieved successfully');

  _cachedGoogleAuthSettings = { clientId, clientSecret };
  return _cachedGoogleAuthSettings;
}

// Main OAuth client - use 'postmessage' for GSI web flows
const getOAuthClient = memoizeOne((clientId: string, clientSecret: string) => {
  return new OAuth2Client(clientId, clientSecret, 'postmessage');
});

interface GoogleAuthRequest {
  code?: string; // Authorization code (mobile flow)
  credential?: string; // ID token JWT (web flow)
  redirect_uri?: string; // Explicit redirect_uri used when the code was obtained; defaults to 'postmessage' for GSI web flows
}

/**
 * Initiate Google OAuth authorization flow
 * Used for device flow to redirect user to Google OAuth consent screen
 */
export const handleGoogleAuthorize = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info('Google OAuth authorization request');

  try {
    const { clientId } = await getGoogleAuthSettings();

    // Generate a server-side CSRF token bound to this browser via a
    // short-lived HttpOnly cookie. The token is sent to Google as part of
    // `state`; the callback verifies it before trusting the response.
    // A caller-supplied `state` (the device code, for CLI device flow) is
    // appended after the CSRF token so the callback can recover it.
    const csrfToken = generateOauthState();
    const deviceCode = event.queryStringParameters?.state || '';
    const composedState = encodeOauthState(csrfToken, deviceCode);

    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(event),
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'consent',
      state: composedState,
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;

    LOGGER.debug('Redirecting to Google OAuth (state bound to browser)');

    return {
      statusCode: 302,
      headers: {
        Location: googleAuthUrl,
      },
      multiValueHeaders: {
        'Set-Cookie': [buildOauthStateCookie(csrfToken)],
      },
      body: '',
    };
  } catch (error) {
    LOGGER.error(
      'Google authorize error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleGoogleAuthorize' },
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Authorization failed',
        message: 'Could not initiate OAuth flow',
      }),
    };
  }
};

/**
 * Handle OAuth callback from Google
 * This processes the authorization code and completes authentication
 */
export const handleGoogleCallback = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info('Google OAuth callback received');

  // The state cookie is single-use: clear it on every response from this
  // handler (success or failure) so it cannot be replayed.
  const clearStateCookie = buildClearOauthStateCookie();

  try {
    const code = event.queryStringParameters?.code;
    const rawState = event.queryStringParameters?.state;
    const error = event.queryStringParameters?.error;
    const cookieHeader = event.headers?.['Cookie'] ?? event.headers?.['cookie'];

    if (error) {
      LOGGER.error(`OAuth error from Google: ${error}`);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'text/html',
        },
        multiValueHeaders: {
          'Set-Cookie': [clearStateCookie],
        },
        body: `
<!DOCTYPE html>
<html>
<head><title>Authentication Failed</title></head>
<body>
    <h1>Authentication Failed</h1>
    <p>OAuth error: ${htmlEscape(error)}</p>
    <p>Please close this window and try again in your CLI.</p>
</body>
</html>
        `,
      };
    }

    if (!code) {
      return {
        statusCode: 400,
        multiValueHeaders: {
          'Set-Cookie': [clearStateCookie],
        },
        body: JSON.stringify({
          error: 'Missing authorization code',
          message: 'No authorization code received from Google',
        }),
      };
    }

    // Verify the CSRF state against the cookie bound at /authorize time.
    // The state Google echoes back has the form `<csrf>` or `<csrf>.<deviceCode>`.
    const { csrfToken, deviceCode } = decodeOauthState(rawState);
    if (!verifyOauthState(csrfToken, cookieHeader)) {
      LOGGER.warn('Google OAuth callback rejected: state mismatch');
      return {
        statusCode: 400,
        multiValueHeaders: {
          'Set-Cookie': [clearStateCookie],
        },
        body: JSON.stringify({
          error: 'Invalid state',
          message:
            'OAuth state did not match. The login attempt may have expired or been tampered with — please try again.',
        }),
      };
    }

    // Create a synthetic event for the existing Google auth handler.
    // Forward only the device code (not the CSRF token) as the downstream
    // `state`, so completeDeviceFlow continues to receive the device code
    // it expects. Include the redirect_uri that Google used for this
    // callback so the token exchange matches.
    const syntheticEvent: APIGatewayEvent = {
      ...event,
      httpMethod: 'POST',
      body: JSON.stringify({ code, redirect_uri: getRedirectUri(event) }),
      queryStringParameters: {
        ...event.queryStringParameters,
        state: deviceCode || undefined,
      },
    };

    const downstream = await handleSecureGoogleAuth(syntheticEvent);

    // Append the clearing Set-Cookie alongside whatever downstream cookies
    // the secure handler set, so the state cookie is single-use even on
    // success.
    const existing = downstream.multiValueHeaders?.['Set-Cookie'] ?? [];
    return {
      ...downstream,
      multiValueHeaders: {
        ...downstream.multiValueHeaders,
        'Set-Cookie': [...(existing as string[]), clearStateCookie],
      },
    };
  } catch (error) {
    LOGGER.error(
      'Google callback error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleGoogleCallback' },
    );
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/html',
      },
      multiValueHeaders: {
        'Set-Cookie': [clearStateCookie],
      },
      body: `
<!DOCTYPE html>
<html>
<head><title>Authentication Error</title></head>
<body>
    <h1>Authentication Error</h1>
    <p>An error occurred during authentication.</p>
    <p>Please close this window and try again in your CLI.</p>
</body>
</html>
      `,
    };
  }
};

/**
 * Get OAuth redirect URI for the current environment
 */
function getRedirectUri(event: APIGatewayEvent): string {
  const stage = event.requestContext.stage;
  const domainName = event.requestContext.domainName;
  return `https://${domainName}/${stage}/oauth/google/callback`;
}

/**
 * Return the set of redirect URIs that are permitted for this request.
 * - 'postmessage': used by Google Identity Services for popup/iframe code flows (web)
 * - The API Gateway callback URL for this stage: used by CLI/device authorization flows
 */
function getAllowedRedirectUris(event: APIGatewayEvent): Set<string> {
  return new Set(['postmessage', getRedirectUri(event)]);
}

/**
 * Validate that a redirect_uri value is in the allowlist for this request.
 * Returns the validated URI, or throws for unknown values.
 */
function validateRedirectUri(
  redirectUri: string | undefined,
  event: APIGatewayEvent,
): string {
  const normalized = redirectUri?.trim();
  const resolved = normalized || 'postmessage';
  if (!getAllowedRedirectUris(event).has(resolved)) {
    LOGGER.warn('Rejected disallowed redirect_uri', { redirectUri: resolved });
    throw new Error('Invalid redirect_uri: not in allowlist');
  }
  return resolved;
}

/**
 * Secure Google authentication flow with automatic user provisioning
 * This flow automatically creates new users on their first login
 * Steps:
 * 1. Decode OAuth token to get user email
 * 2. Get or create user record in database (auto-provisions new users)
 * 3. Complete full OAuth validation
 * 4. Create JWT and authenticated session
 */
export const handleSecureGoogleAuth = async (
  event: ExtendedAPIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info(
    'Starting secure Google authentication flow with auto-provisioning',
  );

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Request body is required',
        }),
      };
    }

    const googleAuthRequestSchema = z.object({
      code: z.string().optional(),
      credential: z.string().optional(),
      redirect_uri: z.string().optional(),
    });

    let body: GoogleAuthRequest;
    try {
      body = parseEventBody(event, googleAuthRequestSchema);
    } catch (err) {
      LOGGER.warn('handleSecureGoogleAuth: failed to parse request body', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid request body',
        }),
      };
    }

    LOGGER.debug('Request body parsed successfully', {
      hasCode: !!body.code,
      hasCredential: !!body.credential,
    });

    // Get OAuth settings upfront — needed for signature verification in Step 1
    const { clientId, clientSecret } = await getGoogleAuthSettings();
    const oauthClient = getOAuthClient(clientId, clientSecret);

    // Step 1: Verify the credential/code to get the cryptographically-confirmed email.
    // Using oauthClient.verifyIdToken() ensures the Google signature is checked before
    // the email is trusted for any database operation.
    let userEmail: string;

    if (body.credential) {
      // For One Tap flow, verify the ID token signature with Google's public keys
      try {
        const ticket = await oauthClient.verifyIdToken({
          idToken: body.credential,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) {
          throw new Error('ID token missing email claim');
        }
        userEmail = payload.email;

        // Store credential and picture on the event so the main flow can reuse them
        // without re-reading the request body; the ID token is still re-verified later.
        event._credential = body.credential;
        event._googlePicture = payload.picture;

        LOGGER.debug('Email verified from ID token successfully');
      } catch (error) {
        LOGGER.error(
          'Failed to verify ID token for email extraction:',
          error instanceof Error ? error : new Error(String(error)),
          {
            handler: 'handleSecureGoogleAuth',
            context: 'id_token_verification',
          },
        );
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid ID token',
            message: 'Could not verify credential',
          }),
        };
      }
    } else if (body.code) {
      // For authorization code flow, exchange the code and verify the resulting id_token
      LOGGER.debug(
        'Authorization code flow detected - exchanging code to get user email',
      );

      // Validate redirect_uri against the allowlist before exchanging the code.
      // Only 'postmessage' (web GSI flow) and the API Gateway callback URI
      // (device/CLI flow) are permitted. Reject any other value upfront.
      let redirectUri: string;
      try {
        redirectUri = validateRedirectUri(body.redirect_uri, event);
      } catch {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid redirect_uri',
            message: 'The redirect_uri is not in the list of allowed values',
          }),
        };
      }

      try {
        const { tokens } = await oauthClient.getToken({
          code: body.code,
          redirect_uri: redirectUri,
        });
        if (!tokens.id_token) {
          throw new Error(
            'No ID token received from authorization code exchange',
          );
        }

        const ticket = await oauthClient.verifyIdToken({
          idToken: tokens.id_token,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) {
          throw new Error('ID token from code exchange missing email claim');
        }
        userEmail = payload.email;

        // Store tokens and picture on the event so we can reuse them later.
        // Storing tokens avoids the "invalid_grant" error from double-exchange.
        event._exchangedTokens = tokens;
        event._googlePicture = payload.picture;

        LOGGER.debug(
          'Email verified from authorization code flow successfully',
        );
      } catch (error) {
        LOGGER.error(
          'Failed to exchange authorization code for email:',
          error instanceof Error ? error : new Error(String(error)),
          {
            handler: 'handleSecureGoogleAuth',
            context: 'code_exchange',
            redirectUri,
          },
        );
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid authorization code',
            message: 'Could not exchange code for user information',
          }),
        };
      }
    } else {
      LOGGER.error('Neither authorization code nor credential provided');
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing authentication data',
          message: 'Must provide either authorization code or credential',
        }),
      };
    }

    // Step 2: Get or create user in the database
    // This automatically creates new users with default access level on first login
    LOGGER.info('Getting or creating user from OAuth flow');

    const user = await getOrCreateUser(userEmail, event._googlePicture);

    LOGGER.info(`User ready for authentication (ID: ${user.id})`);

    // Cache the resolved user on the event so handleGoogleAuth can skip its
    // own DB lookup (getUserFromGoogleEmail) and avoid a second DB connection.
    event._resolvedUser = user;

    // Step 3: NOW do full OAuth validation since user exists
    LOGGER.debug(
      'User record confirmed, proceeding with full OAuth validation',
    );

    // Delegate to the original handleGoogleAuth for the actual OAuth processing
    // This reuses all the existing OAuth validation logic
    return await handleGoogleAuth(event);
  } catch (error) {
    LOGGER.error(
      'Secure Google auth error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleSecureGoogleAuth' },
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Authentication failed',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
};

export const handleGoogleAuth = async (event: ExtendedAPIGatewayEvent) => {
  LOGGER.debug('Starting handleGoogleAuth function');

  const body = parseEventBody<GoogleAuthRequest>(event);

  LOGGER.debug('Request body parsed successfully', {
    hasCode: !!body.code,
    hasCredential: !!body.credential,
  });

  LOGGER.info('Retrieving OAuth settings for google...');
  const { clientId, clientSecret } = await getGoogleAuthSettings();

  LOGGER.debug('Creating OAuth client...');

  const oauthClient = getOAuthClient(clientId, clientSecret);

  LOGGER.debug('OAuth client created successfully');

  let idToken: string;
  let googleEmail: string;
  let googlePicture: string | undefined;

  if (body.code) {
    // Authorization code flow (web/mobile)
    LOGGER.debug('Processing authorization code flow...');

    let tokens: Credentials;

    // Check if we already have tokens from the secure flow (to avoid double-exchange)
    if (event._exchangedTokens) {
      LOGGER.debug(
        'Using previously exchanged tokens (avoiding duplicate exchange)',
      );
      tokens = event._exchangedTokens;
    } else {
      // First time exchange - this shouldn't happen in secure flow, but keeping for compatibility
      LOGGER.info(
        `Exchanging authorization code for tokens: ${body.code.substring(0, 20)}...`,
      );

      LOGGER.debug(
        'About to call oauthClient.getToken() - this may take time...',
      );

      // Note: Using 'postmessage' as redirect_uri for GSI web flows
      // This matches what Google Identity Services uses for popup/iframe flows
      const tokenResponse = await oauthClient.getToken(body.code);
      tokens = tokenResponse.tokens;
    }

    LOGGER.debug('Successfully received tokens from Google OAuth');

    if (!tokens.id_token) {
      LOGGER.error('No ID token received from authorization code exchange.');
      throw new Error(
        'Invalid token returned from Google OAuth code exchange!',
      );
    }

    idToken = tokens.id_token;

    // Verify the id_token from the code exchange to extract email and picture safely
    const codeTicket = await oauthClient.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const codePayload = codeTicket.getPayload();
    if (!codePayload?.email) {
      LOGGER.error('No email in id_token from code exchange');
      throw new Error('Invalid ID token from Google OAuth code exchange!');
    }
    googleEmail = codePayload.email;
    googlePicture = codePayload.picture;
  } else if (body.credential) {
    // ID token flow (One Tap)

    let credential: string;

    // Check if we already have a validated credential from the secure flow
    if (event._credential) {
      LOGGER.debug(
        'Using previously extracted credential from secure flow (re-verifying to ensure token integrity)',
      );
      credential = event._credential;
    } else {
      // First time validation - this shouldn't happen in secure flow, but keeping for compatibility
      LOGGER.info(
        `Processing Google ID token: ${body.credential.substring(0, 20)}...`,
      );
      credential = body.credential;
    }

    LOGGER.debug(
      'About to verify ID token with Google - this may take time...',
    );

    // Verify the ID token is valid and extract email + picture from the verified payload
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });

      LOGGER.debug('ID token verification successful');

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Invalid ID token payload');
      }

      idToken = credential;
      if (!payload.email) {
        LOGGER.error(
          'Verified ID token payload is missing required email claim',
        );
        throw new Error('Invalid ID token from Google: missing email');
      }
      googleEmail = payload.email;
      googlePicture = payload.picture;
    } catch (error) {
      LOGGER.error(
        'ID token verification failed:',
        error instanceof Error ? error.message : String(error),
      );
      throw new Error('Invalid ID token from Google!');
    }
  } else {
    LOGGER.error('Neither authorization code nor credential provided.');
    throw new Error('Missing authorization code or credential!');
  }

  LOGGER.debug('Retrieving user from Google JWT.');
  let userInfo: InternalUser;
  let internalJwt: string;

  try {
    if (event._resolvedUser) {
      // User was pre-fetched by handleSecureGoogleAuth — skip the DB round-trip.
      // _googlePicture was also captured there; fall back to the picture extracted
      // by the verifyIdToken call above in case the event path differs.
      LOGGER.debug(
        'Using pre-resolved user from secure flow, skipping DB lookup',
      );
      userInfo = event._resolvedUser;
      internalJwt = await createJwt(userInfo, {
        picture: event._googlePicture ?? googlePicture,
      });
      LOGGER.debug('Internal JWT created successfully');
    } else {
      // No pre-resolved user — open a DB connection to look up the user.
      LOGGER.debug('Attempting to connect to database...');

      const result = await withDbClient(async (db) => {
        LOGGER.debug(
          'Database connection successful, getting user from JWT...',
        );

        const user = await getUserFromGoogleEmail(
          db,
          googleEmail,
          googlePicture,
        );

        LOGGER.debug('User retrieved from database:', {
          id: user.id,
          username: user.username,
          accessLevel: user.accessLevel,
        });

        const jwt = await createJwt(user, {
          picture: googlePicture,
        });

        LOGGER.debug('Internal JWT created successfully');

        return { user, jwt };
      });

      userInfo = result.user;
      internalJwt = result.jwt;
    }
  } catch (dbError) {
    LOGGER.error(
      'Database unavailable during authentication — refusing to issue JWT:',
      dbError instanceof Error ? dbError : new Error(String(dbError)),
      { handler: 'handleGoogleAuth', context: 'db_access' },
    );
    return {
      statusCode: 503,
      body: JSON.stringify({
        error: 'Service unavailable',
        message:
          'Authentication service temporarily unavailable. Please try again later.',
      }),
    };
  }

  const cookies = {
    [GOOGLE_JWT_COOKIE]: idToken,
    [JWT_COOKIE_NAME]: internalJwt,
  };

  LOGGER.debug('Encrypting cookies.');
  const cookieHeader = await encryptCookies(cookies);

  // Check if this is part of a device flow (state parameter contains device code)
  const state = event.queryStringParameters?.state;
  if (state) {
    LOGGER.debug(`Checking for device flow completion with state: ${state}`);

    // Try to complete device flow
    try {
      const deviceTokenResponse = {
        jwt: internalJwt,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          username: userInfo.username || userInfo.email,
          accessLevel: userInfo.accessLevel || 'none',
        },
      };

      await completeDeviceFlow(state, deviceTokenResponse);
      LOGGER.info(`Device flow completed for state: ${state}`);

      // For device flow, show success page instead of returning JWT directly
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
        body: getAuthSuccessHtml(userInfo.email),
      };
    } catch (error) {
      LOGGER.warn(
        'Failed to complete device flow:',
        error instanceof Error ? error.message : String(error),
      );
      // Continue with normal flow if device flow completion fails
    }
  }

  // Set HttpOnly JWT cookie + JS-readable CSRF cookie (double-submit pattern)
  const csrfToken = generateCsrfToken();
  const authCookies = buildAuthCookies(internalJwt, csrfToken);

  const result: APIGatewayProxyResult = {
    body: JSON.stringify({
      jwt: internalJwt,
      csrfToken,
    }),
    multiValueHeaders: {
      'Set-Cookie': [cookieHeader, ...authCookies],
    },
    statusCode: 200,
  };

  LOGGER.debug('Complete.');

  return result;
};

import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import {
  Credentials,
  OAuth2Client,
  UserRefreshClient,
} from 'google-auth-library';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { captureError } from '@legacy-sports/rollbar';
import { readSecret } from '@legacy-sports/aws-utils';
import memoizeOne from 'memoize-one';
import { InternalUser } from '@legacy-sports/db-client';
import { getOrCreateUser } from './UserManager';
import { completeDeviceFlow } from './DeviceFlow';
import { EnvironmentVariable, Secret, SECRET_CONFIG } from '../util';
import { getUserFromGoogleEmail } from '../util/users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { decryptCookies, encryptCookies } from '../util/cookie';
import { buildAuthCookies, generateCsrfToken } from '../util/jwt-cookie';
import { parseEventBody } from '../util/lambda';
import { withDbClient } from '../util/db';

// Extended API Gateway Event with cached OAuth data to prevent duplicate processing
interface ExtendedAPIGatewayEvent extends APIGatewayEvent {
  _credential?: string; // Cached validated credential
  _exchangedTokens?: Credentials; // Cached token exchange result
}

const REFRESH_TOKEN_COOKIE = 'GOOGLE_REFRESH_TOKEN';
const GOOGLE_JWT_COOKIE = 'GOOGLE_JWT';

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

interface GoogleAuthSettings {
  clientId: string;
  clientSecret: string;
}

async function getGoogleAuthSettings(): Promise<GoogleAuthSettings> {
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

  return {
    clientId: clientId,
    clientSecret: clientSecret,
  };
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
    const state = event.queryStringParameters?.state || '';

    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(event),
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'consent',
      state: state,
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;

    LOGGER.debug(`Redirecting to Google OAuth: ${googleAuthUrl}`);

    return {
      statusCode: 302,
      headers: {
        Location: googleAuthUrl,
      },
      body: '',
    };
  } catch (error) {
    LOGGER.error(
      'Google authorize error:',
      error instanceof Error ? error.message : String(error),
    );
    captureError(error as Error, { handler: 'handleGoogleAuthorize' });
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

  try {
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;
    const error = event.queryStringParameters?.error;

    if (error) {
      LOGGER.error(`OAuth error from Google: ${error}`);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'text/html',
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
        body: JSON.stringify({
          error: 'Missing authorization code',
          message: 'No authorization code received from Google',
        }),
      };
    }

    // Create a synthetic event for the existing Google auth handler
    // Include the redirect_uri that Google used for this callback so the token exchange matches
    const syntheticEvent: APIGatewayEvent = {
      ...event,
      httpMethod: 'POST',
      body: JSON.stringify({ code, redirect_uri: getRedirectUri(event) }),
      queryStringParameters: { ...event.queryStringParameters, state },
    };

    // Use existing secure Google auth handler
    return await handleSecureGoogleAuth(syntheticEvent);
  } catch (error) {
    LOGGER.error(
      'Google callback error:',
      error instanceof Error ? error.message : String(error),
    );
    captureError(error as Error, { handler: 'handleGoogleCallback' });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/html',
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
    const body = parseEventBody<GoogleAuthRequest>(event);

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

        // Store credential on the event so the main flow can reuse the same value
        // without re-reading the request body; the ID token is still re-verified later.
        event._credential = body.credential;

        LOGGER.debug('Email verified from ID token successfully');
      } catch (error) {
        LOGGER.error(
          'Failed to verify ID token for email extraction:',
          error instanceof Error ? error.message : String(error),
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

        // Store tokens in the event body so we can reuse them later
        // This avoids the "invalid_grant" error from double-exchange
        event._exchangedTokens = tokens;

        LOGGER.debug(
          'Email verified from authorization code flow successfully',
        );
      } catch (error) {
        LOGGER.error(
          'Failed to exchange authorization code for email:',
          error instanceof Error ? error.message : String(error),
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

    const user = await getOrCreateUser(userEmail);

    LOGGER.info(`User ready for authentication (ID: ${user.id})`);

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
      error instanceof Error ? error.message : String(error),
    );
    captureError(error as Error, { handler: 'handleSecureGoogleAuth' });

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
    // Try database access
    LOGGER.debug('Attempting to connect to database...');

    const result = await withDbClient(async (db) => {
      LOGGER.debug('Database connection successful, getting user from JWT...');

      const user = await getUserFromGoogleEmail(db, googleEmail);

      LOGGER.debug('User retrieved from database:', {
        id: user.id,
        username: user.username,
        accessLevel: user.accessLevel,
      });

      // Use picture extracted from the already-verified Google ID token payload
      const jwt = await createJwt(user, {
        picture: googlePicture,
      });

      LOGGER.debug('Internal JWT created successfully');

      return { user, jwt };
    });

    userInfo = result.user;
    internalJwt = result.jwt;
  } catch (dbError) {
    LOGGER.error(
      'Database unavailable during authentication — refusing to issue JWT:',
      dbError instanceof Error ? dbError.message : String(dbError),
    );
    captureError(dbError as Error, {
      handler: 'handleGoogleAuth',
      context: 'db_access',
    });
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
    [REFRESH_TOKEN_COOKIE]: '', // Only available from authorization code flow
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
        body: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Authentication Successful</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; text-align: center; }
        .success { color: #16a34a; font-size: 24px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="success">✅ Authentication Successful!</div>
    <p>You can now close this browser window and return to your CLI.</p>
    <p>Authenticated as: <strong>${userInfo.email}</strong></p>
</body>
</html>
        `,
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
    }),
    multiValueHeaders: {
      'Set-Cookie': [cookieHeader, ...authCookies],
    },
    statusCode: 200,
  };

  LOGGER.debug('Complete.');

  return result;
};

export const handleGoogleRefresh = async (event: APIGatewayEvent) => {
  LOGGER.debug('Initialize database.');
  const { clientId, clientSecret } = await getGoogleAuthSettings();

  const cookieHeader = event.headers['Cookie'] || '';

  const cookies = await decryptCookies(cookieHeader);

  const refreshToken = cookies[REFRESH_TOKEN_COOKIE];

  if (!refreshToken) {
    throw new Error('Could not determine refresh token!');
  }

  const user = new UserRefreshClient(clientId, clientSecret, refreshToken);

  const { credentials } = await user.refreshAccessToken(); // obtain new tokens

  if (credentials.id_token === null || credentials.id_token === undefined) {
    throw new Error('Invalid token returned from google!');
  }

  const idToken = credentials.id_token;

  // Verify the refreshed id_token with Google's public keys to ensure it's authentic
  const oauthClient = getOAuthClient(clientId, clientSecret);
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const googlePayload = ticket.getPayload();

  const email = googlePayload?.email;
  if (!email) {
    LOGGER.error(
      'Verified refresh token payload is missing required email claim',
    );
    throw new Error('Invalid ID token from Google: missing email');
  }

  return await withDbClient(async (db) => {
    const userInfo = await getUserFromGoogleEmail(db, email);

    const internalJwt = await createJwt(userInfo, {
      picture: googlePayload?.picture,
    });

    const result: APIGatewayProxyResult = {
      body: JSON.stringify({
        jwt: internalJwt,
      }),
      statusCode: 200,
    };

    return result;
  });
};

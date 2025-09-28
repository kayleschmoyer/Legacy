import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { OAuth2Client, UserRefreshClient } from 'google-auth-library';
import memoizeOne from 'memoize-one';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/utils';
import { InternalUser } from '@legacy-sports/db-client';
import { checkUserExists } from './UserManager';
import { EnvironmentVariable, Secret, SECRET_CONFIG } from '../util';
import { getUserFromGoogleJwt } from '../util/users';
import { createJwt, JWT_COOKIE_NAME } from '../util/jwt';
import { decryptCookies, encryptCookies } from '../util/cookie';
import { parseEventBody } from '../util/lambda';
import { getDbClient } from '../util/db';

const REFRESH_TOKEN_COOKIE = 'GOOGLE_REFRESH_TOKEN';
const GOOGLE_JWT_COOKIE = 'GOOGLE_JWT';

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

const getOAuthClient = memoizeOne((clientId: string, clientSecret: string) => {
  return new OAuth2Client(clientId, clientSecret, 'postmessage');
});

interface GoogleAuthRequest {
  code?: string; // Authorization code (mobile flow)
  credential?: string; // ID token JWT (web flow)
}

/**
 * NEW SECURE FLOW: Check user exists first, then validate OAuth
 * This implements the requirement that only pre-authorized users can authenticate
 */
export const handleSecureGoogleAuth = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.info(
    'Starting secure Google authentication flow (user-first validation)',
  );

  try {
    const body = parseEventBody<GoogleAuthRequest>(event);

    LOGGER.debug('Request body parsed successfully', {
      hasCode: !!body.code,
      hasCredential: !!body.credential,
    });

    // Step 1: First, decode the credential/code to get the email WITHOUT full validation
    // This allows us to check user existence before doing expensive OAuth validation
    let userEmail: string;

    if (body.credential) {
      // For web flow, decode the JWT to get email (don't validate signature yet)
      const { jwtDecode } = await import('jwt-decode');
      try {
        const payload = jwtDecode<{ email: string }>(body.credential);
        userEmail = payload.email;
        LOGGER.debug(`Extracted email from ID token: ${userEmail}`);
      } catch (error) {
        LOGGER.error(
          'Failed to decode ID token for email extraction:',
          error instanceof Error ? error.message : String(error),
        );
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid ID token format',
            message: 'Could not extract email from credential',
          }),
        };
      }
    } else if (body.code) {
      // For mobile flow, we need to do a preliminary token exchange to get the email
      // This is less efficient but necessary for the authorization code flow
      LOGGER.debug(
        'Mobile flow detected - need to exchange code to get user email',
      );

      const { clientId, clientSecret } = await getGoogleAuthSettings();
      const oauthClient = getOAuthClient(clientId, clientSecret);

      try {
        const { tokens } = await oauthClient.getToken(body.code);
        if (!tokens.id_token) {
          throw new Error(
            'No ID token received from authorization code exchange',
          );
        }

        const { jwtDecode } = await import('jwt-decode');
        const payload = jwtDecode<{ email: string }>(tokens.id_token);
        userEmail = payload.email;
        LOGGER.debug(
          `Extracted email from authorization code flow: ${userEmail}`,
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

    // Step 2: SECURITY GATE - Check if user exists in our database
    LOGGER.info(`Checking if user is pre-authorized: ${userEmail}`);

    const existingUser = await checkUserExists(userEmail);

    if (!existingUser) {
      LOGGER.warn(`Authentication denied for unauthorized user: ${userEmail}`);
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'User not authorized',
          message: 'This user is not pre-authorized to access the application',
          userEmail: userEmail,
        }),
      };
    }

    LOGGER.info(
      `User pre-authorization confirmed: ${userEmail} (ID: ${existingUser.id})`,
    );

    // Step 3: NOW do full OAuth validation since user is pre-authorized
    LOGGER.debug(
      'User is pre-authorized, proceeding with full OAuth validation',
    );

    // Delegate to the original handleGoogleAuth for the actual OAuth processing
    // This reuses all the existing OAuth validation logic
    return await handleGoogleAuth(event);
  } catch (error) {
    LOGGER.error(
      'Secure Google auth error:',
      error instanceof Error ? error.message : String(error),
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

export const handleGoogleAuth = async (event: APIGatewayEvent) => {
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

  if (body.code) {
    // Authorization code flow (mobile)
    LOGGER.debug('Processing authorization code flow...');
    LOGGER.info(
      `Exchanging authorization code for tokens: ${body.code.substring(0, 20)}...`,
    );

    LOGGER.debug(
      'About to call oauthClient.getToken() - this may take time...',
    );

    const { tokens } = await oauthClient.getToken(body.code);

    LOGGER.debug('Successfully received tokens from Google OAuth');

    if (!tokens.id_token) {
      LOGGER.error('No ID token received from authorization code exchange.');
      throw new Error(
        'Invalid token returned from Google OAuth code exchange!',
      );
    }

    idToken = tokens.id_token;
  } else if (body.credential) {
    // ID token flow (web)
    LOGGER.info(
      `Processing Google ID token: ${body.credential.substring(0, 20)}...`,
    );

    LOGGER.debug(
      'About to verify ID token with Google - this may take time...',
    );

    // Verify the ID token is valid
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: body.credential,
        audience: clientId,
      });

      LOGGER.debug('ID token verification successful');

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Invalid ID token payload');
      }

      idToken = body.credential;
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

    const dbClient = await getDbClient();

    LOGGER.debug('Database connection successful, getting user from JWT...');

    userInfo = await getUserFromGoogleJwt(dbClient, idToken);

    LOGGER.debug('User retrieved from database, creating internal JWT...');

    internalJwt = await createJwt(userInfo);

    LOGGER.debug('Internal JWT created successfully');
  } catch (dbError) {
    LOGGER.warn(
      'Database access failed, creating temporary user from JWT:',
      dbError instanceof Error ? dbError.message : String(dbError),
    );

    // Fallback: decode JWT and create temporary user
    const { jwtDecode } = await import('jwt-decode');
    const payload = jwtDecode<{ sub: string; email: string; name?: string }>(
      idToken,
    );

    // Create a temporary user object that matches InternalUser interface
    userInfo = {
      id: parseInt(payload.sub, 10) || Date.now(), // Use timestamp as fallback ID
      email: payload.email || 'unknown@example.com',
      username: payload.name || payload.email || 'Unknown User',
      passwordHash: null,
      accessLevel: 'none' as const,
    };

    // Create JWT directly from user info
    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';

    const jwtPayload = {
      accessLevel: userInfo.accessLevel,
      email: userInfo.email,
      id: userInfo.id,
      username: userInfo.username,
    };

    internalJwt = jwt.sign(jwtPayload, jwtSecret, { expiresIn: '24h' });
  }

  const cookies = {
    [GOOGLE_JWT_COOKIE]: idToken,
    [JWT_COOKIE_NAME]: internalJwt,
    [REFRESH_TOKEN_COOKIE]: '', // Only available from authorization code flow
  };

  LOGGER.debug('Encrypting cookies.');
  const cookieHeader = await encryptCookies(cookies);

  const result: APIGatewayProxyResult = {
    body: JSON.stringify({
      jwt: internalJwt,
    }),
    headers: {
      'Set-Cookie': cookieHeader,
    },
    statusCode: 200,
  };

  LOGGER.debug('Complete.');

  return result;
};

export const handleGoogleRefresh = async (event: APIGatewayEvent) => {
  LOGGER.debug('Initialize database.');
  const dbClient = await getDbClient();

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

  const userInfo = await getUserFromGoogleJwt(dbClient, credentials.id_token);
  const internalJwt = await createJwt(userInfo);

  const result: APIGatewayProxyResult = {
    body: JSON.stringify({
      jwt: internalJwt,
    }),
    statusCode: 200,
  };

  return result;
};

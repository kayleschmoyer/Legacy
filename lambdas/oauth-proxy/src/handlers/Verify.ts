import { OAuth2Client } from 'google-auth-library';
import memoizeOne from 'memoize-one';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/utils';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { parseEventBody } from '../util/lambda';
import { EnvironmentVariable, Secret, SECRET_CONFIG } from '../util';

interface GoogleAuthSettings {
  clientId: string;
  clientSecret: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  [key: string]: unknown;
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

interface VerifyRequest {
  code?: string; // Authorization code (mobile flow)
  credential?: string; // ID token JWT (web flow)
}

interface VerifyResponse {
  verified: boolean;
  userInfo?: {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };
  googleToken?: string;
  error?: string;
}

/**
 * Handle OAuth token verification without database access
 * This endpoint only verifies the token with Google and returns user info
 */
export const handleVerify = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('Starting handleVerify function');

  try {
    const body = parseEventBody<VerifyRequest>(event);

    LOGGER.debug('Request body parsed successfully', {
      hasCode: !!body.code,
      hasCredential: !!body.credential,
    });

    LOGGER.info('Retrieving OAuth settings for Google verification...');
    const { clientId, clientSecret } = await getGoogleAuthSettings();

    LOGGER.debug('Creating OAuth client...');
    const oauthClient = getOAuthClient(clientId, clientSecret);

    let idToken: string;
    let userInfo: GoogleUserInfo;

    if (body.code) {
      // Authorization code flow (mobile)
      LOGGER.debug('Processing authorization code flow for verification...');
      LOGGER.info(
        `Exchanging authorization code for tokens: ${body.code.substring(0, 20)}...`,
      );

      const { tokens } = await oauthClient.getToken(body.code);

      LOGGER.debug('Successfully received tokens from Google OAuth');

      if (!tokens.id_token) {
        LOGGER.error('No ID token received from authorization code exchange.');
        return {
          statusCode: 400,
          body: JSON.stringify({
            verified: false,
            error: 'Invalid token returned from Google OAuth code exchange!',
          }),
        };
      }

      idToken = tokens.id_token;
    } else if (body.credential) {
      // ID token flow (web)
      LOGGER.info(
        `Processing Google ID token verification: ${body.credential.substring(0, 20)}...`,
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
          return {
            statusCode: 400,
            body: JSON.stringify({
              verified: false,
              error: 'Invalid ID token payload',
            }),
          };
        }

        idToken = body.credential;
      } catch (error) {
        LOGGER.error(
          'ID token verification failed:',
          error instanceof Error ? error.message : String(error),
        );
        return {
          statusCode: 400,
          body: JSON.stringify({
            verified: false,
            error: 'Invalid ID token from Google!',
          }),
        };
      }
    } else {
      LOGGER.error('Neither authorization code nor credential provided.');
      return {
        statusCode: 400,
        body: JSON.stringify({
          verified: false,
          error: 'Missing authorization code or credential!',
        }),
      };
    }

    // Decode the verified token to get user info
    LOGGER.debug('Decoding verified token to extract user info...');

    try {
      const { jwtDecode } = await import('jwt-decode');
      userInfo = jwtDecode<{
        sub: string;
        email: string;
        name?: string;
        picture?: string;
      }>(idToken);

      LOGGER.debug('Successfully extracted user info from token');

      const response: VerifyResponse = {
        verified: true,
        userInfo: {
          sub: userInfo.sub || '',
          email: userInfo.email || '',
          name: userInfo.name || '',
          picture: userInfo.picture || '',
        },
        googleToken: idToken,
      };

      return {
        statusCode: 200,
        body: JSON.stringify(response),
      };
    } catch (decodeError) {
      LOGGER.error(
        'Failed to decode token:',
        decodeError instanceof Error
          ? decodeError.message
          : String(decodeError),
      );
      return {
        statusCode: 500,
        body: JSON.stringify({
          verified: false,
          error: 'Failed to decode verified token',
        }),
      };
    }
  } catch (error) {
    LOGGER.error(
      'OAuth verification error:',
      error instanceof Error ? error.message : String(error),
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        verified: false,
        error:
          error instanceof Error ? error.message : 'OAuth verification failed',
      }),
    };
  }
};

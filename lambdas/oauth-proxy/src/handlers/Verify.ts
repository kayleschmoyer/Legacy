import { config } from '@legacy-sports/app-config';
import { OAuth2Client } from 'google-auth-library';
import memoizeOne from 'memoize-one';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';

import { readSecret } from '@legacy-sports/aws-utils';
import { parseEventBody } from '../util/lambda';
import { Secret, SECRET_CONFIG } from '../util';

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

// Module-level cache — persists across warm Lambda invocations; safe because
// the secret and client ID do not change between requests.
let _cachedGoogleAuthSettings: GoogleAuthSettings | undefined;

async function getGoogleAuthSettings(): Promise<GoogleAuthSettings> {
  if (_cachedGoogleAuthSettings) {
    LOGGER.debug('Using cached Google auth settings');
    return _cachedGoogleAuthSettings;
  }

  LOGGER.debug('Getting Google auth settings...');

  const clientId = config.googleClientId;
  if (!clientId) {
    throw new Error('CLIENT_ID (googleClientId) is not configured');
  }

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
    let verifiedPayload: GoogleUserInfo;

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

      // Verify the id_token returned by the code exchange with Google's public keys
      try {
        const codeTicket = await oauthClient.verifyIdToken({
          idToken,
          audience: clientId,
        });
        const codePayload = codeTicket.getPayload();
        if (!codePayload) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              verified: false,
              error: 'Invalid ID token payload from code exchange',
            }),
          };
        }
        verifiedPayload = codePayload as unknown as GoogleUserInfo;
      } catch (error) {
        LOGGER.error(
          'ID token verification failed for code exchange:',
          error instanceof Error ? error.message : String(error),
        );
        return {
          statusCode: 400,
          body: JSON.stringify({
            verified: false,
            error: 'Invalid ID token from Google OAuth code exchange!',
          }),
        };
      }
    } else if (body.credential) {
      // ID token flow (web)
      LOGGER.info(
        `Processing Google ID token verification: ${body.credential.substring(0, 20)}...`,
      );

      // Verify the ID token is valid with Google's public keys
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
        verifiedPayload = payload as unknown as GoogleUserInfo;
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

    // Use the verified payload extracted directly from the signature-checked ticket
    LOGGER.debug('Successfully extracted user info from verified token');

    // Require sub and email to be present — a token verified but missing identity
    // claims is ambiguous and should never be treated as "verified".
    if (!verifiedPayload.sub || !verifiedPayload.email) {
      LOGGER.error('Verified token is missing required identity claims', {
        hasSub: !!verifiedPayload.sub,
        hasEmail: !!verifiedPayload.email,
      });
      return {
        statusCode: 400,
        body: JSON.stringify({
          verified: false,
          error: 'ID token is missing required identity claims (sub, email)',
        }),
      };
    }

    const response: VerifyResponse = {
      verified: true,
      userInfo: {
        sub: verifiedPayload.sub,
        email: verifiedPayload.email,
        name: verifiedPayload.name || '',
        picture: verifiedPayload.picture || '',
      },
      googleToken: idToken,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    LOGGER.error(
      'OAuth verification error:',
      error instanceof Error ? error : new Error(String(error)),
      { handler: 'handleVerify' },
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

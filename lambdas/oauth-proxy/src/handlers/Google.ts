import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { OAuth2Client, UserRefreshClient } from 'google-auth-library';
import memoizeOne from 'memoize-one';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/utils';
import { EnvironmentVariable, Secret, SECRET_CONFIG } from '../util';
import { getUserFromGoogleJwt } from '../Users';
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
  const clientId = getEnvVarRequired(EnvironmentVariable.CLIENT_ID);

  const clientSecret = await readSecret(
    SECRET_CONFIG[Secret.GOOGLE_OAUTH_CLIENT_SECRET]
  );

  return {
    clientId: clientId,
    clientSecret: clientSecret,
  };
}

const getOAuthClient = memoizeOne((clientId: string, clientSecret: string) => {
  return new OAuth2Client(clientId, clientSecret, 'postmessage');
});

interface GoogleAuthRequest {
  code: string;
}

export const handleGoogleAuth = async (event: APIGatewayEvent) => {
  const body = parseEventBody<GoogleAuthRequest>(event);

  LOGGER.debug('Initialize database.');
  const dbClient = await getDbClient();

  LOGGER.debug(`Retrieving google user for code ${body.code}`);

  LOGGER.debug('Retrieving OAuth settings for google.');
  const { clientId, clientSecret } = await getGoogleAuthSettings();
  const oauthClient = getOAuthClient(clientId, clientSecret);

  LOGGER.debug('Retrieving token via oauth.');
  const { tokens } = await oauthClient.getToken(body.code);

  if (tokens.id_token === null || tokens.id_token === undefined) {
    LOGGER.error('Invalid token returned.');
    throw new Error('Invalid token returned from google!');
  }

  LOGGER.debug('Retrieving user from google jwt.');
  const userInfo = await getUserFromGoogleJwt(dbClient, tokens.id_token);

  LOGGER.debug('Creating internal jwt.');
  const internalJwt = await createJwt(userInfo);

  const cookies = {
    [GOOGLE_JWT_COOKIE]: tokens.id_token,
    [JWT_COOKIE_NAME]: internalJwt,
    [REFRESH_TOKEN_COOKIE]: tokens.refresh_token,
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

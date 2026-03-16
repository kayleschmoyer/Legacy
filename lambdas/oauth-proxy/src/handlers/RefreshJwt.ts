import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';
import { getUserById } from '@legacy-sports/db-client';
import { Secret, SECRET_CONFIG } from '../util';
import { createJwt } from '../util/jwt';
import {
  buildAuthCookies,
  CSRF_HEADER,
  generateCsrfToken,
  parseJwtFromCookies,
  validateCsrf,
} from '../util/jwt-cookie';
import { withDbClient } from '../util/db';

interface RefreshJwtPayload {
  id?: number;
  username?: string;
  accessLevel?: 'none' | 'user' | 'admin';
  picture?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Maximum time (in seconds) after a JWT has expired that a refresh is still allowed.
 * 30 days — users who haven't visited in over 30 days must re-authenticate.
 */
const REFRESH_GRACE_PERIOD_SECONDS = 30 * 24 * 60 * 60;

/**
 * POST /oauth/refresh-jwt
 *
 * Silently refreshes an expired JWT so the user never notices their session
 * expired during a live browser session.
 *
 * Request:  Authorization: Bearer <expired-or-valid-jwt>
 * Response: { jwt: "<new-jwt>" }
 *
 * Rejects if:
 *  - No token provided
 *  - Token signature is invalid (tampered)
 *  - Token is older than REFRESH_GRACE_PERIOD_SECONDS past its expiry
 *  - User no longer exists in the database
 */
export const handleRefreshJwt = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('handleRefreshJwt: starting');

  const authHeader =
    event.headers['Authorization'] ?? event.headers['authorization'];

  // Support reading the JWT from the HttpOnly cookie (primary) or Authorization header (fallback)
  let token: string | undefined;
  const cookieHeader = event.headers['Cookie'] ?? event.headers['cookie'];

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const cookieJwt = parseJwtFromCookies(cookieHeader);
    if (cookieJwt) {
      token = cookieJwt;
    }
  }

  if (!token) {
    LOGGER.warn('handleRefreshJwt: no JWT in Authorization header or cookie');
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Authorization required' }),
    };
  }

  // When auth is cookie-based (not Bearer header), validate CSRF double-submit
  if (!authHeader?.startsWith('Bearer ')) {
    const csrfHeaderValue =
      event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];
    if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
      LOGGER.warn('handleRefreshJwt: CSRF validation failed');
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'CSRF validation failed' }),
      };
    }
  }

  // Read the JWT signing secret
  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);

  let payload: RefreshJwtPayload;

  try {
    // Verify signature but ignore expiration — we handle the grace window ourselves
    payload = verify(token, jwtKey, {
      ignoreExpiration: true,
    }) as RefreshJwtPayload;
  } catch (err) {
    LOGGER.warn(
      'handleRefreshJwt: token verification failed:',
      err instanceof Error ? err.message : String(err),
    );
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid token' }),
    };
  }

  if (!payload.id) {
    LOGGER.warn('handleRefreshJwt: token payload missing user id');
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid token payload' }),
    };
  }

  // Enforce grace period: reject tokens that expired too long ago
  if (payload.exp) {
    const secondsExpiredFor = Math.floor(Date.now() / 1000) - payload.exp;
    if (secondsExpiredFor > REFRESH_GRACE_PERIOD_SECONDS) {
      LOGGER.info(
        `handleRefreshJwt: token expired ${secondsExpiredFor}s ago — beyond grace period`,
        { userId: payload.id },
      );
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'Token too old to refresh — please sign in again',
        }),
      };
    }
  }

  // Look up the user in the database to confirm they still exist
  return await withDbClient(async (db) => {
    const user = await getUserById(db, payload.id as number);

    if (!user) {
      LOGGER.warn('handleRefreshJwt: user not found in DB', {
        userId: payload.id,
      });
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    // Issue a fresh JWT (same fields, new expiry)
    const newJwt = await createJwt(user, {
      picture: payload.picture,
    });

    LOGGER.info('handleRefreshJwt: issued fresh JWT', { userId: user.id });

    // Set updated HttpOnly cookie + CSRF cookie
    const csrfToken = generateCsrfToken();
    const authCookies = buildAuthCookies(newJwt, csrfToken);

    return {
      statusCode: 200,
      multiValueHeaders: {
        'Set-Cookie': authCookies,
      },
      body: JSON.stringify({ jwt: newJwt }),
    };
  });
};

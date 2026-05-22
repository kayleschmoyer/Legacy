import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sign, verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';
import { getUserById } from '@legacy-sports/db-client';
import { Secret, SECRET_CONFIG } from '../util';
import {
  buildClearImpersonationCookie,
  buildImpersonationCookie,
  CSRF_HEADER,
  parseJwtFromCookies,
  validateCsrf,
} from '../util/jwt-cookie';
import { withDbClient } from '../util/db';

interface JwtPayload {
  id?: number;
  email?: string;
  username?: string;
  accessLevel?: 'none' | 'user' | 'admin';
  picture?: string;
  impersonatedBy?: {
    id: number;
    email: string;
    username: string;
  };
  exp?: number;
  iat?: number;
}

/** Impersonation tokens expire after 2 hours. */
const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;

/**
 * POST /oauth/impersonate
 *
 * Starts an admin impersonation session by setting an HttpOnly cookie
 * (ls_imp_jwt) containing a signed JWT for the target user.
 *
 * Request body: { userId: number }
 * Auth: ls_jwt HttpOnly cookie (admin only) + CSRF validation
 *
 * The impersonation JWT contains an `impersonatedBy` field so the server
 * can distinguish impersonated requests from real user requests.
 *
 * Returns the target user profile for the frontend to update its UI state.
 */
export const handleImpersonate = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('handleImpersonate: starting');

  // Validate CSRF
  const cookieHeader = event.headers['Cookie'] ?? event.headers['cookie'];
  const csrfHeaderValue =
    event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];

  if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
    LOGGER.warn('handleImpersonate: CSRF validation failed');
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'CSRF validation failed' }),
    };
  }

  // Read admin JWT from HttpOnly cookie
  const adminJwt = parseJwtFromCookies(cookieHeader);
  if (!adminJwt) {
    LOGGER.warn('handleImpersonate: no admin JWT in cookie');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Authorization required' }),
    };
  }

  // Verify admin JWT
  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);
  let adminPayload: JwtPayload;
  try {
    adminPayload = verify(adminJwt, jwtKey, {
      algorithms: ['HS256'],
    }) as JwtPayload;
  } catch (err) {
    LOGGER.warn(
      'handleImpersonate: admin JWT verification failed:',
      err instanceof Error ? err.message : String(err),
    );
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid token' }),
    };
  }

  if (adminPayload.accessLevel !== 'admin') {
    LOGGER.warn('handleImpersonate: non-admin attempted impersonation', {
      userId: adminPayload.id,
    });
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden: admin access required' }),
    };
  }

  if (
    typeof adminPayload.id !== 'number' ||
    !Number.isFinite(adminPayload.id)
  ) {
    LOGGER.warn('handleImpersonate: admin JWT missing valid id');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid admin token' }),
    };
  }

  // Parse request body
  let userId: number;
  try {
    const body = JSON.parse(event.body || '{}') as { userId?: number };
    if (!body.userId || typeof body.userId !== 'number') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }
    userId = body.userId;
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  // Look up target user
  return await withDbClient(async (db) => {
    const targetUser = await getUserById(db, userId);
    if (!targetUser) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `User ${userId} not found` }),
      };
    }

    if (targetUser.accessLevel === 'admin') {
      LOGGER.warn('handleImpersonate: attempted to impersonate an admin', {
        actor: adminPayload.id,
        target: userId,
      });
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Forbidden: cannot impersonate another admin user',
        }),
      };
    }

    // Generate impersonation JWT
    const impersonationPayload = {
      id: Number(targetUser.id),
      email: targetUser.email,
      username: targetUser.username ?? '',
      accessLevel: targetUser.accessLevel ?? 'none',
      impersonatedBy: {
        id: Number(adminPayload.id),
        email: adminPayload.email ?? '',
        username: adminPayload.username ?? '',
      },
    };

    const impersonationJwt = sign(impersonationPayload, jwtKey, {
      algorithm: 'HS256',
      expiresIn: IMPERSONATION_TTL_SECONDS,
    });

    // Audit log
    LOGGER.error('Admin impersonation started (cookie-based)', {
      audit: true,
      actor: { id: Number(adminPayload.id) },
      target: { id: Number(targetUser.id) },
      issuedAt: new Date().toISOString(),
      expiresIn: `${IMPERSONATION_TTL_SECONDS}s`,
    });

    // Set the impersonation JWT as an HttpOnly cookie
    const impCookies = buildImpersonationCookie(
      impersonationJwt,
      IMPERSONATION_TTL_SECONDS,
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      multiValueHeaders: {
        'Set-Cookie': impCookies,
      },
      body: JSON.stringify({
        user: {
          id: Number(targetUser.id),
          email: targetUser.email,
          username: targetUser.username ?? '',
          accessLevel: targetUser.accessLevel ?? 'none',
        },
      }),
    };
  });
};

/**
 * POST /oauth/stop-impersonate
 *
 * Ends an admin impersonation session by clearing the ls_imp_jwt cookie.
 * Validates CSRF to prevent cross-site logout attacks.
 */
export const handleStopImpersonate = (
  event: APIGatewayEvent,
): APIGatewayProxyResult => {
  LOGGER.debug('handleStopImpersonate: starting');

  const cookieHeader = event.headers['Cookie'] ?? event.headers['cookie'];
  const csrfHeaderValue =
    event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];

  if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
    LOGGER.warn('handleStopImpersonate: CSRF validation failed');
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'CSRF validation failed' }),
    };
  }

  LOGGER.info('Admin impersonation stopped');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    multiValueHeaders: {
      'Set-Cookie': buildClearImpersonationCookie(),
    },
    body: JSON.stringify({ success: true }),
  };
};

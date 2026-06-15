import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';
import { getUserMfa, setUserMfa } from '@legacy-sports/db-client';
import { Secret, SECRET_CONFIG } from '../util';
import { JWT_AUDIENCE, JWT_ISSUER } from '../util/jwt';
import {
  CSRF_HEADER,
  parseJwtFromCookies,
  validateCsrf,
} from '../util/jwt-cookie';
import { withDbClient } from '../util/db';

/** Issuer label shown in the authenticator app entry (otpauth `issuer`). */
const TOTP_ISSUER = 'Legacy Sports';

interface AuthJwtPayload {
  id?: number;
  email?: string;
  username?: string;
  accessLevel?: 'none' | 'user' | 'admin';
  exp?: number;
  iat?: number;
}

/** The authenticated caller resolved from the request JWT. */
interface AuthenticatedUser {
  id: number;
  email: string;
}

type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: APIGatewayProxyResult };

const jsonResponse = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Resolve the authenticated user from the request, using the same JWT/cookie
 * scheme as the other authenticated oauth-proxy endpoints:
 *  - prefer the `Authorization: Bearer <jwt>` header,
 *  - otherwise read the HttpOnly `ls_jwt` cookie and enforce the CSRF
 *    double-submit (cookie-based auth is the only browser-replayable path).
 *
 * Returns the user id + email on success, or a ready-to-return error response.
 */
async function authenticateUser(event: APIGatewayEvent): Promise<AuthResult> {
  const authHeader =
    event.headers['Authorization'] ?? event.headers['authorization'];
  const cookieHeader = event.headers['Cookie'] ?? event.headers['cookie'];

  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
  const isBearer = bearerToken !== undefined;
  const token = bearerToken ?? parseJwtFromCookies(cookieHeader);

  if (!token) {
    LOGGER.warn('MFA: no JWT in Authorization header or cookie');
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Authorization required' }),
    };
  }

  // Cookie-based auth is replayable cross-site, so require the CSRF token.
  if (!isBearer) {
    const csrfHeaderValue =
      event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];
    if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
      LOGGER.warn('MFA: CSRF validation failed');
      return {
        ok: false,
        response: jsonResponse(403, { error: 'CSRF validation failed' }),
      };
    }
  }

  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);
  let payload: AuthJwtPayload;
  try {
    payload = verify(token, jwtKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as AuthJwtPayload;
  } catch (err) {
    LOGGER.warn(
      'MFA: token verification failed:',
      err instanceof Error ? err.message : String(err),
    );
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Invalid token' }),
    };
  }

  if (typeof payload.id !== 'number' || !Number.isFinite(payload.id)) {
    LOGGER.warn('MFA: token payload missing valid user id');
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Invalid token payload' }),
    };
  }

  return {
    ok: true,
    user: { id: payload.id, email: payload.email ?? `user-${payload.id}` },
  };
}

/**
 * POST /oauth/mfa/enroll
 *
 * Begins TOTP enrollment for the authenticated user: generates a fresh secret
 * and an `otpauth://` provisioning URI (for the authenticator-app QR code) and
 * persists the secret as *pending* — `mfa_enabled` stays false until the user
 * confirms a code via /oauth/mfa/verify-setup.
 *
 * Auth: ls_jwt cookie (+ CSRF) or Authorization: Bearer <jwt>.
 * Response: { secret, otpauthUri }.
 */
export const handleMfaEnroll = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('handleMfaEnroll: starting');

  const auth = await authenticateUser(event);
  if (!auth.ok) return auth.response;
  const { id: userId, email } = auth.user;

  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(email, TOTP_ISSUER, secret);

  return await withDbClient(async (db) => {
    // Store the secret as pending — enrollment is not yet confirmed.
    await setUserMfa(db, userId, { mfaEnabled: false, totpSecret: secret });

    LOGGER.info('handleMfaEnroll: stored pending TOTP secret', { userId });

    return jsonResponse(200, { secret, otpauthUri });
  });
};

/**
 * GET /oauth/mfa/status
 *
 * Returns the MFA enrollment state for the authenticated user.
 *
 * Auth: ls_jwt cookie (+ CSRF) or Authorization: Bearer <jwt>.
 * Response: { mfaEnabled: boolean }.
 */
export const handleMfaStatus = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('handleMfaStatus: starting');

  const auth = await authenticateUser(event);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  return await withDbClient(async (db) => {
    const mfa = await getUserMfa(db, userId);
    return jsonResponse(200, { mfaEnabled: mfa?.mfaEnabled ?? false });
  });
};

/**
 * POST /oauth/mfa/disable
 *
 * Disables TOTP 2FA for the authenticated user. Clears the stored secret
 * and sets mfa_enabled = false.
 *
 * Auth: ls_jwt cookie (+ CSRF) or Authorization: Bearer <jwt>.
 * Response: { success: true }.
 */
export const handleMfaDisable = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('handleMfaDisable: starting');

  const auth = await authenticateUser(event);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  return await withDbClient(async (db) => {
    await setUserMfa(db, userId, { mfaEnabled: false, totpSecret: null });
    LOGGER.info('handleMfaDisable: MFA disabled', { userId });
    return jsonResponse(200, { success: true });
  });
};

/**
 * POST /oauth/mfa/verify-setup
 *
 * Confirms TOTP enrollment for the authenticated user. Enables MFA only when
 * the submitted code validates against the pending secret stored by
 * /oauth/mfa/enroll. An invalid code returns 401 and leaves MFA disabled.
 *
 * Auth: ls_jwt cookie (+ CSRF) or Authorization: Bearer <jwt>.
 * Request body: { code: string }.
 * Response: { success: true } on success.
 */
export const handleMfaVerifySetup = async (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  LOGGER.debug('handleMfaVerifySetup: starting');

  const auth = await authenticateUser(event);
  if (!auth.ok) return auth.response;
  const { id: userId } = auth.user;

  let code: string;
  try {
    const body = JSON.parse(event.body || '{}') as { code?: unknown };
    if (typeof body.code !== 'string' || body.code.trim() === '') {
      return jsonResponse(400, { error: 'code is required' });
    }
    code = body.code.trim();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  return await withDbClient(async (db) => {
    const mfa = await getUserMfa(db, userId);

    if (!mfa || !mfa.totpSecret) {
      LOGGER.warn('handleMfaVerifySetup: no pending TOTP enrollment', {
        userId,
      });
      return jsonResponse(400, { error: 'No pending MFA enrollment' });
    }

    const isValid = authenticator.verify({
      token: code,
      secret: mfa.totpSecret,
    });
    if (!isValid) {
      LOGGER.warn('handleMfaVerifySetup: invalid TOTP code', { userId });
      return jsonResponse(401, { error: 'Invalid code' });
    }

    await setUserMfa(db, userId, {
      mfaEnabled: true,
      totpSecret: mfa.totpSecret,
    });

    LOGGER.info('handleMfaVerifySetup: MFA enabled', { userId });

    return jsonResponse(200, { success: true });
  });
};

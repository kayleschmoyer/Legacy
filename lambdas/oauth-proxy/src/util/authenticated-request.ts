import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { readSecret } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { verify } from 'jsonwebtoken';
import { JWT_AUDIENCE, JWT_ISSUER } from './jwt';
import { CSRF_HEADER, parseJwtFromCookies, validateCsrf } from './jwt-cookie';
import { Secret, SECRET_CONFIG } from '../util';

/**
 * Shared authentication helpers for the cookie-authenticated account-management
 * endpoints (identity link / unlink). Extracted from the Discord handler so the
 * Google and Apple link flows enforce the exact same JWT + CSRF checks rather
 * than re-implementing them.
 */

/** The authenticated caller resolved from the request JWT. */
export interface AuthenticatedUser {
  id: number;
  email: string;
}

export type AuthResult =
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
 * Resolve the authenticated user from the request.
 * Accepts both Bearer token (Authorization header) and HttpOnly JWT cookie
 * (requires CSRF double-submit for cookie-based auth).
 */
export async function getAuthenticatedUser(
  event: APIGatewayEvent,
): Promise<AuthResult> {
  const authHeader =
    event.headers['Authorization'] ?? event.headers['authorization'];
  const cookieHeader = event.headers['Cookie'] ?? event.headers['cookie'];

  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
  const isBearer = bearerToken !== undefined;
  const token = bearerToken ?? parseJwtFromCookies(cookieHeader);

  if (!token) {
    LOGGER.warn(
      'getAuthenticatedUser: no JWT in Authorization header or cookie',
    );
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Authorization required' }),
    };
  }

  if (!isBearer) {
    const csrfHeaderValue =
      event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];
    if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
      LOGGER.warn('getAuthenticatedUser: CSRF validation failed');
      return {
        ok: false,
        response: jsonResponse(403, { error: 'CSRF validation failed' }),
      };
    }
  }

  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);
  let payload: { id?: number; email?: string };
  try {
    payload = verify(token, jwtKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { id?: number; email?: string };
  } catch (err) {
    LOGGER.warn(
      'getAuthenticatedUser: token verification failed:',
      err instanceof Error ? err.message : String(err),
    );
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Invalid token' }),
    };
  }

  if (typeof payload.id !== 'number' || !Number.isFinite(payload.id)) {
    LOGGER.warn('getAuthenticatedUser: token payload missing valid user id');
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
 * Extract and verify the authenticated user id from the internal JWT cookie.
 * Returns null when the request is unauthenticated or the token is invalid.
 */
export async function getAuthenticatedUserId(
  event: APIGatewayEvent,
): Promise<number | null> {
  const cookieHeader = event.headers?.['Cookie'] ?? event.headers?.['cookie'];
  const jwtToken = parseJwtFromCookies(cookieHeader);
  if (!jwtToken) return null;

  try {
    const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);
    const decoded = verify(jwtToken, jwtKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { id: number };
    return decoded.id;
  } catch {
    return null;
  }
}

/** A caller resolved from a top-level browser navigation. */
export interface NavigationUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

/**
 * Resolve the signed-in user for a **top-level browser navigation** (a GET the
 * user reached by following a link or scanning a QR code). Returns null when
 * there is no valid session cookie.
 *
 * Deliberately does NOT require the CSRF double-submit that
 * {@link getAuthenticatedUser} enforces, and that is the whole reason this
 * exists: a browser following a link sends no `X-CSRF-Token` header, so
 * `getAuthenticatedUser` rejects every such request with a 403. CSRF protection
 * guards state-changing requests made on a user's behalf from another origin;
 * this is for safe GETs whose response the attacking origin cannot read anyway
 * (an opaque cross-origin response). **Do not use it for anything that mutates
 * state on the strength of the caller's identity** — use `getAuthenticatedUser`
 * there and keep the CSRF check.
 *
 * Cookie-only by design: a top-level navigation has no Authorization header, so
 * accepting a Bearer token here would only widen the surface.
 *
 * `isAdmin` is derived from the JWT's `accessLevel` claim (minted in
 * util/jwt.ts), matching how lambdas/db reads it — no database round-trip.
 */
export async function getNavigationUser(
  event: APIGatewayEvent,
): Promise<NavigationUser | null> {
  const cookieHeader = event.headers?.['Cookie'] ?? event.headers?.['cookie'];
  const token = parseJwtFromCookies(cookieHeader);
  if (!token) return null;

  try {
    const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);
    const payload = verify(token, jwtKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { id?: number; email?: string; accessLevel?: string };

    if (typeof payload.id !== 'number' || !Number.isFinite(payload.id)) {
      LOGGER.warn('getNavigationUser: token payload missing valid user id');
      return null;
    }

    return {
      id: payload.id,
      email: payload.email ?? `user-${payload.id}`,
      isAdmin: payload.accessLevel === 'admin',
    };
  } catch (err) {
    LOGGER.warn(
      'getNavigationUser: token verification failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Validate the CSRF double-submit token for a cookie-authenticated request.
 * Returns an error response when validation fails, or null when it passes.
 */
export function requireCsrf(
  event: APIGatewayEvent,
): APIGatewayProxyResult | null {
  const cookieHeader = event.headers?.['Cookie'] ?? event.headers?.['cookie'];
  const csrfHeaderValue =
    event.headers?.[CSRF_HEADER] ?? event.headers?.['X-CSRF-Token'];

  if (!validateCsrf(csrfHeaderValue, cookieHeader)) {
    LOGGER.warn('CSRF validation failed');
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'CSRF validation failed' }),
    };
  }
  return null;
}

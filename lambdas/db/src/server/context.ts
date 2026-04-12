import { verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface ImpersonatedBy {
  id: number;
  email?: string;
  username: string;
}

export interface JWTPayload {
  id: number | string;
  email?: string;
  username: string;
  accessLevel?: string;
  isAdmin?: boolean;
  impersonatedBy?: ImpersonatedBy;
  [key: string]: unknown; // For other JWT standard fields
}

export interface User {
  id: number;
  email?: string;
  username: string;
  isAdmin: boolean;
  /** Present when this session was created by an admin via impersonation. */
  impersonatedBy?: ImpersonatedBy;
}

const JWT_SECRET_NAME = process.env['JWT_SECRET_NAME'] || '';
const JWT_SECRET_LOCAL = process.env['JWT_SECRET'] || '';
let jwtSecretPromise: Promise<string> | null = null;

export async function getJwtSecret(): Promise<string> {
  // Local dev shortcut: JWT_SECRET env var skips Secrets Manager lookup
  if (JWT_SECRET_LOCAL) {
    return JWT_SECRET_LOCAL;
  }

  if (!JWT_SECRET_NAME) {
    throw new Error('JWT_SECRET_NAME is not set');
  }

  if (!jwtSecretPromise) {
    jwtSecretPromise = retrieveSecretParameterValue(JWT_SECRET_NAME);
  }

  return jwtSecretPromise;
}

export function parseUserFromJwtPayload(payload: JWTPayload): User {
  const idRaw = payload.id;
  const id = typeof idRaw === 'string' ? Number(idRaw) : idRaw;
  if (!Number.isFinite(id)) {
    throw new Error('Invalid JWT payload: id must be a number');
  }

  if (typeof payload.username !== 'string' || payload.username.length === 0) {
    throw new Error('Invalid JWT payload: username is required');
  }

  const accessLevel =
    typeof payload.accessLevel === 'string' ? payload.accessLevel : undefined;

  let impersonatedBy: ImpersonatedBy | undefined;
  if (
    payload.impersonatedBy &&
    typeof payload.impersonatedBy === 'object' &&
    typeof payload.impersonatedBy.id === 'number' &&
    typeof payload.impersonatedBy.username === 'string'
  ) {
    const raw = payload.impersonatedBy;
    impersonatedBy = {
      id: raw.id,
      username: raw.username,
      email: typeof raw.email === 'string' ? raw.email : undefined,
    };
  }

  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    username: payload.username,
    isAdmin: payload.isAdmin === true || accessLevel === 'admin',
    impersonatedBy,
  };
}

/**
 * Cookie names for the HttpOnly JWT cookies set by the OAuth proxy.
 */
const JWT_COOKIE = 'ls_jwt';
const IMP_JWT_COOKIE = 'ls_imp_jwt';
const CSRF_COOKIE = 'ls_csrf';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Extract and verify the user from the Authorization header.
 * Returns null if no valid token is present.
 */
export async function extractUserFromEvent(
  authorization: string | undefined,
): Promise<User | null> {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authorization.substring(7); // Remove 'Bearer ' prefix
    const jwtSecret = await getJwtSecret();
    const decoded = verify(token, jwtSecret, {
      algorithms: ['HS256'],
    }) as JWTPayload;
    return parseUserFromJwtPayload(decoded);
  } catch (error) {
    LOGGER.warn('Failed to decode JWT', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Parse a named cookie value from a Cookie header string.
 */
function parseCookieValue(
  cookieHeader: string | undefined,
  cookieName: string,
): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === cookieName) {
      return valueParts.join('=') || null;
    }
  }
  return null;
}

/**
 * Parse the JWT value from a Cookie header string.
 */
function parseJwtFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  return parseCookieValue(cookieHeader, JWT_COOKIE);
}

/**
 * Parse the impersonation JWT from a Cookie header string.
 */
function parseImpersonationJwtFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  return parseCookieValue(cookieHeader, IMP_JWT_COOKIE);
}

/**
 * Parse the CSRF token from a Cookie header string.
 */
function parseCsrfFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === CSRF_COOKIE) {
      return valueParts.join('=') || null;
    }
  }
  return null;
}

/**
 * Constant-time comparison to prevent timing attacks on CSRF validation.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Extract and verify the user from an API Gateway event.
 *
 * Auth sources (checked in order):
 * 1. Authorization: Bearer <jwt> header — used by mobile, CLI, system callers
 * 2. ls_imp_jwt HttpOnly cookie — impersonation session (requires valid CSRF)
 * 3. ls_jwt HttpOnly cookie — used by the web frontend (requires valid CSRF)
 *
 * When auth comes from a cookie, the X-CSRF-Token header must match the
 * ls_csrf cookie value (double-submit cookie pattern).
 */
export async function extractUserFromApiEvent(
  event: APIGatewayProxyEvent,
): Promise<User | null> {
  // 1. Try Authorization header first (mobile, CLI, system callers)
  const authorization =
    event.headers.authorization || event.headers.Authorization;
  if (authorization?.startsWith('Bearer ')) {
    return extractUserFromEvent(authorization);
  }

  // 2. Try HttpOnly cookies (impersonation cookie takes priority over regular JWT)
  const cookieHeader = event.headers.Cookie ?? event.headers.cookie;

  // Check for impersonation cookie first, fall back to regular JWT
  const impersonationJwt = parseImpersonationJwtFromCookieHeader(cookieHeader);
  const cookieJwt = impersonationJwt ?? parseJwtFromCookieHeader(cookieHeader);
  if (!cookieJwt) return null;

  // Validate CSRF double-submit: header must match cookie
  const csrfHeader =
    event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];
  const csrfCookie = parseCsrfFromCookieHeader(cookieHeader);

  if (!csrfHeader || !csrfCookie || !timingSafeEqual(csrfHeader, csrfCookie)) {
    LOGGER.warn('CSRF validation failed for cookie-based auth');
    return null;
  }

  try {
    const jwtSecret = await getJwtSecret();
    const decoded = verify(cookieJwt, jwtSecret, {
      algorithms: ['HS256'],
    }) as JWTPayload;
    return parseUserFromJwtPayload(decoded);
  } catch (error) {
    LOGGER.warn('Failed to decode JWT from cookie', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

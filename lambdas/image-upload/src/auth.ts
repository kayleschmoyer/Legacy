import { verify } from 'jsonwebtoken';
import type { APIGatewayEvent } from 'aws-lambda';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';

const JWT_SECRET_NAME = process.env['JWT_SECRET_NAME'] ?? '';
const JWT_SECRET_LOCAL = process.env['JWT_SECRET'] ?? '';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'ls_csrf';

let jwtSecretPromise: Promise<string> | null = null;

async function getJwtSecret(): Promise<string> {
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

/**
 * Parse cookies from the Cookie header into a key→value map.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

/**
 * Timing-safe string comparison to prevent timing attacks on CSRF tokens.
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
 * Extract and verify the JWT from the incoming request.
 * Accepts either:
 *   1. Authorization: Bearer <token>  (mobile clients, CLI)
 *   2. ls_jwt HttpOnly cookie (web frontend) — requires CSRF double-submit validation
 *
 * Cookie-based auth requires the X-CSRF-Token header to match the ls_csrf cookie
 * value (double-submit cookie pattern). Bearer token requests are CSRF-exempt.
 *
 * Returns the authenticated user ID on success, throws on failure.
 */
export async function getAuthenticatedUserId(
  event: APIGatewayEvent,
): Promise<number> {
  const jwtSecret = await getJwtSecret();

  // 1. Try Authorization: Bearer header first (mobile, CLI — CSRF-exempt)
  const authHeader =
    event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verify(token, jwtSecret) as { id: number | string };
    const id =
      typeof payload.id === 'string' ? parseInt(payload.id, 10) : payload.id;
    if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid JWT id');
    return id;
  }

  // 2. Fall back to ls_jwt cookie (web frontend — requires CSRF validation)
  const cookieHeader = event.headers['cookie'] ?? event.headers['Cookie'] ?? '';
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const token = cookies['ls_jwt'];
    if (token) {
      // Validate CSRF double-submit: X-CSRF-Token header must match ls_csrf cookie
      const csrfHeader =
        event.headers[CSRF_HEADER] ?? event.headers['X-CSRF-Token'];
      const csrfCookie = cookies[CSRF_COOKIE];

      if (
        !csrfHeader ||
        !csrfCookie ||
        !timingSafeEqual(csrfHeader, csrfCookie)
      ) {
        LOGGER.warn(
          'image-upload: CSRF validation failed for cookie-based auth',
        );
        throw new Error('CSRF validation failed');
      }

      const payload = verify(token, jwtSecret) as { id: number | string };
      const id =
        typeof payload.id === 'string' ? parseInt(payload.id, 10) : payload.id;
      if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid JWT id');
      return id;
    }
  }

  throw new Error('No authentication token provided');
}

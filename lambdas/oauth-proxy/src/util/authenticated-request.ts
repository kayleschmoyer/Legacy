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

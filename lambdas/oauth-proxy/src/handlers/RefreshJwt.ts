import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sign, verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import { readSecret } from '@legacy-sports/aws-utils';
import { getUserById } from '@legacy-sports/db-client';
import type { EntitlementKey } from '@legacy-sports/utils';
import { Secret, SECRET_CONFIG } from '../util';
import { createJwt, generateJti, JWT_AUDIENCE, JWT_ISSUER } from '../util/jwt';
import { isEntitlementKey } from '../util/entitlements';
import {
  buildAuthCookies,
  buildImpersonationCookie,
  CSRF_HEADER,
  generateCsrfToken,
  parseCsrfFromCookies,
  parseImpersonationJwtFromCookies,
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
  /** Entitlement lookup_keys minted by LS-8644; carried forward on refresh. */
  entitlements?: unknown;
  impersonatedBy?: {
    id: number;
    email: string;
    username: string;
  };
  [key: string]: unknown;
}

/**
 * Narrow an arbitrary prior-token `entitlements` claim to the code catalog.
 *
 * Returns `undefined` when the claim is absent (e.g. a token minted before
 * LS-8644) so the re-mint fails closed on a persistent Stripe failure; returns
 * the filtered lookup_keys (possibly empty) when a claim was present so those
 * are carried forward. Any value that is not a valid catalog key is dropped.
 */
function parsePriorEntitlements(
  claim: unknown,
): readonly EntitlementKey[] | undefined {
  if (!Array.isArray(claim)) return undefined;
  return claim.filter(isEntitlementKey);
}

/** Impersonation tokens expire after 2 hours. */
const IMPERSONATION_TTL_SECONDS = 2 * 60 * 60;

/**
 * Maximum time (in seconds) after a JWT has expired that a refresh is still allowed.
 * 7 days — limits the blast radius of a stolen JWT (LS-2547). Users who haven't
 * visited in over 7 days must re-authenticate via the full OAuth flow.
 */
const REFRESH_GRACE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

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

  // When auth is cookie-based (not Bearer header), validate CSRF double-submit.
  // The validated token is carried forward into the refreshed cookies below.
  let validatedCsrfToken: string | null = null;
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
    validatedCsrfToken = parseCsrfFromCookies(cookieHeader);
  }

  // Read the JWT signing secret
  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);

  let payload: RefreshJwtPayload;

  try {
    // Verify signature but ignore expiration — we handle the grace window ourselves
    payload = verify(token, jwtKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
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

  // Check for an active impersonation session (ls_imp_jwt cookie).
  // When present, refresh both the impersonation token and the admin's token.
  const impersonationJwt = parseImpersonationJwtFromCookies(cookieHeader);
  let impPayload: RefreshJwtPayload | null = null;
  if (impersonationJwt) {
    try {
      impPayload = verify(impersonationJwt, jwtKey, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        ignoreExpiration: true,
      }) as RefreshJwtPayload;
    } catch {
      // Impersonation token is invalid — ignore and let it expire
      LOGGER.warn('handleRefreshJwt: impersonation JWT verification failed');
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

    // Issue a fresh JWT (same fields, new expiry). `sign()` stamps a fresh iat
    // by default, so a refreshed token passes downstream staleness checks
    // (LS-8643). Re-mint the entitlements claim from live Stripe, carrying the
    // prior token's claim forward if Stripe is persistently unreachable
    // (LS-8644 / LS-8638 Resolved Decisions #1).
    const newJwt = await createJwt(user, {
      picture: payload.picture,
      fallbackEntitlements: parsePriorEntitlements(payload.entitlements),
      // Reuse this handler's client and the key already read above so the
      // mint costs neither a second connection nor a second Secrets Manager
      // round trip (LS-9530).
      db,
      jwtKey,
    });

    LOGGER.info('handleRefreshJwt: issued fresh JWT', { userId: user.id });

    // Set updated HttpOnly cookie + CSRF cookie. Keep the CSRF token the
    // request just proved it holds instead of rotating it (LS-10447): the
    // web app has several independent refresh callers (AuthService's mount /
    // proactive refresh, the Apollo error link, useIsPremium) plus multiple
    // tabs, and rotating here let a request whose X-CSRF-Token header was read
    // before a sibling refresh's Set-Cookie landed arrive with the NEW cookie
    // and the OLD header — a 403 that signed the user out. The double-submit
    // check only needs an unguessable value bound to this browser; rotation
    // added no protection. Bearer-auth refreshes have no prior CSRF cookie and
    // still get a fresh one.
    const csrfToken = validatedCsrfToken ?? generateCsrfToken();
    const authCookies = buildAuthCookies(newJwt, csrfToken);
    const allCookies = [...authCookies];

    // If impersonation is active, also refresh the impersonation token
    if (impPayload?.impersonatedBy && impPayload.id) {
      const impUser = await getUserById(db, impPayload.id);
      if (impUser && impUser.accessLevel !== 'admin') {
        // Verify the admin (the person doing the impersonating) is still an admin
        // and that the impersonation cookie belongs to this admin session
        if (
          user.accessLevel === 'admin' &&
          impPayload.impersonatedBy.id === Number(user.id)
        ) {
          const refreshedImpPayload = {
            id: Number(impUser.id),
            email: impUser.canonicalEmail,
            username: impUser.username ?? '',
            accessLevel: impUser.accessLevel ?? 'none',
            impersonatedBy: impPayload.impersonatedBy,
          };
          const refreshedImpJwt = sign(refreshedImpPayload, jwtKey, {
            algorithm: 'HS256',
            expiresIn: IMPERSONATION_TTL_SECONDS,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            jwtid: generateJti(),
          });
          allCookies.push(
            ...buildImpersonationCookie(
              refreshedImpJwt,
              IMPERSONATION_TTL_SECONDS,
            ),
          );
          LOGGER.info('handleRefreshJwt: refreshed impersonation JWT', {
            adminId: impPayload.impersonatedBy.id,
            targetId: impUser.id,
          });
        } else {
          LOGGER.warn(
            'handleRefreshJwt: admin lost admin access, not refreshing impersonation',
            { userId: user.id },
          );
        }
      }
    }

    return {
      statusCode: 200,
      multiValueHeaders: {
        'Set-Cookie': allCookies,
      },
      body: JSON.stringify({ jwt: newJwt, csrfToken }),
    };
  });
};

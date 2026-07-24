import { sign } from 'jsonwebtoken';
import { readSecret } from '@legacy-sports/aws-utils';
import { InternalUser } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import type { EntitlementKey } from '@legacy-sports/utils';
import { randomBytes } from 'node:crypto';
import { getStripeCustomerId } from './db';
import { fetchActiveEntitlements } from './entitlements';
import { Secret, SECRET_CONFIG } from '../util';

export const JWT_COOKIE_NAME = 'legacy-sports-internal-jwt';

/** Issuer claim for internal JWTs minted by oauth-proxy. */
export const JWT_ISSUER = 'legacy-sports-oauth-proxy';

/** Audience claim required by all internal Legacy Sports lambdas. */
export const JWT_AUDIENCE = 'legacy-sports';

/**
 * Per-attempt timeout for the live Stripe entitlement read at mint time. Kept
 * short so a slow/unreachable Stripe never blocks token issuance — on timeout
 * we fall back per {@link resolveEntitlements} rather than hang the login.
 */
const STRIPE_FETCH_TIMEOUT_MS = 2000;

/** Total Stripe fetch attempts at mint time (initial + one retry). */
const STRIPE_FETCH_MAX_ATTEMPTS = 2;

/** Backoff between Stripe fetch attempts. */
const STRIPE_FETCH_BACKOFF_MS = 150;

/** Generate a fresh per-token id (jti) — 16 random bytes, hex-encoded. */
export function generateJti(): string {
  return randomBytes(16).toString('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reject with a timeout error if `promise` does not settle within `ms`. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Resolve the live Stripe entitlement lookup_keys to embed in a freshly minted
 * JWT (LS-8644). Implements the epic's mint-time fallback policy (LS-8638
 * Resolved Decisions #1):
 *
 * - Free users / users with no Stripe customer → empty claim (no Stripe call).
 * - Otherwise the Stripe read is attempted with at least one retry (short
 *   timeout + backoff).
 * - On persistent failure: a REFRESH (a prior claim is supplied via
 *   `fallbackEntitlements`) carries that claim forward; a FRESH LOGIN (no prior
 *   claim) fails closed to an empty claim and self-heals on the next refresh.
 *
 * Every fallback path is logged. Enforcement of the claim is out of scope here
 * (LS-8643) — this only mints it.
 */
export async function resolveEntitlements(
  user: InternalUser,
  fallbackEntitlements?: readonly EntitlementKey[],
): Promise<EntitlementKey[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= STRIPE_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const customerId = await getStripeCustomerId(user.id);
      if (!customerId) {
        // Free user / no Stripe customer → empty claim, no Stripe round-trip.
        return [];
      }
      return await withTimeout(
        fetchActiveEntitlements(customerId),
        STRIPE_FETCH_TIMEOUT_MS,
        'fetchActiveEntitlements',
      );
    } catch (error) {
      lastError = error;
      LOGGER.warn('resolveEntitlements: Stripe entitlement read failed', {
        userId: user.id,
        attempt,
        maxAttempts: STRIPE_FETCH_MAX_ATTEMPTS,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < STRIPE_FETCH_MAX_ATTEMPTS) {
        await sleep(STRIPE_FETCH_BACKOFF_MS);
      }
    }
  }

  const lastErrorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);

  if (fallbackEntitlements !== undefined) {
    // REFRESH: carry forward the prior token's entitlements claim.
    LOGGER.warn(
      'resolveEntitlements: carrying forward prior entitlements after persistent Stripe failure',
      {
        userId: user.id,
        count: fallbackEntitlements.length,
        lastError: lastErrorMessage,
      },
    );
    return [...fallbackEntitlements];
  }

  // FRESH LOGIN: no prior claim to carry → fail closed to an empty claim.
  LOGGER.warn(
    'resolveEntitlements: failing closed to empty entitlements after persistent Stripe failure (fresh login)',
    { userId: user.id, lastError: lastErrorMessage },
  );
  return [];
}

export async function createJwt(
  user: InternalUser,
  additionalFields?: {
    picture?: string;
    /**
     * Prior token's entitlements, carried forward if the live Stripe read
     * fails persistently (REFRESH path). Omit for fresh logins so a persistent
     * failure fails closed to an empty claim. See {@link resolveEntitlements}.
     */
    fallbackEntitlements?: readonly EntitlementKey[];
  },
): Promise<string> {
  const jwtKey = await readSecret(SECRET_CONFIG[Secret.JWT_SECRET]);

  const entitlements = await resolveEntitlements(
    user,
    additionalFields?.fallbackEntitlements,
  );

  const picture = user.avatarUrl ?? additionalFields?.picture;
  const jwt = {
    accessLevel: user.accessLevel,
    email: user.canonicalEmail,
    // Live Stripe entitlement lookup_keys (LS-8644). Plain JSON array — no
    // bitmask/compact encoding (LS-8638 Resolved Decisions #2). Minted here but
    // not yet enforced; enforcement is LS-8643.
    entitlements,
    // Whether this user has a local password set. OAuth-only accounts
    // (Google/Discord) have no password, so the client must not present a
    // password re-entry challenge to them (step-up, LS-7834). Derived here so
    // the raw hash never leaves the server.
    hasPassword: !!user.passwordHash,
    id: user.id,
    mfaEnabled: user.mfaEnabled,
    subscriptionTier: user.subscriptionTier,
    username: user.username,
    ...(picture && { picture }),
  };

  LOGGER.debug('Creating JWT for user:', {
    id: user.id,
    accessLevel: user.accessLevel,
  });

  const signedToken = sign(jwt, jwtKey, {
    algorithm: 'HS256',
    expiresIn: '24h',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: generateJti(),
  });

  LOGGER.debug('JWT signed, length:', signedToken.length);

  return signedToken;
}

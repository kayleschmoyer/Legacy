import {
  createSubscriptionService,
  getSubscriptionByUserId,
  InternalDb,
  runWithInternalClient,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';

export interface DbCredentials {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
}

/**
 * Execute database operations with automatic connection management.
 * Replaces the previous memoizeOne pattern for consistent architecture.
 *
 * @param callback - Function that receives the database client
 * @returns Result of the callback function
 */
export async function withDbClient<T>(
  callback: (db: InternalDb) => Promise<T>,
): Promise<T> {
  return await runWithInternalClient(getDbOptions(), callback);
}

/**
 * Resolve a user's Stripe customer id from their subscriptions record.
 *
 * Returns the `stripe_customer_id` from the user's subscription row, or `null`
 * when the user has no subscription row or no Stripe customer (e.g. a free user
 * who never checked out, or one whose subscription came from Apple/Google IAP).
 *
 * Consumed by the JWT-mint slice (LS-8644) to look up the Stripe customer whose
 * live entitlements are minted into the token.
 *
 * Pass `db` whenever the caller already holds a client. Every JWT mint happens
 * inside a handler that has already opened one, and without threading it here
 * this lookup opened a *second* connection per request — a full
 * credentials-resolve + TCP/TLS connect cycle for a single indexed SELECT
 * (LS-9530). Omitting `db` preserves the original self-connecting behaviour for
 * callers that genuinely have no client in scope.
 */
export async function getStripeCustomerId(
  userId: number,
  db?: InternalDb,
): Promise<string | null> {
  if (db) {
    const subscription = await getSubscriptionByUserId(db, userId);
    return subscription?.stripeCustomerId ?? null;
  }

  const subscription =
    await createSubscriptionService(getDbOptions()).getSubscriptionByUserId(
      userId,
    );
  return subscription?.stripeCustomerId ?? null;
}

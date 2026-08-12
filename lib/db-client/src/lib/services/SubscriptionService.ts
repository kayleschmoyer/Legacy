import { desc, eq } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
import { runWithInternalClient } from '../client/Helpers';
import * as InternalSchema from '../../drizzle/internal/schema';

export interface UserSubscription {
  id: number;
  userId: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  appleOriginalTransactionId: string | null;
  appleProductId: string | null;
  appleLastNotificationType: string | null;
  googlePurchaseToken: string | null;
  googleProductId: string | null;
  status: string;
  tier: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SubscriptionService {
  constructor(private options: DbOptions) {}

  /**
   * Get the active subscription record for a user.
   * Returns null if the user has no subscription row.
   *
   * Ordered by created_at DESC (id DESC tiebreaker) so a user with more than
   * one subscription row — e.g. a canceled/Apple row plus a new Stripe row —
   * always resolves to the most recent one. Without ordering, `.limit(1)` can
   * return an arbitrary row, including a stale free/canceled one, which left
   * paying users' JWT-minted entitlements empty even after a fresh login
   * (same class of bug as LS-5201, fixed there for `getSubscriptionForUser`).
   */
  async getSubscriptionByUserId(
    userId: number,
  ): Promise<UserSubscription | null> {
    return runWithInternalClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(InternalSchema.subscriptions)
        .where(eq(InternalSchema.subscriptions.userId, userId))
        .orderBy(
          desc(InternalSchema.subscriptions.createdAt),
          desc(InternalSchema.subscriptions.id),
        )
        .limit(1);

      return results[0] ?? null;
    });
  }
}

export function createSubscriptionService(
  options: DbOptions,
): SubscriptionService {
  return new SubscriptionService(options);
}

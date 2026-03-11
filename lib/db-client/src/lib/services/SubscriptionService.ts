import { eq } from 'drizzle-orm';
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
   */
  async getSubscriptionByUserId(
    userId: number,
  ): Promise<UserSubscription | null> {
    return runWithInternalClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(InternalSchema.subscriptions)
        .where(eq(InternalSchema.subscriptions.userId, userId))
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

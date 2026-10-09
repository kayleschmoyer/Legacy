/**
 * TierChangeSideEffectsService
 *
 * Single home for the league-level side effects of a subscription tier change.
 * Every path that writes `users.subscription_tier` (Stripe webhook, Apple IAP
 * webhook, the db lambda's Apple/Google verify + restore mutations) calls this
 * so the policy lives in exactly one place (LS-7397).
 */

import { LOGGER } from '@legacy-sports/logging';
import { DbOptions } from '@legacy-sports/utils/node';
import {
  clearLeagueTierFreezes,
  handleSubscriptionDowngrade,
} from './SubscriptionDowngradeService';

/**
 * Apply league-level side effects when a user's subscription tier changes.
 *
 * - any → free: run the downgrade handler (freeze excess leagues, convert
 *   salary-cap / FAAB-waiver settings)
 * - free → premium: clear any tier-based league freezes
 * - no change (or null → premium): no-op
 */
export async function applyTierChangeSideEffects(
  userId: number,
  previousTier: 'free' | 'premium' | null,
  newTier: 'free' | 'premium',
  dbOptions: DbOptions,
): Promise<void> {
  if (previousTier === newTier) return;

  if (newTier === 'free') {
    LOGGER.info('Tier downgrade detected — applying downgrade restrictions', {
      userId,
      previousTier,
      newTier,
    });
    await handleSubscriptionDowngrade(userId, dbOptions);
  } else if (newTier === 'premium' && previousTier === 'free') {
    LOGGER.info('Tier upgrade detected — clearing tier freezes', {
      userId,
      previousTier,
      newTier,
    });
    await clearLeagueTierFreezes(userId, dbOptions);
  }
}

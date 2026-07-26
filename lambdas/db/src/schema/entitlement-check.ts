import type { EntitlementKey } from '@legacy-sports/utils';
import { builder } from './builder';
import { hasEntitlement, requireAuth } from './authorization';

/**
 * Query: hasEntitlement(key: String!): Boolean!
 *
 * Returns true when the authenticated user holds the given entitlement key.
 * Admin users always return true (consistent with the authorization layer).
 * Delegates to {@link hasEntitlement}, which enforces the token's Stripe-minted
 * entitlement claim (no runtime Stripe API call on this fast path) and may throw
 * ENTITLEMENTS_STALE to force a client token refresh (LS-8643).
 */
builder.queryField('hasEntitlement', (t) =>
  t.boolean({
    nullable: false,
    description:
      'Returns true when the authenticated user holds the given entitlement. Admin users always return true.',
    args: {
      key: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { key }, context) => {
      requireAuth(context);
      return hasEntitlement(context, key as EntitlementKey);
    },
  }),
);

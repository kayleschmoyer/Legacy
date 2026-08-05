import { builder } from './builder';
import { getEntitlements, requireAuth } from './authorization';

/**
 * Query: myEntitlements: [String!]!
 *
 * Returns the set of entitlement lookup_keys the authenticated user's plan
 * grants, read from the token's Stripe-minted entitlement claim (LS-8644) — the
 * current-user entitlement-check resolver (LS-8042, rewired in LS-8645). Admins
 * receive the full catalog (all-entitled for reads). Delegates to
 * {@link getEntitlements}, which enforces the token claim on the fast path (no
 * runtime Stripe API call) and may throw ENTITLEMENTS_STALE to force a client
 * token refresh + retry when the claim is stale (LS-8643).
 *
 * The client consumes this to power per-entitlement feature gates
 * (`useHasEntitlement`) instead of collapsing every gate to the coarse premium
 * tier.
 */
builder.queryField('myEntitlements', (t) =>
  t.stringList({
    nullable: false,
    description:
      "Returns the lookup_keys of the entitlements the authenticated user's plan grants (derived from the token claim). Admin users receive the full catalog.",
    resolve: async (_parent, _args, context) => {
      requireAuth(context);
      return getEntitlements(context);
    },
  }),
);

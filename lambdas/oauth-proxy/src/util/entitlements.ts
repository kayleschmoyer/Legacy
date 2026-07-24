import { type EntitlementKey, ENTITLEMENTS } from '@legacy-sports/utils';
import { getStripeClient } from './stripe';

// Set of known entitlement lookup_keys, used to filter Stripe's live
// activeEntitlements down to the catalog the app actually gates on. Stripe may
// return Features that were provisioned but are not (yet) part of the code
// catalog; those are ignored.
const ENTITLEMENT_KEY_SET: ReadonlySet<string> = new Set<string>(
  Object.values(ENTITLEMENTS),
);

/**
 * Narrow an arbitrary Stripe lookup_key string to a known EntitlementKey.
 */
export function isEntitlementKey(
  key: string | null | undefined,
): key is EntitlementKey {
  return key != null && ENTITLEMENT_KEY_SET.has(key);
}

/**
 * List a Stripe customer's active entitlements and filter them to the code
 * ENTITLEMENTS catalog.
 *
 * This is the reachability wrapper consumed by the JWT-mint slice (LS-8644):
 * it performs a single, paginated Stripe API read and returns the set of
 * entitlement lookup_keys the customer currently holds.
 *
 * - Returns `[]` for a null/absent customer (free users with no Stripe
 *   customer) without touching the Stripe API.
 * - Auto-paginates via the Stripe SDK's async iterator so customers with more
 *   than one page of entitlements are fully covered.
 * - Filters to `isEntitlementKey`, so any Stripe Feature not in the code
 *   catalog is dropped.
 */
export async function fetchActiveEntitlements(
  customerId: string | null,
): Promise<EntitlementKey[]> {
  if (!customerId) return [];

  const stripe = await getStripeClient();
  const keys: EntitlementKey[] = [];

  for await (const entitlement of stripe.entitlements.activeEntitlements.list({
    customer: customerId,
    limit: 100,
  })) {
    if (isEntitlementKey(entitlement.lookup_key)) {
      keys.push(entitlement.lookup_key);
    }
  }

  return keys;
}

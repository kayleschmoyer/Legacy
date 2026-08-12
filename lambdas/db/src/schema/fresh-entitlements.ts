/**
 * Fresh-from-Stripe entitlement validation for sensitive / irreversible
 * operations (epic LS-8638 SHARED CONTRACTS #2).
 *
 * The default fast path ({@link hasEntitlement} / {@link requireEntitlement} in
 * ./authorization) trusts the token's Stripe-minted entitlement claim — no
 * per-request Stripe call. For any irreversible or financial/commissioner
 * operation tied to a *paid capability* — creating or renewing a paid-tier
 * league, enabling salary cap, converting waiver type — the claim is NOT
 * sufficient: enforcement must read the customer's *live* Stripe entitlements so
 * a change that has not yet propagated into a refreshed token cannot be
 * exploited within the refresh window.
 *
 * Admin callers remain all-entitled for reads here too (unless impersonating the
 * free tier); admin *authority* for admin-only actions is re-checked fresh
 * separately via `requireAdmin` in ./authorization.
 *
 * This mirrors the oauth-proxy mint-time helper (lambdas cannot share code), so
 * the fresh check and the token claim are derived from the same Stripe source
 * (`stripe.entitlements.activeEntitlements.list`).
 */
import { desc, eq } from 'drizzle-orm';
import { InternalSchema } from '@legacy-sports/db-client';
import { type EntitlementKey, ENTITLEMENTS } from '@legacy-sports/utils';
import type { Context } from './builder';
import { requireAuth } from './authorization';
import { PremiumRequiredError } from './graphql-errors';
import { ENTITLEMENT_LABELS } from './entitlements';
import { getStripeClient } from '../server/stripe';

/**
 * Known entitlement lookup_keys, used to filter Stripe's live entitlements down
 * to the catalog the app gates on. Stripe may return Features provisioned but
 * not (yet) in the code catalog; those are ignored.
 */
const ENTITLEMENT_KEY_SET: ReadonlySet<string> = new Set<string>(
  Object.values(ENTITLEMENTS),
);

/**
 * Resolve the caller's Stripe customer id from the subscriptions table, or
 * `null` when the user has no Stripe customer (free users never billed).
 *
 * Ordered by created_at DESC (id DESC tiebreaker) so a user with more than one
 * subscription row (e.g. a stale canceled/Apple row alongside a new Stripe
 * row) resolves to the most recent one, not an arbitrary one — same class of
 * bug as LS-5201.
 */
async function getStripeCustomerId(
  context: Context,
  userId: number,
): Promise<string | null> {
  const [row] = await context.db
    .select({
      stripeCustomerId: InternalSchema.subscriptions.stripeCustomerId,
    })
    .from(InternalSchema.subscriptions)
    .where(eq(InternalSchema.subscriptions.userId, userId))
    .orderBy(
      desc(InternalSchema.subscriptions.createdAt),
      desc(InternalSchema.subscriptions.id),
    )
    .limit(1);
  return row?.stripeCustomerId ?? null;
}

/**
 * Read a Stripe customer's live active entitlements, filtered to the code
 * catalog. Returns `[]` for a null customer without touching Stripe, and
 * auto-paginates via the SDK's async iterator.
 */
async function fetchActiveEntitlements(
  customerId: string | null,
): Promise<EntitlementKey[]> {
  if (!customerId) return [];

  const stripe = await getStripeClient();
  const keys: EntitlementKey[] = [];

  for await (const entitlement of stripe.entitlements.activeEntitlements.list({
    customer: customerId,
    limit: 100,
  })) {
    const key = entitlement.lookup_key;
    if (typeof key === 'string' && ENTITLEMENT_KEY_SET.has(key)) {
      keys.push(key as EntitlementKey);
    }
  }

  return keys;
}

/**
 * Non-throwing fresh-from-Stripe entitlement check. Admins are all-entitled
 * (unless impersonating the free tier). For non-admins it ignores the token
 * claim entirely and reads the customer's *live* Stripe entitlements.
 *
 * @throws AuthenticationError when `context.user` is null/undefined.
 */
export async function hasFreshEntitlement(
  context: Context,
  key: EntitlementKey,
): Promise<boolean> {
  const user = requireAuth(context);
  if (user.isAdmin && context.impersonatedTier !== 'free') return true;
  const customerId = await getStripeCustomerId(context, user.id);
  const active = await fetchActiveEntitlements(customerId);
  return active.includes(key);
}

/**
 * Throws {@link PremiumRequiredError} when the caller's *live* Stripe
 * entitlements do not include `key`. Use for sensitive/irreversible operations
 * tied to a paid capability (see module docs); prefer {@link requireEntitlement}
 * on the read/display fast path.
 *
 * Unlike the fast path this never emits `ENTITLEMENTS_STALE`: live Stripe is the
 * ground truth, so there is no token to force-expire — the verdict is definitive.
 *
 * @throws AuthenticationError when `context.user` is null/undefined.
 */
export async function requireFreshEntitlement(
  context: Context,
  key: EntitlementKey,
  customMessage?: string,
): Promise<void> {
  if (await hasFreshEntitlement(context, key)) return;
  const label = ENTITLEMENT_LABELS[key];
  throw PremiumRequiredError(
    customMessage ??
      `${label} requires an upgraded subscription. Upgrade to unlock this feature.`,
  );
}

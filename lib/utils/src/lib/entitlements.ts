/**
 * Entitlement lookup keys for feature gating.
 *
 * Each `ENTITLEMENT` value is the `lookup_key` of a Stripe Feature
 * (provisioned by the `seed-stripe` CLI command,
 * `apps/cli/src/commands/seedStripe.ts`). Product tiers attach a subset
 * of these features; future tiers (e.g. a mid-level plan) require no code
 * changes — only a new entry in `TIER_ENTITLEMENTS` and a new Stripe price.
 *
 * Gating code should call `requireEntitlement(ctx, ENTITLEMENTS.salary_cap_leagues)`
 * rather than `requirePremium(ctx)` so the check is framed around the capability
 * being granted, not the tier that currently grants it.
 *
 * This lives in `@legacy-sports/utils` (a platform-shared library) so both the
 * `lambdas/db` feature-gating code and the `seed-stripe` CLI command can import
 * a single source of truth — Stripe provisioning and in-app gating cannot drift.
 *
 * Follow-up (tracked separately): sync the authoritative entitlement set from
 * Stripe's Entitlements API (`entitlements.activeEntitlements.list`) on each
 * subscription webhook event so downgrade/upgrade side effects don't depend
 * on the tier column.
 */
export const ENTITLEMENTS = {
  salary_cap_leagues: 'salary_cap_leagues',
  advanced_playoff_formats: 'advanced_playoff_formats',
  unlimited_mock_drafts: 'unlimited_mock_drafts',
  unlimited_leagues: 'unlimited_leagues',
  faab_waiver_type: 'faab_waiver_type',
  historical_era_filters: 'historical_era_filters',
  auction_draft: 'auction_draft',
} as const;

export type EntitlementKey = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

export type SubscriptionTier = 'free' | 'premium';

/**
 * Static mapping of tier → granted entitlements. The single source of truth
 * for which features a tier unlocks in-app. To introduce a new tier:
 *   1. Add a Stripe Price with a matching `lookup_key` in `seedStripe.ts`.
 *   2. Attach the desired Features to the Product.
 *   3. Add the tier here with its entitlement subset.
 *   4. Extend the `SubscriptionTier` union.
 *
 * The tier→entitlement fan-out exists in code (not DB) so that adding a tier
 * is a pure schema-less code change; Stripe remains the pricing/billing
 * source of truth, and this map expresses the product policy.
 */
export const TIER_ENTITLEMENTS: Record<SubscriptionTier, EntitlementKey[]> = {
  free: [],
  premium: [
    ENTITLEMENTS.salary_cap_leagues,
    ENTITLEMENTS.advanced_playoff_formats,
    ENTITLEMENTS.unlimited_mock_drafts,
    ENTITLEMENTS.unlimited_leagues,
    ENTITLEMENTS.faab_waiver_type,
    ENTITLEMENTS.historical_era_filters,
    ENTITLEMENTS.auction_draft,
  ],
};

/** Human-readable labels for error messages when an entitlement is missing. */
export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  salary_cap_leagues: 'Salary cap leagues',
  advanced_playoff_formats: 'Advanced playoff formats (6-team, 8-team)',
  unlimited_mock_drafts: 'Unlimited mock drafts',
  unlimited_leagues: 'Unlimited active leagues',
  faab_waiver_type: 'FAAB waivers',
  historical_era_filters: 'Historical era filters',
  auction_draft: 'Auction draft mode',
};

export function tierHasEntitlement(
  tier: SubscriptionTier,
  key: EntitlementKey,
): boolean {
  return TIER_ENTITLEMENTS[tier].includes(key);
}

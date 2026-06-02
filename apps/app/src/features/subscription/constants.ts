export type BillingCycle = 'monthly' | 'annual';

/**
 * Maximum number of active (non-mock) leagues a free-tier user may participate
 * in (owned or joined). Mirrors the server-enforced cap defined in
 * `lib/db-client/.../SubscriptionDowngradeService.ts` and
 * `lambdas/db/.../subscriptions.ts`. Kept as a local copy so the mobile app
 * does not pull in the server `db-client` package (LS-5182).
 */
export const FREE_TIER_LEAGUE_LIMIT = 3;

export interface PremiumFeature {
  label: string;
  free: boolean;
  premium: boolean;
}

export const PREMIUM_FEATURES: PremiumFeature[] = [
  { label: 'Join up to 3 leagues', free: true, premium: true },
  { label: 'Unlimited active leagues', free: false, premium: true },
  { label: 'Salary cap leagues', free: false, premium: true },
  {
    label: 'Advanced playoff formats (6-team, 8-team)',
    free: false,
    premium: true,
  },
  { label: 'Unlimited mock drafts', free: false, premium: true },
  { label: 'FAAB waivers', free: false, premium: true },
  { label: 'Historical era filters', free: false, premium: true },
];

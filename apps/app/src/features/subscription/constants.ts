export type BillingCycle = 'monthly' | 'annual';

/**
 * Maximum number of active (non-mock) leagues a free-tier user may participate
 * in (owned or joined). Mirrors the server-enforced cap defined in
 * `lib/db-client/.../SubscriptionDowngradeService.ts` and
 * `lambdas/db/.../subscriptions.ts`. Kept as a local copy so the mobile app
 * does not pull in the server `db-client` package (LS-5182).
 */
export const FREE_TIER_LEAGUE_LIMIT = 3;

/**
 * Post-checkout activation window. After the Stripe redirect the subscription
 * tier only flips to premium once the asynchronous Stripe webhook reaches our
 * lambda and updates the DB; cold delivery takes 5-15s. Polling across that
 * window keeps the returning buyer on an "Activating…" state instead of
 * showing them a misleading "Free" plan. Mirrors the web values in
 * `apps/web/src/pages/profile/SubscriptionPage.tsx` (LS-5204).
 */
export const ACTIVATION_POLL_INTERVAL_MS = 2000;
/** 8 polls × 2s = 16s, comfortably past the cold webhook delivery ceiling. */
export const ACTIVATION_MAX_POLLS = 8;

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

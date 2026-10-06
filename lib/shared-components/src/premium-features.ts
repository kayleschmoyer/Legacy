/**
 * Canonical Free-vs-Premium feature list (LS-7393).
 *
 * The single source of truth for every surface that advertises what Premium
 * includes: web Subscription page, mobile subscription screen, web Pricing page
 * and the Upgrade modal. Add or reword a feature here only — never re-declare
 * the list in an app. This is display copy; entitlement enforcement lives in
 * `lib/utils/src/lib/entitlements.ts`.
 */
export type PremiumFeatureValue = boolean | string;

export interface PremiumFeature {
  label: string;
  /** `true`/`false` = included/not included; a string is shown as-is (e.g. a limit). */
  free: PremiumFeatureValue;
  premium: PremiumFeatureValue;
  /**
   * Wording for lists that describe what Premium adds/removes (cancel dialog,
   * upgrade modal) when the comparison label doesn't read as a benefit.
   */
  lossLabel?: string;
}

export const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    label: 'Active leagues',
    free: 'Up to 3',
    premium: 'Unlimited',
    lossLabel: 'Unlimited active leagues',
  },
  { label: 'Salary cap leagues', free: false, premium: true },
  {
    label: 'Advanced playoff formats (6-team, 8-team)',
    free: false,
    premium: true,
  },
  { label: 'Unlimited mock drafts', free: false, premium: true },
  { label: 'FAAB waivers', free: false, premium: true },
  { label: 'Historical era filters', free: false, premium: true },
  { label: 'Player comparison', free: false, premium: true },
  // One row for stats + projections so every surface matches /pricing's
  // "Stats: Basic vs Advanced + Projections" (LS-10462).
  {
    label: 'Stats',
    free: 'Basic',
    premium: 'Advanced + Projections',
    lossLabel: 'Advanced stats + projections',
  },
  { label: 'AI-powered recaps', free: false, premium: true },
  { label: 'Draft recommendations', free: false, premium: true },
];

/** Label for a feature in "what Premium adds" lists (`lossLabel` when present). */
export function premiumFeatureBenefitLabel(feature: PremiumFeature): string {
  return feature.lossLabel ?? feature.label;
}

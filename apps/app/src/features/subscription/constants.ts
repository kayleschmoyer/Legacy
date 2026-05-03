export type BillingCycle = 'monthly' | 'annual';

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

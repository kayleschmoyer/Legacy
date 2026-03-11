export const MONTHLY_PRICE_DISPLAY = '$4.99';
export const ANNUAL_PRICE_DISPLAY = '$39.99';
export const ANNUAL_MONTHLY_EQUIVALENT = '$3.33';
export const ANNUAL_SAVINGS_PCT = '33%';

export type BillingCycle = 'monthly' | 'annual';

export interface PremiumFeature {
  label: string;
  free: boolean;
  premium: boolean;
}

export const PREMIUM_FEATURES: PremiumFeature[] = [
  { label: 'Join up to 3 leagues', free: true, premium: true },
  { label: 'Join unlimited leagues', free: false, premium: true },
  { label: 'Basic player stats', free: true, premium: true },
  { label: 'Advanced analytics & projections', free: false, premium: true },
  { label: 'Season Draft Games', free: false, premium: true },
  { label: 'Trade analyzer', free: false, premium: true },
  { label: 'Commissioner tools', free: true, premium: true },
  { label: 'Priority support', free: false, premium: true },
];

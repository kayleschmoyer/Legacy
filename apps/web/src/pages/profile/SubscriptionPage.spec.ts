import { getTierLabel } from './SubscriptionPage';

// LS-5189: the subscriptions table stores only `free` or `premium` for `tier`.
// The previous implementation switched on `monthly`/`annual` (Stripe billing
// intervals that never reach this field), so every real value fell through to
// `default: return 'Premium'` — including the canceled state (tier `free`),
// which misleadingly rendered "Premium".
describe('getTierLabel', () => {
  it('labels a premium tier as "Premium"', () => {
    expect(getTierLabel('premium')).toBe('Premium');
  });

  it('labels a free tier as "Free" (previously mislabeled "Premium")', () => {
    expect(getTierLabel('free')).toBe('Free');
  });

  it('falls back to "Free" for an empty/unknown tier', () => {
    expect(getTierLabel('')).toBe('Free');
    expect(getTierLabel('something-else')).toBe('Free');
  });
});

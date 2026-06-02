import {
  ACTIVATION_MAX_POLLS,
  ACTIVATION_POLL_INTERVAL_MS,
  getTierLabel,
  shouldContinueActivationPolling,
} from './SubscriptionPage';

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

// LS-5204: after the Stripe checkout redirect the page used to refetch only at
// 0s and 3s. Cold Lambda webhook delivery takes 5-15s, so the buyer frequently
// saw "Free Plan" after paying. The activation poll now retries at 2s intervals
// until the premium tier appears or the retry budget is spent.
describe('shouldContinueActivationPolling', () => {
  it('keeps polling while the tier is not yet premium and retries remain', () => {
    expect(shouldContinueActivationPolling(false, 0)).toBe(true);
    expect(
      shouldContinueActivationPolling(false, ACTIVATION_MAX_POLLS - 1),
    ).toBe(true);
  });

  it('stops as soon as the subscription reports premium', () => {
    expect(shouldContinueActivationPolling(true, 0)).toBe(false);
    expect(shouldContinueActivationPolling(true, 2)).toBe(false);
  });

  it('stops once the retry budget is exhausted', () => {
    expect(shouldContinueActivationPolling(false, ACTIVATION_MAX_POLLS)).toBe(
      false,
    );
    expect(
      shouldContinueActivationPolling(false, ACTIVATION_MAX_POLLS + 1),
    ).toBe(false);
  });

  it('honours a custom retry budget', () => {
    expect(shouldContinueActivationPolling(false, 2, 3)).toBe(true);
    expect(shouldContinueActivationPolling(false, 3, 3)).toBe(false);
  });

  it('covers the documented 5-15s cold webhook delivery window', () => {
    // The old behaviour only refetched at 0s and 3s. The poll budget must now
    // reach past the 15s ceiling described in the bug report.
    expect(
      ACTIVATION_MAX_POLLS * ACTIVATION_POLL_INTERVAL_MS,
    ).toBeGreaterThanOrEqual(15000);
    expect(ACTIVATION_POLL_INTERVAL_MS).toBe(2000);
  });
});

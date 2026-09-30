import type { SubscriptionData } from './useSubscription';
import { getSubscriptionWarning } from './subscriptionWarning';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function sub(overrides: Partial<SubscriptionData> = {}): SubscriptionData {
  return {
    status: 'active',
    tier: 'premium',
    currentPeriodEnd: '2026-07-10T12:00:00.000Z',
    cancelAtPeriodEnd: false,
    gracePeriodEndsAt: null,
    trialEndsAt: null,
    ...overrides,
  };
}

describe('getSubscriptionWarning', () => {
  it('returns null without a subscription or for non-premium accounts', () => {
    expect(getSubscriptionWarning(null, true, NOW)).toBeNull();
    expect(getSubscriptionWarning(undefined, true, NOW)).toBeNull();
    expect(
      getSubscriptionWarning(sub({ status: 'past_due' }), false, NOW),
    ).toBeNull();
  });

  it('returns null for an account in good standing', () => {
    expect(getSubscriptionWarning(sub(), true, NOW)).toBeNull();
  });

  it('flags past_due with the grace deadline', () => {
    expect(
      getSubscriptionWarning(
        sub({
          status: 'past_due',
          gracePeriodEndsAt: '2026-06-17T12:00:00.000Z',
        }),
        true,
        NOW,
      ),
    ).toEqual({
      kind: 'payment_failed',
      message: 'Payment failed — update billing by Jun 17',
    });
  });

  it('falls back to currentPeriodEnd, then to no date, for past_due', () => {
    expect(
      getSubscriptionWarning(sub({ status: 'past_due' }), true, NOW)?.message,
    ).toBe('Payment failed — update billing by Jul 10');
    expect(
      getSubscriptionWarning(
        sub({ status: 'past_due', currentPeriodEnd: null }),
        true,
        NOW,
      )?.message,
    ).toBe('Payment failed — update billing');
  });

  it('treats a grace period as a payment failure even if status lags', () => {
    expect(
      getSubscriptionWarning(
        sub({ gracePeriodEndsAt: '2026-06-17T12:00:00.000Z' }),
        true,
        NOW,
      )?.kind,
    ).toBe('payment_failed');
  });

  it('prefers the payment-failure warning over a pending cancellation', () => {
    expect(
      getSubscriptionWarning(
        sub({
          status: 'past_due',
          cancelAtPeriodEnd: true,
          gracePeriodEndsAt: '2026-06-17T12:00:00.000Z',
        }),
        true,
        NOW,
      )?.kind,
    ).toBe('payment_failed');
  });

  it('counts down days for cancel_at_period_end', () => {
    const cancelling = (end: string): string | undefined =>
      getSubscriptionWarning(
        sub({ cancelAtPeriodEnd: true, currentPeriodEnd: end }),
        true,
        NOW,
      )?.message;
    expect(cancelling('2026-06-15T12:00:00.000Z')).toBe('Cancels in 5 days');
    expect(cancelling('2026-06-11T06:00:00.000Z')).toBe('Cancels in 1 day');
    expect(cancelling('2026-06-10T18:00:00.000Z')).toBe('Cancels in 1 day');
    expect(cancelling('2026-06-10T11:00:00.000Z')).toBe('Cancels today');
  });

  it('handles cancel_at_period_end with a missing or invalid period end', () => {
    expect(
      getSubscriptionWarning(
        sub({ cancelAtPeriodEnd: true, currentPeriodEnd: null }),
        true,
        NOW,
      )?.message,
    ).toBe('Cancels at end of billing period');
    expect(
      getSubscriptionWarning(
        sub({ cancelAtPeriodEnd: true, currentPeriodEnd: 'nope' }),
        true,
        NOW,
      )?.message,
    ).toBe('Cancels at end of billing period');
  });
});

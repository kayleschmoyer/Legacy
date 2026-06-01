import { isActiveGoogleSubscription } from './google-play';
import type { SubscriptionPurchaseV2 } from './google-play';

function sub(
  subscriptionState: SubscriptionPurchaseV2['subscriptionState'],
): SubscriptionPurchaseV2 {
  return { subscriptionState };
}

describe('isActiveGoogleSubscription', () => {
  it('returns true for SUBSCRIPTION_STATE_ACTIVE', () => {
    expect(isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_ACTIVE'))).toBe(
      true,
    );
  });

  it('returns true for SUBSCRIPTION_STATE_IN_GRACE_PERIOD', () => {
    expect(
      isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_IN_GRACE_PERIOD')),
    ).toBe(true);
  });

  it('returns false for SUBSCRIPTION_STATE_CANCELED', () => {
    expect(isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_CANCELED'))).toBe(
      false,
    );
  });

  it('returns false for SUBSCRIPTION_STATE_EXPIRED', () => {
    expect(isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_EXPIRED'))).toBe(
      false,
    );
  });

  it('returns false for SUBSCRIPTION_STATE_PAUSED', () => {
    expect(isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_PAUSED'))).toBe(
      false,
    );
  });

  it('returns false for SUBSCRIPTION_STATE_ON_HOLD', () => {
    expect(isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_ON_HOLD'))).toBe(
      false,
    );
  });

  it('returns false for SUBSCRIPTION_STATE_PENDING', () => {
    expect(isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_PENDING'))).toBe(
      false,
    );
  });

  it('returns false for SUBSCRIPTION_STATE_UNSPECIFIED', () => {
    expect(
      isActiveGoogleSubscription(sub('SUBSCRIPTION_STATE_UNSPECIFIED')),
    ).toBe(false);
  });
});

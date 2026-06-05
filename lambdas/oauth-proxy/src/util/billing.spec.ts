import { deriveBillingStatus } from './billing';

describe('deriveBillingStatus', () => {
  it("returns 'past_due' when the subscription status is past_due", () => {
    expect(deriveBillingStatus('past_due')).toBe('past_due');
  });

  it.each(['active', 'trialing', 'canceled', 'inactive', 'unknown', ''])(
    "returns 'ok' for non-actionable status %p",
    (status) => {
      expect(deriveBillingStatus(status)).toBe('ok');
    },
  );

  it("returns 'ok' when the user has no subscription row (null)", () => {
    expect(deriveBillingStatus(null)).toBe('ok');
  });

  it("returns 'ok' when the status is undefined", () => {
    expect(deriveBillingStatus(undefined)).toBe('ok');
  });
});

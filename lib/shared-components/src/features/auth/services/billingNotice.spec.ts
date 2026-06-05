import {
  clearBillingNotice,
  consumeBillingNotice,
  storeBillingNotice,
} from './billingNotice';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn() },
}));

const KEY = 'ls_billing_notice';

describe('billingNotice', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('storeBillingNotice', () => {
    it("persists the notice when billingStatus is 'past_due'", () => {
      storeBillingNotice('past_due');
      expect(sessionStorage.getItem(KEY)).toBe('past_due');
    });

    it.each(['ok', 'active', undefined])(
      'clears any stale notice for non-actionable status %p',
      (status) => {
        sessionStorage.setItem(KEY, 'past_due');
        storeBillingNotice(status);
        expect(sessionStorage.getItem(KEY)).toBeNull();
      },
    );
  });

  describe('consumeBillingNotice', () => {
    it("returns 'past_due' and removes the notice (one-shot)", () => {
      storeBillingNotice('past_due');
      expect(consumeBillingNotice()).toBe('past_due');
      // Second read is empty — the notice was consumed.
      expect(consumeBillingNotice()).toBeNull();
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('returns null when there is no notice', () => {
      expect(consumeBillingNotice()).toBeNull();
    });
  });

  describe('clearBillingNotice', () => {
    it('removes a pending notice', () => {
      storeBillingNotice('past_due');
      clearBillingNotice();
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });
  });
});

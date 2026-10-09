import {
  clearPendingBillingAction,
  hasPendingBillingAction,
  markPendingBillingAction,
} from './pendingBillingAction';

describe('pendingBillingAction', () => {
  beforeEach(() => window.localStorage.clear());

  it('is false when nothing was marked', () => {
    expect(hasPendingBillingAction()).toBe(false);
  });

  it('is true after marking and false after clearing', () => {
    markPendingBillingAction(1_000);
    expect(hasPendingBillingAction(1_000 + 60_000)).toBe(true);
    clearPendingBillingAction();
    expect(hasPendingBillingAction(1_000 + 60_000)).toBe(false);
  });

  it('expires stale markers', () => {
    markPendingBillingAction(1_000);
    expect(hasPendingBillingAction(1_000 + 31 * 60 * 1000)).toBe(false);
  });

  it('ignores garbage values', () => {
    window.localStorage.setItem('ls:pendingBillingAction', 'nope');
    expect(hasPendingBillingAction()).toBe(false);
  });
});

import {
  ACTIVATION_MAX_POLLS,
  ACTIVATION_POLL_INTERVAL_MS,
  deriveIsPremium,
  getStatusAccent,
  getTierLabel,
  shouldContinueActivationPolling,
} from './SubscriptionPage';
import { AMBER, BLUE, EMERALD, RED } from '../../constants/colors';

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

// LS-5177: premium access on the subscription page must be derived from `tier`,
// not `status`, to match the `useIsPremium` hook (`subscriptionTier === 'premium'`)
// and the backend `getSubscriptionTier`. The previous status-based derivation
// (`status === 'active' || status === 'trialing'`) returned false during the
// grace period (`status='past_due'`, `tier='premium'`), treating paying users
// as free. `deriveIsPremium` is purely tier-based and ignores `status`.
describe('deriveIsPremium', () => {
  it('AC1/AC2: returns true when tier is premium, independent of status (covers the grace period)', () => {
    // Status is intentionally ignored. During the grace period Stripe marks
    // status `past_due` while tier stays `premium`, so a tier-only check keeps
    // the user premium — that is the bug this guards against.
    expect(deriveIsPremium({ tier: 'premium' })).toBe(true);
  });

  it('returns false for free-tier subscriptions regardless of status', () => {
    expect(deriveIsPremium({ tier: 'free' })).toBe(false);
  });

  // LS-7389: corrupt row (e.g. a partial write left `status` active after the
  // tier was downgraded). `tier` alone decides, so a stale `status` can never
  // inflate access. Do NOT "fix" this by also requiring an active/trialing
  // status — that reintroduces the LS-5177 grace-period bug (past_due + premium).
  it('LS-7389: returns false for a corrupt row with status active but tier free', () => {
    const corruptRow = { status: 'active', tier: 'free' };
    expect(deriveIsPremium(corruptRow)).toBe(false);
  });

  it('returns false when there is no subscription', () => {
    expect(deriveIsPremium(null)).toBe(false);
    expect(deriveIsPremium(undefined)).toBe(false);
    expect(deriveIsPremium({ tier: null })).toBe(false);
  });
});

// LS-7391: a trialing subscription satisfies the tier-derived isPremium check,
// so the badge used to fall through to the same green as paid Premium. Each
// status now maps to a distinct accent.
describe('getStatusAccent', () => {
  it('gives trialing its own blue, distinct from active/past_due/canceled', () => {
    expect(getStatusAccent('trialing')).toBe(BLUE);
    expect(getStatusAccent('trialing')).not.toBe(getStatusAccent('active'));
    expect(getStatusAccent('trialing')).not.toBe(getStatusAccent('past_due'));
    expect(getStatusAccent('trialing')).not.toBe(getStatusAccent('canceled'));
  });

  it('keeps the existing amber / red / emerald states unchanged', () => {
    expect(getStatusAccent('past_due')).toBe(AMBER);
    expect(getStatusAccent('canceled')).toBe(RED);
    expect(getStatusAccent('active')).toBe(EMERALD);
  });

  it('falls back to emerald for a missing status', () => {
    expect(getStatusAccent(null)).toBe(EMERALD);
    expect(getStatusAccent(undefined)).toBe(EMERALD);
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

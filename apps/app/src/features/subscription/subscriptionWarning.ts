import type { SubscriptionData } from './useSubscription';

export interface SubscriptionWarning {
  kind: 'payment_failed' | 'cancelling';
  message: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatShortDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(iso: string, now: Date): number | null {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Describes the "grace" states a still-premium account can be in — payment
 * failed (past_due / grace period) or cancel_at_period_end — so surfaces that
 * only read `isPremium` can warn before access lapses (LS-7228). Returns null
 * for accounts that are not premium or are in good standing.
 *
 * Payment failure wins over a pending cancellation: it is the state the user
 * can still fix before access ends.
 */
export function getSubscriptionWarning(
  subscription: SubscriptionData | null | undefined,
  isPremium: boolean,
  now: Date = new Date(),
): SubscriptionWarning | null {
  if (!subscription || !isPremium) return null;

  const pastDue =
    subscription.status === 'past_due' || !!subscription.gracePeriodEndsAt;
  if (pastDue) {
    const deadline =
      subscription.gracePeriodEndsAt ?? subscription.currentPeriodEnd;
    const date = deadline ? formatShortDate(deadline) : null;
    return {
      kind: 'payment_failed',
      message: date
        ? `Payment failed — update billing by ${date}`
        : 'Payment failed — update billing',
    };
  }

  if (subscription.cancelAtPeriodEnd) {
    const end = subscription.currentPeriodEnd;
    const days = end ? daysUntil(end, now) : null;
    if (days === null) {
      return {
        kind: 'cancelling',
        message: 'Cancels at end of billing period',
      };
    }
    if (days <= 0) return { kind: 'cancelling', message: 'Cancels today' };
    return {
      kind: 'cancelling',
      message: `Cancels in ${days} ${days === 1 ? 'day' : 'days'}`,
    };
  }

  return null;
}

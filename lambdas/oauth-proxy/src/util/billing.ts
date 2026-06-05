/**
 * Billing-standing signal surfaced to clients on successful login so they can
 * route premium users whose payment needs attention to the billing page
 * (LGN-029). This never gates login — it is an advisory hint only.
 *
 * - 'past_due' — the user's subscription is in the past-due / grace-period
 *   state and needs a billing action.
 * - 'ok'       — no action needed (no subscription, free, active, trialing,
 *   or any other non-actionable state).
 */
export type BillingStatus = 'past_due' | 'ok';

/** Subscription status value that warrants a billing routing hint. */
const PAST_DUE_STATUS = 'past_due';

/**
 * Derive the advisory billing standing from a subscription's status.
 *
 * Accepts the raw status string (or null/undefined when the user has no
 * subscription row) and returns 'past_due' only for the past-due state;
 * every other value maps to 'ok'.
 */
export function deriveBillingStatus(
  subscriptionStatus: string | null | undefined,
): BillingStatus {
  return subscriptionStatus === PAST_DUE_STATUS ? 'past_due' : 'ok';
}

import { useGetMyBillingIntervalQuery } from '@legacy-sports/graphql';

export type BillingInterval = 'monthly' | 'annual';

/**
 * Returns the signed-in user's Stripe billing interval (LS-7171), or `null`
 * when it is unknown — non-Stripe subscription, lookup failure, or still
 * loading. Callers must treat null as "unknown", never as monthly.
 *
 * Pass `skip: true` for users who cannot have a Stripe subscription (free or
 * signed-out) so the server-side Stripe lookup is not triggered needlessly.
 */
export function useMyBillingInterval(options?: { skip?: boolean }): {
  billingInterval: BillingInterval | null;
  isLoading: boolean;
} {
  const { data, loading } = useGetMyBillingIntervalQuery({
    skip: options?.skip,
  });
  const raw = data?.mySubscription?.billingInterval;
  const billingInterval = raw === 'monthly' || raw === 'annual' ? raw : null;
  return { billingInterval, isLoading: loading };
}

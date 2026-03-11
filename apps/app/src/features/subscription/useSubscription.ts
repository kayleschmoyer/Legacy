import {
  useCreateBillingPortalSessionMutation,
  useCreateCheckoutSessionMutation,
  useGetMySubscriptionQuery,
} from '../../api/db/graphql.generated';

export interface SubscriptionData {
  status: string | null;
  tier: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  gracePeriodEndsAt: string | null;
}

export function useSubscription() {
  const { data, loading, error, refetch } = useGetMySubscriptionQuery();
  const subscription = data?.mySubscription ?? null;

  const isPremium =
    subscription?.status === 'active' || subscription?.status === 'trialing';
  const tier = subscription?.tier ?? 'free';

  return {
    subscription: subscription as SubscriptionData | null,
    isPremium,
    tier,
    loading,
    error,
    refetch,
  };
}

export function useCheckoutSession() {
  return useCreateCheckoutSessionMutation();
}

export function useBillingPortalSession() {
  return useCreateBillingPortalSessionMutation();
}

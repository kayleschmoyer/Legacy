import { useCallback, useEffect } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { useLeagueWebSocket } from './useLeagueWebSocket';
import { useLeagueWebSocketClient } from '../context/LeagueWebSocketContext';
import { useGetUserByIdQuery } from '../api/db/graphql.generated';

/**
 * Returns whether the current user has premium access.
 *
 * Returns `false` while auth or the user query is loading to prevent granting
 * access before status is confirmed. Checks `subscriptionTier === 'premium'`
 * from the database; admins are always treated as premium regardless of tier.
 */
export function useIsPremium(): boolean {
  const { isPremium } = useIsPremiumStatus();
  return isPremium;
}

/**
 * Same as `useIsPremium` but also exposes loading state.
 * Use this when you need to block actions until premium status is resolved
 * (e.g. preventing free users from selecting premium features during load).
 *
 * Stays fresh mid-session by listening for `SUBSCRIPTION_UPDATED` push
 * notifications (emitted by the stripe-webhook lambda after every Stripe
 * state change) and refetching the user record on receipt. End-to-end lag
 * is sub-second on pages wrapped in `LeagueWebSocketContext`. On pages
 * without that context (no live socket available), we fall back to refetching
 * on window focus so a Stripe state change is picked up the next time the
 * tab regains focus instead of being silently missed.
 */
export function useIsPremiumStatus(): {
  isPremium: boolean;
  isLoading: boolean;
} {
  const { user, isLoading: authLoading } = useAuth();
  const { client: wsClient } = useLeagueWebSocketClient();

  const {
    data,
    loading: userLoading,
    refetch,
  } = useGetUserByIdQuery({
    variables: { id: user?.id ?? 0 },
    skip: !user?.id,
  });

  const userId = user?.id;
  const refetchSafely = useCallback(
    (reason: string) => {
      if (!userId) return;
      refetch().catch((err: unknown) => {
        LOGGER.error(
          `useIsPremium: refetch after ${reason} failed`,
          err instanceof Error ? err : new Error(String(err)),
          { userId },
        );
      });
    },
    [userId, refetch],
  );

  useLeagueWebSocket({
    onSubscriptionUpdated: () => refetchSafely('SUBSCRIPTION_UPDATED'),
  });

  // Fallback for pages outside LeagueWebSocketContext: refetch when the tab
  // regains focus so we never silently miss a Stripe state change.
  useEffect(() => {
    if (wsClient || !userId) return;
    const onFocus = () => refetchSafely('window focus');
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [wsClient, userId, refetchSafely]);

  const isLoading = authLoading || userLoading;

  if (isLoading) return { isPremium: false, isLoading };
  if (user?.accessLevel === 'admin') return { isPremium: true, isLoading };
  return {
    isPremium: data?.user?.subscriptionTier === 'premium',
    isLoading,
  };
}

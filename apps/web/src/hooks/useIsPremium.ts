import { useAuth } from '@legacy-sports/shared-components';
import { useGetUserByIdQuery } from '../api/db/graphql.generated';

/**
 * Returns whether the current user has premium access.
 *
 * Returns `true` while auth or the user query is loading to prevent the gate
 * overlay from flashing. Checks `subscriptionTier === 'premium'` from the
 * database; admins are always treated as premium regardless of tier.
 */
export function useIsPremium(): boolean {
  const { isPremium } = useIsPremiumStatus();
  return isPremium;
}

/**
 * Same as `useIsPremium` but also exposes loading state.
 * Use this when you need to block actions until premium status is resolved
 * (e.g. preventing free users from selecting premium features during load).
 */
export function useIsPremiumStatus(): {
  isPremium: boolean;
  isLoading: boolean;
} {
  const { user, isLoading: authLoading } = useAuth();

  const { data, loading: userLoading } = useGetUserByIdQuery({
    variables: { id: user?.id ?? 0 },
    skip: !user?.id,
  });

  const isLoading = authLoading || userLoading;

  if (isLoading) return { isPremium: true, isLoading };
  if (user?.accessLevel === 'admin') return { isPremium: true, isLoading };
  return {
    isPremium: data?.user?.subscriptionTier === 'premium',
    isLoading,
  };
}

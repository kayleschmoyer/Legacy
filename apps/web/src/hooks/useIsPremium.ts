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
  const { user, isLoading: authLoading } = useAuth();

  const { data, loading: userLoading } = useGetUserByIdQuery({
    variables: { id: user?.id ?? 0 },
    skip: !user?.id,
  });

  if (authLoading || userLoading) return true;
  if (user?.accessLevel === 'admin') return true;
  return data?.user?.subscriptionTier === 'premium';
}

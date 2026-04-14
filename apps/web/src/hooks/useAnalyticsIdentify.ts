import { useEffect } from 'react';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { useGetUserByIdQuery } from '../api/db/graphql.generated';
import { setUserId, setUserProperties } from '../utils/analytics';

/**
 * Identifies the authenticated user in Google Analytics with their real
 * subscription tier from the database (not the JWT accessLevel proxy).
 *
 * Must be used inside a component that has both AuthProvider and ApolloProvider
 * in its ancestor tree (i.e. inside App, not in main.tsx).
 */
export function useAnalyticsIdentify(): void {
  const { user } = useAuth();

  const { data } = useGetUserByIdQuery({
    variables: { id: user?.id ?? 0 },
    skip: !user?.id,
  });

  const subscriptionTier = data?.user?.subscriptionTier;

  useEffect(() => {
    if (!user?.id || subscriptionTier == null) return;

    const tier = subscriptionTier === 'premium' ? 'premium' : 'free';

    setUserId(user.id);
    setUserProperties({ userId: user.id, subscriptionTier: tier });
  }, [user?.id, subscriptionTier]);
}

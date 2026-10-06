import { useLocalSearchParams, useRouter } from 'expo-router';
import { FootballPlayerDetail } from '@legacy-sports/shared-components/football';
import { useFootballPlayerQuery } from '@legacy-sports/graphql';
import { SafeScreen } from '../../../../../../components/SafeScreen';
import { toIntId } from '../../../../../../common/utilities/RouteUtils';
import { useSubscription } from '../../../../../../features/subscription/useSubscription';

export default function FootballPlayerDetailScreen(): React.JSX.Element {
  const params = useLocalSearchParams();
  const router = useRouter();
  const playerId = toIntId(params.playerId);
  const { isPremium } = useSubscription();

  const { data, loading, error } = useFootballPlayerQuery({
    skip: playerId === null,
    variables: { id: playerId ?? 0 },
  });

  return (
    <SafeScreen>
      <FootballPlayerDetail
        player={data?.footballPlayer}
        loading={loading}
        error={!!error}
        isPremium={isPremium}
        onUpgrade={() => router.navigate('subscription-settings')}
      />
    </SafeScreen>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../../../_screenErrorBoundary';

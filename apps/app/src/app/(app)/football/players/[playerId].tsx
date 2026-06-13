import { SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  FOOTBALL_PLAYER_DETAIL_POLL_MS,
  FootballPlayerDetail,
} from '@legacy-sports/shared-components/football';
import { useFootballPlayerQuery } from '../../../../api/db/graphql.generated';
import { toIntId } from '../../../../common/utilities/RouteUtils';
import { useSubscription } from '../../../../features/subscription/useSubscription';

export default function FootballPlayerDetailScreen(): React.JSX.Element {
  const params = useLocalSearchParams();
  const router = useRouter();
  const playerId = toIntId(params.playerId);
  const { isPremium } = useSubscription();

  const { data, loading, error } = useFootballPlayerQuery({
    skip: playerId === null,
    variables: { id: playerId ?? 0 },
    // Auto-refresh so injury-status changes surface without a manual reload
    // (LS-6252). Polling stops on unmount; a skipped query (no playerId) does
    // not poll.
    pollInterval: FOOTBALL_PLAYER_DETAIL_POLL_MS,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0F1A' }}>
      <FootballPlayerDetail
        player={data?.footballPlayer}
        loading={loading}
        error={!!error}
        onBack={() => router.back()}
        isPremium={isPremium}
        onUpgrade={() => router.navigate('subscription-settings')}
      />
    </SafeAreaView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

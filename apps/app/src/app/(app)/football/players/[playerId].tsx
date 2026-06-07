import { SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FootballPlayerDetail } from '@legacy-sports/shared-components/football';
import { useFootballPlayerQuery } from '../../../../api/db/graphql.generated';
import { toIntId } from '../../../../common/utilities/RouteUtils';

export default function FootballPlayerDetailScreen(): React.JSX.Element {
  const params = useLocalSearchParams();
  const router = useRouter();
  const playerId = toIntId(params.playerId);

  const { data, loading, error } = useFootballPlayerQuery({
    skip: playerId === null,
    variables: { id: playerId ?? 0 },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0F1A' }}>
      <FootballPlayerDetail
        player={data?.footballPlayer}
        loading={loading}
        error={!!error}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

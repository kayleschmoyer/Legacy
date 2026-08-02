import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { EliteDraftBoardScreen } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { toIntId } from '../../common/utilities/RouteUtils';

export default function DraftBoardPage() {
  const { leagueId: leagueIdParam } = useLocalSearchParams();
  const router = useRouter();
  const leagueId = toIntId(leagueIdParam);
  const websocketUrl = config.websocketUrl;

  useEffect(() => {
    if (!websocketUrl) {
      LOGGER.error(
        'EXPO_PUBLIC_WEBSOCKET_URL is not configured — falling back to polling for live draft updates',
      );
    }
  }, [websocketUrl]);

  return (
    // Mandatory navigation-landing anchor for the Maestro live-draft-board flow
    // (LS-8446): a stable container present across every draft state so tapping
    // the draft-status chip fails the flow loudly if the board never mounts.
    <YStack flex={1} testID="elite-draft-board-screen">
      {!websocketUrl && (
        <YStack backgroundColor="$yellow4" padding="$2">
          <Text color="$yellow11" textAlign="center" fontSize="$2">
            Real-time updates unavailable — polling for picks every 5s
          </Text>
        </YStack>
      )}
      <EliteDraftBoardScreen
        leagueId={leagueId}
        onNavigate={(path) => router.navigate(path)}
        websocketUrl={websocketUrl ?? ''}
      />
    </YStack>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

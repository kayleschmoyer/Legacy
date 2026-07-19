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
        'EXPO_PUBLIC_WEBSOCKET_URL is not configured — live draft will not receive real-time updates',
      );
    }
  }, [websocketUrl]);

  if (!websocketUrl) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
        <Text color="$red10" textAlign="center" fontSize="$4">
          WebSocket URL is not configured. Live draft updates are unavailable.
        </Text>
      </YStack>
    );
  }

  return (
    // Mandatory navigation-landing anchor for the Maestro live-draft-board flow
    // (LS-8446): a stable container present across every draft state so tapping
    // the draft-status chip fails the flow loudly if the board never mounts.
    <YStack flex={1} testID="elite-draft-board-screen">
      <EliteDraftBoardScreen
        leagueId={leagueId}
        onNavigate={(path) => router.navigate(path)}
        websocketUrl={websocketUrl}
      />
    </YStack>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

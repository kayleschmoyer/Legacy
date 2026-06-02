import React, { useEffect } from 'react';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { EliteDraftBoardScreen } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { toIntId } from '../../common/utilities/RouteUtils';

export default function DraftBoardPage() {
  const { leagueId: leagueIdParam } = useLocalSearchParams();
  const router = useRouter();
  const leagueId = toIntId(leagueIdParam);
  const websocketUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL;

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
    <EliteDraftBoardScreen
      leagueId={leagueId}
      onNavigate={(path) => router.navigate(path as Href)}
      websocketUrl={websocketUrl}
    />
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

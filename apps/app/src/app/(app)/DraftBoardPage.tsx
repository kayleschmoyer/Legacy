import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { EliteDraftBoardScreen } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';

export default function DraftBoardPage() {
  const { leagueId: leagueIdParam } = useLocalSearchParams<{
    leagueId?: string;
  }>();
  const router = useRouter();
  const parsedLeagueId = leagueIdParam ? parseInt(leagueIdParam, 10) : null;
  const leagueId = Number.isFinite(parsedLeagueId) ? parsedLeagueId : null;
  const websocketUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL;

  const [wsToken, setWsToken] = useState<string | undefined>();
  useEffect(() => {
    readKeychainValue(Secret.INTERNAL_JWT)
      .then((jwt) => {
        if (jwt) setWsToken(jwt);
      })
      .catch((err: unknown) => {
        LOGGER.warn('Failed to read auth token for WebSocket', String(err));
      });
  }, []);

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
      onNavigate={(path) => router.navigate(path as never)}
      websocketUrl={websocketUrl}
      websocketToken={wsToken}
    />
  );
}

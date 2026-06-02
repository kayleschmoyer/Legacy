import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { SeasonDraftGame } from '@legacy-sports/shared-components';
import { useAuthorizedUserInfo } from '../../../common/auth/AuthorizedUserContext';
import { toIntId } from '../../../common/utilities/RouteUtils';

/**
 * Mobile Season Draft Game Detail
 *
 * Displays an active season draft game. Wraps the shared SeasonDraftGame
 * component which handles turn-based drafting, scoring, and real-time updates.
 */
export default function SeasonDraftGameScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const router = useRouter();
  const userInfo = useAuthorizedUserInfo();

  const numericGameId = toIntId(gameId);

  if (numericGameId === null) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Text color="$gray11">Invalid game</Text>
      </YStack>
    );
  }

  return (
    <SeasonDraftGame
      gameId={numericGameId}
      currentUserId={userInfo.id}
      onBack={() => router.back()}
    />
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

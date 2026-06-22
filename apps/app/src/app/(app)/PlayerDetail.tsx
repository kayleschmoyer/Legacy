import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PlayerDetailById } from '@legacy-sports/shared-components';
import { Button, Text, YStack } from 'tamagui';
import { toIntId } from '../../common/utilities/RouteUtils';

export default function PlayerDetailScreen() {
  const { playerId } = useLocalSearchParams<{
    playerId: string;
    playerName: string;
  }>();
  const router = useRouter();

  const id = toIntId(playerId);

  if (id === null) {
    return (
      <YStack
        flex={1}
        justifyContent="center"
        alignItems="center"
        padding="$5"
        backgroundColor="$background"
        gap="$4"
      >
        <Text fontSize="$8" fontWeight="700" textAlign="center">
          Player Not Found
        </Text>
        <Text fontSize="$4" textAlign="center" color="$color10">
          This link contains an invalid or missing player ID.
        </Text>
        <Button
          testID="player-detail-invalid-back"
          onPress={() => router.back()}
          borderRadius="$3"
          paddingHorizontal="$5"
        >
          <Text fontWeight="700" fontSize="$4">
            Go Back
          </Text>
        </Button>
      </YStack>
    );
  }

  return <PlayerDetailById playerId={id} />;
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

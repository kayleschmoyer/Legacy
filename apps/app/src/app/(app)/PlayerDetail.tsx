import React from 'react';
import { Button, H2, Text, XStack, YStack } from 'tamagui';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Mobile Player Detail Screen
 *
 * Shows detailed information for a specific player.
 * This is updated to work with Expo Router and the new player stats system.
 */
function PlayerDetail() {
  // expo-router types cannot be resolved in this project's TS config

  const router = useRouter();

  const { playerId, playerName } = useLocalSearchParams<{
    playerId: string;
    playerName: string;
  }>();

  const handleBackToStats = () => {
    router.back();
  };

  return (
    <YStack flex={1} padding="$4" space="$4" backgroundColor="$background">
      {/* Back button */}
      <XStack alignItems="center" space="$2">
        <Button size="$3" onPress={handleBackToStats} chromeless>
          ← Back to Statistics
        </Button>
      </XStack>

      {/* Player header */}
      <YStack space="$2" paddingVertical="$3">
        <H2 fontSize="$8" color="$color12">
          {playerName || `Player ${playerId}`}
        </H2>
        <Text fontSize="$4" color="$gray11">
          Player ID: {playerId}
        </Text>
      </YStack>

      {/* Placeholder content */}
      <YStack flex={1} justifyContent="center" alignItems="center" space="$4">
        <Text
          fontSize="$7"
          textAlign="center"
          accessibilityLabel="Player statistics chart"
        >
          <span role="img" aria-label="chart">
            📊
          </span>
        </Text>
        <Text fontSize="$6" fontWeight="600" textAlign="center">
          Player Details
        </Text>
        <Text fontSize="$4" color="$gray11" textAlign="center" maxWidth={300}>
          This screen would show comprehensive player information, including:
        </Text>

        <YStack space="$2" alignItems="flex-start" maxWidth={280}>
          <Text fontSize="$4" color="$gray10">
            • Career statistics and trends
          </Text>
          <Text fontSize="$4" color="$gray10">
            • Season-by-season performance
          </Text>
          <Text fontSize="$4" color="$gray10">
            • Advanced analytics and metrics
          </Text>
          <Text fontSize="$4" color="$gray10">
            • Team history and positions
          </Text>
          <Text fontSize="$4" color="$gray10">
            • Awards and achievements
          </Text>
          <Text fontSize="$4" color="$gray10">
            • Comparable players
          </Text>
        </YStack>

        {/* Action buttons */}
        <YStack space="$3" marginTop="$4" alignItems="center">
          <Button size="$4" theme="blue" onPress={handleBackToStats}>
            View All Player Statistics
          </Button>
        </YStack>
      </YStack>
    </YStack>
  );
}

export default PlayerDetail;

/**
 * PlayerDetailScreen Header Component
 */
export function PlayerDetailScreenHeader() {
  const { playerName } = useLocalSearchParams<{ playerName: string }>();

  return (
    <XStack flex={1} alignItems="center" justifyContent="center">
      <Text fontSize="$5" fontWeight="600" color="$color12" numberOfLines={1}>
        {playerName || 'Player Details'}
      </Text>
    </XStack>
  );
}

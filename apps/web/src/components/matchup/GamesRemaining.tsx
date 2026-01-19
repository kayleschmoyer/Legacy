import React from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';

export interface GamesRemainingProps {
  gamesRemaining: number;
  totalGames: number;
  compact?: boolean;
}

/**
 * GamesRemaining - Displays games remaining counter with progress visualization
 */
export function GamesRemaining({
  gamesRemaining,
  totalGames,
  compact = false,
}: GamesRemainingProps) {
  const gamesCompleted = totalGames - gamesRemaining;
  const progressPercentage = (gamesCompleted / totalGames) * 100;

  if (compact) {
    return (
      <XStack space="$2" alignItems="center">
        <Text fontSize="$2" color="$orange10" fontWeight="bold">
          {gamesRemaining} games left
        </Text>
      </XStack>
    );
  }

  return (
    <Card 
      size="$3" 
      bordered 
      padding="$3"
      backgroundColor="$background"
    >
      <YStack space="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontSize="$3" fontWeight="bold">
            Games Progress
          </Text>
          <Text fontSize="$4" color="$orange10" fontWeight="bold">
            {gamesRemaining} left
          </Text>
        </XStack>

        {/* Progress bar */}
        <YStack space="$1">
          <YStack
            height={8}
            width="100%"
            backgroundColor="$gray5"
            borderRadius="$2"
            overflow="hidden"
          >
            <YStack
              height="100%"
              width={`${progressPercentage}%`}
              backgroundColor={gamesRemaining === 0 ? '$green10' : '$blue10'}
              animation="bouncy"
            />
          </YStack>

          <XStack justifyContent="space-between">
            <Text fontSize="$2" color="$gray11">
              {gamesCompleted} completed
            </Text>
            <Text fontSize="$2" color="$gray11">
              {totalGames} total
            </Text>
          </XStack>
        </YStack>
      </YStack>
    </Card>
  );
}

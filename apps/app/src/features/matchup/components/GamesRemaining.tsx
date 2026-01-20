import React from 'react';
import { Card, H5, Progress, Text, XStack, YStack } from 'tamagui';

export interface GamesRemainingProps {
  gamesTotal: number;
  gamesCompleted: number;
  gamesRemaining: number;
}

/**
 * GamesRemaining - Shows progress of games selected/completed in a matchup
 * Displays a progress bar and counter
 */
export function GamesRemaining({
  gamesTotal,
  gamesCompleted,
  gamesRemaining,
}: GamesRemainingProps) {
  const progress = gamesTotal > 0 ? (gamesCompleted / gamesTotal) * 100 : 0;

  const getProgressColor = () => {
    if (progress >= 100) return '$green10';
    if (progress >= 50) return '$blue10';
    return '$orange10';
  };

  return (
    <Card elevate size="$3" bordered margin="$2">
      <Card.Header padded>
        <XStack justifyContent="space-between" alignItems="center">
          <H5>Game Selection</H5>
          <Text fontSize="$4" fontWeight="bold" color={getProgressColor()}>
            {gamesCompleted} / {gamesTotal}
          </Text>
        </XStack>
      </Card.Header>

      <YStack padding="$3" space="$3">
        {/* Progress Bar */}
        <Progress value={progress} size="$2" backgroundColor="$gray5">
          <Progress.Indicator
            animation="bouncy"
            backgroundColor={getProgressColor()}
          />
        </Progress>

        {/* Stats */}
        <XStack justifyContent="space-around">
          <YStack alignItems="center" space="$1">
            <Text fontSize="$6" fontWeight="bold" color="$green10">
              {gamesCompleted}
            </Text>
            <Text fontSize="$2" color="$gray11">
              Completed
            </Text>
          </YStack>

          <YStack alignItems="center" space="$1">
            <Text fontSize="$6" fontWeight="bold" color="$orange10">
              {gamesRemaining}
            </Text>
            <Text fontSize="$2" color="$gray11">
              Remaining
            </Text>
          </YStack>

          <YStack alignItems="center" space="$1">
            <Text fontSize="$6" fontWeight="bold" color="$blue10">
              {gamesTotal}
            </Text>
            <Text fontSize="$2" color="$gray11">
              Total
            </Text>
          </YStack>
        </XStack>

        {/* Status Message */}
        {gamesRemaining > 0 && (
          <Text fontSize="$2" color="$gray11" textAlign="center" marginTop="$2">
            Select {gamesRemaining} more{' '}
            {gamesRemaining === 1 ? 'game' : 'games'} to complete your roster
          </Text>
        )}

        {gamesRemaining === 0 && gamesTotal > 0 && (
          <Text
            fontSize="$2"
            color="$green10"
            textAlign="center"
            marginTop="$2"
            fontWeight="bold"
          >
            ✓ All games selected
          </Text>
        )}
      </YStack>
    </Card>
  );
}

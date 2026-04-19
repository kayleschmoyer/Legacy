import React from 'react';
import { Card, H4, Text, XStack, YStack } from 'tamagui';
import {
  type MatchupFragment,
  MatchupStatus,
} from '../../api/db/graphql.generated';

export interface MatchupCardProps {
  matchup: MatchupFragment | null | undefined;
  onPress?: () => void;
  showWeek?: boolean;
}

export function MatchupCard({
  matchup,
  onPress,
  showWeek = true,
}: MatchupCardProps) {
  if (!matchup) {
    return null;
  }

  const { weekNumber, team1Score, team2Score, status } = matchup;

  const getStatusColor = () => {
    switch (status) {
      case MatchupStatus.Completed:
        return '$green10';
      case MatchupStatus.InProgress:
        return '$blue10';
      case MatchupStatus.Scheduled:
        return '$gray10';
      default:
        return '$gray10';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case MatchupStatus.Completed:
        return 'Final';
      case MatchupStatus.InProgress:
        return 'Live';
      case MatchupStatus.Scheduled:
        return 'Scheduled';
      case MatchupStatus.Cancelled:
        return 'Cancelled';
      default:
        return status ?? 'Unknown';
    }
  };

  return (
    <Card
      elevate
      size="$4"
      bordered
      pressStyle={{ scale: 0.98 }}
      onPress={onPress}
      animation="bouncy"
      margin="$2"
      testID="matchup-card"
    >
      <Card.Header padded>
        <XStack justifyContent="space-between" alignItems="center">
          {showWeek && (
            <Text fontSize="$3" color="$gray11">
              Week {weekNumber}
            </Text>
          )}
          <Text fontSize="$2" color={getStatusColor()} fontWeight="bold">
            {getStatusText()}
          </Text>
        </XStack>
      </Card.Header>

      <YStack padding="$3" space="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <H4 flex={1}>Team 1</H4>
          <Text fontSize="$6" fontWeight="bold">
            {team1Score?.toFixed(2) ?? '-'}
          </Text>
        </XStack>

        <XStack justifyContent="center" paddingVertical="$1">
          <Text color="$gray10" fontSize="$2">
            VS
          </Text>
        </XStack>

        <XStack justifyContent="space-between" alignItems="center">
          <H4 flex={1}>Team 2</H4>
          <Text fontSize="$6" fontWeight="bold">
            {team2Score?.toFixed(2) ?? '-'}
          </Text>
        </XStack>
      </YStack>
    </Card>
  );
}

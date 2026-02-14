import React from 'react';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { MatchupCard } from './MatchupCard';
import { type MatchupFragment } from '../../api/db/graphql.generated';

export interface MatchupGridProps {
  matchups: MatchupFragment[];
  loading?: boolean;
  error?: Error | null;
  onMatchupPress?: (matchup: MatchupFragment) => void;
  weekNumber?: number;
}

/**
 * MatchupGrid - Grid layout displaying multiple matchups for a week
 * Responsive design for mobile/tablet/desktop
 */
export function MatchupGrid({
  matchups,
  loading = false,
  error = null,
  onMatchupPress,
  weekNumber,
}: MatchupGridProps) {
  if (loading) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={200}
      >
        <Spinner size="large" color="$blue10" />
        <Text marginTop="$2" color="$gray11">
          Loading matchups...
        </Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={200}
      >
        <Text color="$red10" fontSize="$5" fontWeight="bold">
          Error loading matchups
        </Text>
        <Text marginTop="$2" color="$gray11">
          {error.message}
        </Text>
      </YStack>
    );
  }

  if (matchups.length === 0) {
    return (
      <YStack
        padding="$4"
        alignItems="center"
        justifyContent="center"
        minHeight={200}
      >
        <Text color="$gray11" fontSize="$4">
          No matchups found{weekNumber ? ` for week ${weekNumber}` : ''}
        </Text>
      </YStack>
    );
  }

  return (
    <YStack width="100%" padding="$2">
      {weekNumber && (
        <Text
          fontSize="$5"
          fontWeight="bold"
          marginBottom="$3"
          paddingHorizontal="$2"
        >
          Week {weekNumber} Matchups
        </Text>
      )}

      {/* Grid layout - responsive */}
      <XStack flexWrap="wrap" justifyContent="flex-start" gap="$2">
        {matchups.map((matchup) => (
          <YStack
            key={matchup.id}
            width="100%"
            $gtSm={{ width: 'calc(50% - 8px)' }}
            $gtLg={{ width: 'calc(33.333% - 8px)' }}
          >
            <MatchupCard
              matchup={matchup}
              onPress={() => onMatchupPress?.(matchup)}
              showWeek={!weekNumber}
            />
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}

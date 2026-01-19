import React from 'react';
import { FlatList } from 'react-native';
import { Text, YStack } from 'tamagui';
import { MatchupCard } from './MatchupCard';
import type { MatchupFragment } from '../../../api/db/graphql.generated';

export interface MatchupListProps {
  matchups: MatchupFragment[];
  onMatchupPress?: (matchup: MatchupFragment) => void;
  loading?: boolean;
  emptyMessage?: string;
}

/**
 * MatchupList - Displays a scrollable list of matchups
 * Used for viewing all matchups in a week or league
 */
export function MatchupList({
  matchups,
  onMatchupPress,
  loading = false,
  emptyMessage = 'No matchups found',
}: MatchupListProps) {
  if (loading) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray11">Loading matchups...</Text>
      </YStack>
    );
  }

  if (matchups.length === 0) {
    return (
      <YStack padding="$4" alignItems="center">
        <Text color="$gray11">{emptyMessage}</Text>
      </YStack>
    );
  }

  return (
    <FlatList
      data={matchups}
      keyExtractor={(item) => item.id?.toString() ?? ''}
      renderItem={({ item }) => (
        <MatchupCard
          matchup={item}
          onPress={() => onMatchupPress?.(item)}
          showWeek={true}
        />
      )}
      contentContainerStyle={{ padding: 8 }}
    />
  );
}

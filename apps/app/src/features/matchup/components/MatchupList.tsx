import React from 'react';
import { FlatList } from 'react-native';
import { Text, YStack } from 'tamagui';
import type { AppMatchupFragment } from '@legacy-sports/graphql';
import { MatchupCard } from './MatchupCard';

export interface MatchupListProps {
  matchups: AppMatchupFragment[];
  onMatchupPress?: (matchup: AppMatchupFragment) => void;
  loading?: boolean;
  emptyMessage?: string;
  /** Pull-to-refresh state for the list (LS-8847). */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Content (e.g. a week selector) rendered above the matchup rows.
   * Passed straight through to FlatList's `ListHeaderComponent` (LS-6319)
   * so callers never need to wrap this list in an outer ScrollView to add
   * a header — doing so would nest a VirtualizedList inside a plain
   * ScrollView, which React Native warns against and which breaks scroll
   * performance on Android.
   */
  listHeaderComponent?: React.ComponentType | React.ReactElement | null;
}

/**
 * MatchupList - Displays a scrollable list of matchups
 * Used for viewing all matchups in a week or league
 *
 * This list owns its own scrolling. Do not wrap it in a ScrollView — RN
 * warns when a VirtualizedList (FlatList) is nested inside a plain
 * ScrollView, and it breaks Android scroll performance. Any header content
 * (e.g. a week selector) belongs in `listHeaderComponent`, not an outer
 * wrapper (LS-6319).
 */
export function MatchupList({
  matchups,
  onMatchupPress,
  loading = false,
  emptyMessage = 'No matchups found',
  refreshing,
  onRefresh,
  listHeaderComponent,
}: MatchupListProps) {
  // Always render a single FlatList (loading/empty states go through
  // ListEmptyComponent) so the tab's rendering strategy — and its
  // virtualization behavior — stays consistent across every state instead of
  // swapping between a plain YStack and a virtualized list (LS-6319).
  return (
    <FlatList
      data={loading ? [] : matchups}
      keyExtractor={(item) => item.id?.toString() ?? ''}
      renderItem={({ item }) => (
        <MatchupCard
          matchup={item}
          onPress={() => onMatchupPress?.(item)}
          showWeek={true}
        />
      )}
      ListHeaderComponent={listHeaderComponent}
      ListEmptyComponent={
        <YStack padding="$4" alignItems="center">
          <Text color="$gray11">
            {loading ? 'Loading matchups...' : emptyMessage}
          </Text>
        </YStack>
      }
      contentContainerStyle={{ padding: 8 }}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}

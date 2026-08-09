import React, { useMemo } from 'react';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { SportToggle } from './SportToggle';
import { SearchField } from './SearchField';
import { PositionChipRail } from './PositionChipRail';
import { SortControl } from './SortControl';
import { PlayerFeedCard } from './PlayerFeedCard';
import { PremiumTeaserCard } from './PremiumTeaserCard';
import { PlayerFeedSkeleton } from './PlayerFeedSkeleton';
import { playersCardFeedTopPadding } from './cardFeedHelpers';
import { EmptyCard, ErrorCard } from '../shell/StateCards';
import { FONT_DISPLAY } from '../shell/tokens';
import type { Sport } from '../../../utils/colors';
import { BG_DARK, TEXT_HIGH_CONTRAST } from '../../../utils/colors';
import { FlatList } from '../../../platform-components';

export interface PlayerFeedRow {
  id: string;
  position: string;
  name: string;
  /** Pre-formatted sub-stat line — see `formatBaseballCardSubStats`/`formatFootballCardSubStats`. */
  subStats: string;
  /** Pre-formatted career fantasy points, e.g. "14,208". */
  fpts: string;
}

type ListItem =
  | { kind: 'player'; row: PlayerFeedRow }
  | { kind: 'premium-teaser' };

// Insert the premium teaser after the 3rd card, or at the end of a shorter list.
const TEASER_INSERT_INDEX = 3;

export interface PlayersCardFeedProps {
  sport: Sport;
  onSportChange: (sport: Sport) => void;
  /** Whether to render the MLB/NFL toggle at all — the screen omits it entirely
   *  when only one sport is available (e.g. the `football_enabled` GrowthBook
   *  flag is off), matching the pre-redesign screen's behavior. Default true. */
  showSportToggle?: boolean;
  /** Top safe-area inset (`useSafeAreaInsets().top`) so the header clears the
   *  status bar — the screen wiring owns reading the inset, per
   *  shared-components-first (mirrors `HomeScreen`'s `topInset` prop). */
  topInset?: number;
  positions: readonly string[];
  position: string;
  onPositionChange: (position: string) => void;
  /** Raw (uncommitted) search input — the caller owns debouncing before it reaches the query. */
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortDirection: 'asc' | 'desc';
  onToggleSort: () => void;
  rows: readonly PlayerFeedRow[];
  resultCount: number;
  onPlayerPress: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  onClearFilters: () => void;
  isPremium: boolean;
  onPremiumPress: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onEndReached: () => void;
  /** Optional header overflow action — the design moves Compare here (no longer a top-level segment). */
  onOverflowPress?: () => void;
  overflowLabel?: string;
  testID?: string;
  /** Pull-to-refresh state for the card list (LS-8847). */
  refreshing?: boolean;
  onRefresh?: () => void;
}

/**
 * Mobile-first Players tab card feed (LS-8832, design handoff option 1c) —
 * compact branded header, sport toggle, always-visible search, position chip
 * rail, FPTS-first player cards, and an inline premium teaser. Purely
 * presentational: all data fetching, debouncing, sport-switch reset, and
 * expo-router param persistence stay in the screen wiring
 * (`apps/app/src/app/(app)/(tabs)/players.tsx`) per shared-components-first.
 */
export function PlayersCardFeed({
  sport,
  onSportChange,
  showSportToggle = true,
  topInset = 0,
  positions,
  position,
  onPositionChange,
  searchValue,
  onSearchChange,
  sortDirection,
  onToggleSort,
  rows,
  resultCount,
  onPlayerPress,
  isLoading,
  isError,
  onRetry,
  onClearFilters,
  isPremium,
  onPremiumPress,
  hasMore,
  isLoadingMore,
  onEndReached,
  onOverflowPress,
  overflowLabel = 'Compare',
  testID = 'players-card-feed',
  refreshing,
  onRefresh,
}: PlayersCardFeedProps) {
  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = rows.map((row) => ({ kind: 'player', row }));
    if (!isPremium) {
      const insertAt = Math.min(TEASER_INSERT_INDEX, items.length);
      items.splice(insertAt, 0, { kind: 'premium-teaser' });
    }
    return items;
  }, [rows, isPremium]);

  const showResults = !isLoading && !isError && rows.length > 0;
  const showEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <YStack
      testID={testID}
      flex={1}
      backgroundColor={BG_DARK}
      paddingHorizontal={16}
    >
      <YStack
        testID={`${testID}-header`}
        gap={10}
        paddingTop={playersCardFeedTopPadding(topInset)}
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="800"
            fontSize={26}
            color={TEXT_HIGH_CONTRAST}
          >
            Players
          </Text>
          <XStack alignItems="center" gap={10}>
            {showSportToggle && (
              <SportToggle
                sport={sport}
                onChange={onSportChange}
                testID={`${testID}-sport-toggle`}
              />
            )}
            {onOverflowPress && (
              <XStack
                testID={`${testID}-overflow`}
                onPress={onOverflowPress}
                pressStyle={{ opacity: 0.85 }}
                accessibilityRole="button"
                accessibilityLabel={overflowLabel}
                paddingHorizontal={4}
                paddingVertical={4}
              >
                <Text
                  fontFamily={FONT_DISPLAY}
                  fontWeight="700"
                  fontSize={11}
                  color={TEXT_HIGH_CONTRAST}
                >
                  {overflowLabel}
                </Text>
              </XStack>
            )}
          </XStack>
        </XStack>

        <SearchField
          value={searchValue}
          onChangeText={onSearchChange}
          testID={`${testID}-search`}
        />
        <PositionChipRail
          sport={sport}
          positions={positions}
          value={position}
          onChange={onPositionChange}
          testID={`${testID}-position-chips`}
        />
      </YStack>

      <YStack marginTop={10} flex={1}>
        {isLoading && <PlayerFeedSkeleton testID={`${testID}-skeleton`} />}
        {isError && <ErrorCard onRetry={onRetry} />}
        {showEmpty && <EmptyCard onClear={onClearFilters} />}
        {showResults && (
          <>
            <SortControl
              direction={sortDirection}
              onToggle={onToggleSort}
              resultCount={resultCount}
              testID={`${testID}-sort`}
            />
            <FlatList
              testID={`${testID}-list`}
              data={listData}
              keyExtractor={(item: ListItem, index: number) =>
                item.kind === 'player' ? item.row.id : `premium-teaser-${index}`
              }
              renderItem={({ item }: { item: ListItem }) =>
                item.kind === 'premium-teaser' ? (
                  <PremiumTeaserCard onPress={onPremiumPress} />
                ) : (
                  <PlayerFeedCard
                    sport={sport}
                    position={item.row.position}
                    name={item.row.name}
                    subStats={item.row.subStats}
                    fpts={item.row.fpts}
                    onPress={() => onPlayerPress(item.row.id)}
                    testID={`${testID}-card-${item.row.id}`}
                  />
                )
              }
              ItemSeparatorComponent={() => <YStack height={8} />}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
              onEndReached={hasMore ? onEndReached : undefined}
              onEndReachedThreshold={0.5}
              refreshing={refreshing}
              onRefresh={onRefresh}
              ListFooterComponent={
                isLoadingMore ? (
                  <YStack alignItems="center" paddingVertical={16}>
                    <Spinner size="small" color="$orange9" />
                  </YStack>
                ) : null
              }
            />
          </>
        )}
      </YStack>
    </YStack>
  );
}

export default PlayersCardFeed;

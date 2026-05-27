import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  H2,
  Input,
  ScrollView,
  Select,
  Separator,
  Spinner,
  Text,
  View,
  XStack,
  YStack,
} from 'tamagui';
import { ChevronDown, RefreshCw, Search } from '@tamagui/lucide-icons';
import { PlayerCard } from './PlayerCard';
import { PlayerFragment, useGetAllPlayersQuery } from './PlayersApi';

export interface PlayersGridResultStats {
  matched: number;
  total: number;
  hasMore: boolean;
}

export interface PlayersGridProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  showSearch?: boolean;
  showSorting?: boolean;
  title?: string;
  /** Map of player ID to projected fantasy points per game (optional) */
  projectedPoints?: Map<number, number>;
  /** Whether to show projections on player cards */
  showProjections?: boolean;
  /**
   * Controlled search term. When provided, replaces the grid's internal
   * search input value — used by PlayersScreen (LS-4649) to drive the
   * editorial search bar above the rail. Pair with `showSearch={false}`
   * to hide the built-in input.
   */
  searchTerm?: string;
  /**
   * Controlled sort key (e.g. `NAME_ASC`, `NAME_DESC`). When provided,
   * replaces the grid's internal Select value — used by PlayersScreen
   * (LS-4649) so the editorial sort selector above the rail drives the
   * query. Pair with `showSorting={false}` to hide the built-in select.
   */
  sortBy?: string;
  /**
   * Notified whenever the grid's matched/total/hasMore counts change.
   * Used by PlayersScreen (LS-4649) to drive the count chip + active-
   * summary header without duplicating the query.
   */
  onResultStats?: (stats: PlayersGridResultStats) => void;
}

const SORT_OPTIONS = [
  { label: 'Name (A-Z)', value: 'NAME_ASC' },
  { label: 'Name (Z-A)', value: 'NAME_DESC' },
] as const;

// Strict allow-list of sort values that may reach the GraphQL resolver
// (LS-4649 reviewer feedback). `sortBy` is decomposed into `orderBy` +
// `orderDirection` and sent as query variables; clamping the input to
// known values up front prevents an unexpected `sortByProp` (now that
// the prop is externally controllable) from passing arbitrary strings
// to the backend.
const ALLOWED_SORT_VALUES = new Set(SORT_OPTIONS.map((o) => o.value));
const DEFAULT_SORT = 'NAME_ASC';
function normalizeSortBy(raw: string | undefined): string {
  return raw &&
    ALLOWED_SORT_VALUES.has(raw as (typeof SORT_OPTIONS)[number]['value'])
    ? raw
    : DEFAULT_SORT;
}

function PlayersGrid({
  onPlayerSelect,
  pageSize = 50,
  showSearch = true,
  showSorting = true,
  title = 'Players',
  projectedPoints,
  showProjections = false,
  searchTerm: searchTermProp,
  sortBy: sortByProp,
  onResultStats,
}: PlayersGridProps) {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [internalSortBy, setInternalSortBy] = useState<string>(DEFAULT_SORT);
  const searchTerm = searchTermProp ?? internalSearchTerm;
  // Clamp the effective sort to the allow-list so an unexpected external
  // value (controlled `sortByProp`) never reaches the resolver verbatim.
  const sortBy = normalizeSortBy(sortByProp ?? internalSortBy);
  const setSearchTerm = setInternalSearchTerm;
  const [allPlayers, setAllPlayers] = useState<PlayerFragment[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const orderBy = sortBy.split('_')[0].toLowerCase();
  const orderDirection = sortBy.split('_')[1].toLowerCase();

  const { data, loading, error, fetchMore, refetch } = useGetAllPlayersQuery({
    variables: {
      limit: pageSize,
      offset: 0,
      orderBy,
      orderDirection,
    },
    errorPolicy: 'all',
  });

  // Sync accumulated state when the base query result changes (initial load or sort change).
  useEffect(() => {
    if (!data?.players) return;
    const players = data.players.filter((p): p is PlayerFragment => p !== null);
    setAllPlayers(players);
    setOffset(players.length);
    setHasMore(players.length >= pageSize);
  }, [data?.players, pageSize]);

  const handleSortChange = useCallback((newSort: string) => {
    setInternalSortBy(newSort);
    // useEffect above resets allPlayers when data updates for the new sort
  }, []);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const result = await fetchMore({ variables: { offset } });
      const newPlayers = (result.data?.players ?? []).filter(
        (p): p is PlayerFragment => p !== null,
      );
      setAllPlayers((prev) => [...prev, ...newPlayers]);
      setOffset((prev) => prev + newPlayers.length);
      setHasMore(newPlayers.length >= pageSize);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchMore, offset, pageSize]);

  const handleRefresh = useCallback(() => {
    void refetch({ offset: 0 });
    // useEffect resets allPlayers when refreshed data arrives
  }, [refetch]);

  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return allPlayers;

    return allPlayers.filter((player) =>
      `${player.firstName || ''} ${player.lastName || ''}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
    );
  }, [allPlayers, searchTerm]);

  // Surface matched/total/hasMore so a parent (PlayersScreen, LS-4649)
  // can drive its own count chip and active-summary meta without
  // re-issuing the same query.
  useEffect(() => {
    if (!onResultStats) return;
    onResultStats({
      matched: filteredPlayers.length,
      total: allPlayers.length,
      hasMore,
    });
  }, [filteredPlayers.length, allPlayers.length, hasMore, onResultStats]);

  if (loading && !data) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}
      >
        <Spinner size="large" color="$blue10" />
        <Text style={{ marginTop: 8 }}>Loading players...</Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}
      >
        <Text color="$red10" style={{ textAlign: 'center', marginBottom: 12 }}>
          Error loading players: {error.message}
        </Text>
        <Button onPress={handleRefresh}>
          <RefreshCw size={16} />
          Retry
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} className="pg-root" p="$4" bg="$background">
      {/* Mobile readability tweaks (LS-4809): full-width cards, wrappable
          header and controls, smaller refresh control. Matches the inline
          <style> responsive pattern used elsewhere in this feature. */}
      <style>{`
        .pg-card-cell { width: 280px; min-width: 280px; max-width: 400px; }
        @media (max-width: 640px) {
          .pg-root { padding: 12px !important; }
          .pg-head { flex-wrap: wrap; gap: 8px; }
          .pg-head-title { font-size: 24px !important; }
          .pg-card-cell { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }
          .pg-controls > * { flex: 1 1 100% !important; min-width: 0 !important; }
        }
      `}</style>
      {/* Header */}
      <YStack mb="$4">
        <XStack
          className="pg-head"
          jc="space-between"
          ai="center"
          mb="$3"
          flexWrap="wrap"
        >
          <H2 color="$color" className="pg-head-title">
            {title}
          </H2>
          <XStack gap="$2" ai="center">
            <Text color="$gray10">
              {filteredPlayers.length} player
              {filteredPlayers.length !== 1 ? 's' : ''}
              {!searchTerm && hasMore ? ' (more available)' : ''}
            </Text>
            <Button
              size="$3"
              onPress={handleRefresh}
              variant="outlined"
              aria-label="Refresh players"
            >
              <RefreshCw size={16} />
            </Button>
          </XStack>
        </XStack>

        {/* Controls */}
        {(showSearch || showSorting) && (
          <XStack className="pg-controls" gap="$3" ai="center" flexWrap="wrap">
            {showSearch && (
              <XStack
                flex={1}
                minW={200}
                ai="center"
                role="combobox"
                aria-expanded={searchTerm.length > 0}
                aria-haspopup="listbox"
              >
                <Input
                  placeholder="Search players..."
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  flex={1}
                  size="$3"
                  aria-label="Search players"
                />
                {/* Search overlay button */}
                <View pos="absolute" r="$2" t="$2" zi={1} pointerEvents="none">
                  <Button size={2} circular chromeless pointerEvents="auto">
                    <Search size={16} />
                  </Button>
                </View>
              </XStack>
            )}

            {showSorting && (
              <Select value={sortBy} onValueChange={handleSortChange} size="$3">
                <Select.Trigger width={180}>
                  <Select.Value placeholder="Sort by..." />
                  <Select.Icon>
                    <ChevronDown />
                  </Select.Icon>
                </Select.Trigger>

                <Select.Content zIndex={200000}>
                  <Select.ScrollUpButton />
                  <Select.Viewport>
                    <Select.Group>
                      <Select.Label>Sort Options</Select.Label>
                      {SORT_OPTIONS.map((option, idx) => (
                        <Select.Item
                          key={option.value}
                          index={idx}
                          value={option.value}
                        >
                          <Select.ItemText>{option.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Group>
                  </Select.Viewport>
                  <Select.ScrollDownButton />
                </Select.Content>
              </Select>
            )}
          </XStack>
        )}
      </YStack>

      <Separator mb="$4" />

      {/* Players Grid */}
      {filteredPlayers.length === 0 ? (
        <YStack flex={1} jc="center" ai="center">
          <Text color="$gray10" ta="center">
            {searchTerm
              ? 'No players found matching your search.'
              : 'No players available.'}
          </Text>
        </YStack>
      ) : (
        <ScrollView>
          <YStack flexDirection="row" flexWrap="wrap" gap="$3" jc="flex-start">
            {filteredPlayers.map((player) => {
              const projection = player.id
                ? projectedPoints?.get(player.id)
                : undefined;

              return (
                <YStack key={player.id} className="pg-card-cell">
                  <PlayerCard
                    player={player}
                    onPlayerClick={onPlayerSelect}
                    projectedPoints={projection}
                    showProjection={showProjections}
                  />
                </YStack>
              );
            })}
          </YStack>

          {!searchTerm && hasMore && (
            <YStack ai="center" marginTop="$4" marginBottom="$2">
              <Button
                onPress={() => {
                  void handleLoadMore();
                }}
                disabled={loadingMore}
                variant="outlined"
                size="$4"
              >
                {loadingMore ? (
                  <XStack gap="$2" ai="center">
                    <Spinner size="small" color="$blue10" />
                    <Text>Loading...</Text>
                  </XStack>
                ) : (
                  <Text>Load More Players</Text>
                )}
              </Button>
            </YStack>
          )}
        </ScrollView>
      )}
    </YStack>
  );
}

export { PlayersGrid };

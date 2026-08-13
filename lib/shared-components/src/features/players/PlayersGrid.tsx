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
import { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown';
import { RefreshCw } from '@tamagui/lucide-icons/icons/RefreshCw';
import { Search } from '@tamagui/lucide-icons/icons/Search';
import {
  formatBaseballCardSubStats,
  PlayerFeedCard,
  useAccumulatedPages,
  useResettableCursor,
} from './cardFeed';
import { PlayerListRow } from './PlayerListRow';
import { PlayersStatsTable } from './PlayersStatsTable';
import { PlayerFragment, useGetAllPlayersQuery } from './PlayersApi';
import { formatProjection } from './usePlayerProjections';
import {
  PlayerCareerStats,
  useCareerStatsWithNames,
} from './services/CareerStatsService';

/** Card / list / stats display mode for the players browse surface. */
export type PlayersViewMode = 'cards' | 'list' | 'stats';

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
  /**
   * Render mode for the player collection. `'cards'` (default) keeps the
   * existing card grid; `'list'` renders the dense `.pp-list-row` layout
   * from the Players Page redesign (LS-4650).
   */
  viewMode?: PlayersViewMode;
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
  viewMode = 'cards',
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
  const isCardsView = viewMode === 'cards';

  const orderBy = sortBy.split('_')[0].toLowerCase();
  const orderDirection = sortBy.split('_')[1].toLowerCase();

  // List/Stats views: unchanged `GetAllPlayers`-backed offset pagination.
  // Skipped while the cards view is active, since nothing on screen reads
  // it then — LS-9073 re-points the cards view at the richer career-stats
  // query below instead.
  const { data, loading, error, fetchMore, refetch } = useGetAllPlayersQuery({
    variables: {
      limit: pageSize,
      offset: 0,
      orderBy,
      orderDirection,
    },
    errorPolicy: 'all',
    skip: isCardsView,
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

  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return allPlayers;

    return allPlayers.filter((player) =>
      `${player.firstName || ''} ${player.lastName || ''}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
    );
  }, [allPlayers, searchTerm]);

  // Cards view: the same career-batting-stats query/hook the desktop stats
  // table uses (`useCareerStatsWithNames` / `GetCareerBattingStats`), instead
  // of the baseball-only `GetAllPlayers` query — LS-9073. Cursor-continuation
  // pagination (`useResettableCursor`/`useAccumulatedPages`, shared with the
  // native card feed) keeps the infinite-scroll model underneath while
  // `searchTerm`/sort are sent server-side like the stats table does.
  // `viewMode` is folded into the query key so entering/leaving the cards
  // view always forces a fresh reset page, even though `skip` toggles the
  // query on and off with the same filter/sort values.
  const careerOrderBy = orderBy === 'name' ? 'lastName' : orderBy;
  const cardsQueryKey = `${viewMode}|${searchTerm}|${careerOrderBy}|${orderDirection}`;
  const {
    cursor: cardsCursor,
    setCursor: setCardsCursor,
    isResetRef: cardsIsResetRef,
  } = useResettableCursor(cardsQueryKey);

  const {
    data: cardsPage,
    loading: cardsLoading,
    error: cardsError,
    totalCount: cardsTotalCount,
    hasNextPage: cardsHasNextPage,
    endCursor: cardsEndCursor,
    refetch: cardsRefetch,
  } = useCareerStatsWithNames(
    {
      first: pageSize,
      after: cardsCursor,
      orderBy: careerOrderBy,
      orderDirection,
      searchTerm: searchTerm || undefined,
    },
    { skip: !isCardsView },
  );

  const cardsAccumulated = useAccumulatedPages(
    cardsPage,
    cardsLoading,
    cardsCursor,
    cardsIsResetRef,
  );

  const cardsIsLoadingMore = cardsLoading && cardsCursor !== undefined;

  const handleCardsLoadMore = useCallback(() => {
    if (cardsHasNextPage && cardsEndCursor && !cardsLoading) {
      setCardsCursor(cardsEndCursor);
    }
  }, [cardsHasNextPage, cardsEndCursor, cardsLoading, setCardsCursor]);

  const handleCardPlayerSelect = useCallback(
    (player: PlayerCareerStats) => {
      onPlayerSelect?.({
        id: player.playerId,
        firstName: player.firstName,
        lastName: player.lastName,
        brefId: player.brefId,
        statsLastFetchedAt: null,
        careerBatting: {
          battingAverage: player.battingAverage,
          homeRuns: player.homeRuns,
          runs: player.runs,
          rbi: player.rbi,
          stolenBases: player.stolenBases,
        },
      });
    },
    [onPlayerSelect],
  );

  const handleRefresh = useCallback(() => {
    if (isCardsView) {
      setCardsCursor(undefined);
      cardsIsResetRef.current = true;
      void cardsRefetch();
      return;
    }
    void refetch({ offset: 0 });
    // useEffect resets allPlayers when refreshed data arrives
  }, [isCardsView, refetch, cardsRefetch, setCardsCursor, cardsIsResetRef]);

  // Unify the two data sources' matched/total/hasMore into one shape so the
  // header, empty state, and `onResultStats` callback don't need to branch
  // on `viewMode` more than once.
  const resultStats = useMemo<PlayersGridResultStats>(() => {
    if (isCardsView) {
      return {
        matched: cardsAccumulated.length,
        total: cardsTotalCount,
        hasMore: cardsHasNextPage,
      };
    }
    return {
      matched: filteredPlayers.length,
      total: allPlayers.length,
      hasMore,
    };
  }, [
    isCardsView,
    cardsAccumulated.length,
    cardsTotalCount,
    cardsHasNextPage,
    filteredPlayers.length,
    allPlayers.length,
    hasMore,
  ]);

  // Surface matched/total/hasMore so a parent (PlayersScreen, LS-4649)
  // can drive its own count chip and active-summary meta without
  // re-issuing the same query.
  useEffect(() => {
    onResultStats?.(resultStats);
  }, [resultStats, onResultStats]);

  const isInitialLoading = isCardsView
    ? cardsLoading && cardsAccumulated.length === 0
    : loading && !data;
  const activeError = isCardsView ? cardsError : error;

  if (isInitialLoading) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}
      >
        <Spinner size="large" color="$brandNavyLight" />
        <Text style={{ marginTop: 8 }}>Loading players...</Text>
      </YStack>
    );
  }

  if (activeError) {
    return (
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}
      >
        <Text color="$red10" style={{ textAlign: 'center', marginBottom: 12 }}>
          Error loading players: {activeError.message}
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
        /* List view rounded ends + collapsed inner borders (LS-4650).
           Mirrors the design's .pp-list-row first/last-child rules so
           consecutive rows share a single hair-line edge. */
        .pg-list-stack > .pp-list-row { border-radius: 0; border-bottom-width: 0; }
        .pg-list-stack > .pp-list-row:first-child { border-top-left-radius: 12px; border-top-right-radius: 12px; }
        .pg-list-stack > .pp-list-row:last-child { border-bottom-width: 1px; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
        @media (max-width: 640px) {
          .pg-root { padding: 12px !important; }
          .pg-head { flex-wrap: wrap; gap: 8px; }
          .pg-head-title { font-size: 24px !important; }
          .pg-controls > * { flex: 1 1 100% !important; min-width: 0 !important; }
          /* Drop the trailing stat cells on phone widths — matches the
             design's hide-sm rule at the small-tablet breakpoint. */
          .pp-list-stat-md { display: none !important; }
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
              {resultStats.matched} player
              {resultStats.matched !== 1 ? 's' : ''}
              {(isCardsView || !searchTerm) && resultStats.hasMore
                ? ' (more available)'
                : ''}
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
      {resultStats.matched === 0 ? (
        <YStack flex={1} jc="center" ai="center">
          <Text color="$gray10" ta="center">
            {searchTerm
              ? 'No players found matching your search.'
              : 'No players available.'}
          </Text>
        </YStack>
      ) : (
        <ScrollView>
          {viewMode === 'stats' ? (
            <PlayersStatsTable
              players={filteredPlayers}
              onPlayerSelect={onPlayerSelect}
            />
          ) : viewMode === 'list' ? (
            <YStack className="pg-list-stack" flexDirection="column">
              {filteredPlayers.map((player, idx) => (
                <PlayerListRow
                  key={player.id}
                  player={player}
                  index={idx}
                  onPlayerClick={onPlayerSelect}
                />
              ))}
            </YStack>
          ) : (
            <YStack flexDirection="column" gap="$2">
              {cardsAccumulated.map((player) => {
                const projection = projectedPoints?.get(player.playerId);

                return (
                  <PlayerFeedCard
                    key={player.id}
                    sport="baseball"
                    position={player.primaryPosition ?? 'UT'}
                    name={player.displayName}
                    subStats={formatBaseballCardSubStats({
                      homeRuns: player.homeRuns,
                      rbi: player.rbi,
                      battingAverage: player.battingAverage,
                    })}
                    fpts={Math.round(player.fantasyPoints).toLocaleString()}
                    onPress={() => handleCardPlayerSelect(player)}
                    projection={
                      showProjections && projection !== undefined
                        ? `${formatProjection(projection)} pts/g`
                        : undefined
                    }
                    testID={`player-feed-card-${player.id}`}
                  />
                );
              })}
            </YStack>
          )}

          {(isCardsView ? resultStats.hasMore : !searchTerm && hasMore) && (
            <YStack ai="center" marginTop="$4" marginBottom="$2">
              <Button
                onPress={() => {
                  if (isCardsView) {
                    handleCardsLoadMore();
                  } else {
                    void handleLoadMore();
                  }
                }}
                disabled={isCardsView ? cardsIsLoadingMore : loadingMore}
                variant="outlined"
                size="$4"
              >
                {(isCardsView ? cardsIsLoadingMore : loadingMore) ? (
                  <XStack gap="$2" ai="center">
                    <Spinner size="small" color="$brandNavyLight" />
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

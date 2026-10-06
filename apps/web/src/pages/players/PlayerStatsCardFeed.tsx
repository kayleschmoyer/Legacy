import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  cardPositionsForSport,
  formatBaseballCardSubStats,
  formatFootballCardSubStats,
  type PlayerFeedRow,
  PlayersCardFeed,
  positionFilterParam,
  useAccumulatedPages,
  useCareerStatsWithNames,
  useDebouncedValue,
  useResettableCursor,
} from '@legacy-sports/shared-components/players';
import { useFootballPlayersQuery } from '@legacy-sports/graphql';
import { sanitizeSearchParam } from './PlayerStatsPage';

// Web card-feed presentation of /players/stats at phone width (LS-9075). This
// mirrors the native card feed's data wiring almost verbatim
// (apps/app/src/app/(app)/(tabs)/(players)/players.tsx, LS-8832/LS-9073) — same
// PlayersCardFeed component, same career-stats data source, same cursor
// pagination — swapping only the router primitive (react-router's
// useSearchParams instead of expo-router).
//
// Scope decision (documented per the ticket's own AC): the card presentation
// has no Export/Share controls. Native's card feed never had them either, and
// PlayersCardFeed offers no slot for them — adding bespoke export/share UI to
// the mobile card list is new, undesigned surface that this ticket does not
// attempt. They remain table-only, matching native's browse experience.
//
// Sort scope decision: the card feed always sorts by career fantasy points
// (mirrors native), toggled asc/desc locally. The desktop table's `sortBy`
// vocabulary (arbitrary stat columns) has no "fantasy points" entry to map
// this onto, so the card sort direction is UI-only state, not written to the
// URL — this keeps the versioned URL param schema (view/pageSize/minHomeRuns/
// etc.) exactly as the table left it, satisfying the "round trips in both
// presentations" AC by construction (the card feed only ever reads/writes its
// own `position`/`searchTerm` keys and never touches the others).

const PAGE_SIZE = 25;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

/** Read the current `position` URL param, defaulting to the "no filter" chip. */
function readPositionParam(searchParams: URLSearchParams): string {
  return sanitizeSearchParam(searchParams.get('position')) ?? 'ALL';
}

/** Read the current `searchTerm` URL param. */
function readSearchTermParam(searchParams: URLSearchParams): string {
  return sanitizeSearchParam(searchParams.get('searchTerm')) ?? '';
}

/**
 * Shared URL wiring for both sport card feeds: seeds `position`/`searchTerm`
 * from the current URL once, then mirrors committed changes back onto ONLY
 * those two keys — every other param the desktop table owns (view, pageSize,
 * cols, minHomeRuns, sortBy, playerId, v, ...) is left untouched, so switching
 * back to the table presentation still sees its filters intact.
 */
function useCardFeedUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [position, setPosition] = useState<string>(() =>
    readPositionParam(searchParams),
  );
  const [searchInput, setSearchInput] = useState<string>(() =>
    readSearchTermParam(searchParams),
  );

  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const appliedSearch =
    debouncedSearch.trim().length >= SEARCH_MIN_LENGTH
      ? debouncedSearch.trim()
      : '';

  // Mirror committed position/search into the URL, preserving every other
  // param. Guards on the live URL value so an unrelated param change (e.g. the
  // table writing `cols`) doesn't re-trigger a redundant history write here.
  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    const currentPosition = readPositionParam(current);
    const currentSearch = readSearchTermParam(current);
    if (currentPosition === position && currentSearch === appliedSearch) {
      return;
    }
    const next = new URLSearchParams(window.location.search);
    if (position === 'ALL') {
      next.delete('position');
    } else {
      next.set('position', position);
    }
    if (appliedSearch) {
      next.set('searchTerm', appliedSearch);
    } else {
      next.delete('searchTerm');
    }
    setSearchParams(next, { replace: true });
  }, [position, appliedSearch, setSearchParams]);

  const handleClearFilters = useCallback(() => {
    setPosition('ALL');
    setSearchInput('');
  }, []);

  return {
    position,
    setPosition,
    searchInput,
    setSearchInput,
    appliedSearch,
    handleClearFilters,
  };
}

export interface WebSportCardFeedProps {
  isPremium: boolean;
  showSportToggle: boolean;
  onSportChange: (sport: 'mlb' | 'nfl') => void;
  onPlayerPress: (id: string) => void;
  onCompare: () => void;
  /** Fired when a free viewer taps the feed's inline premium-teaser row. */
  onPremiumPress: () => void;
}

/** MLB card feed for narrow-viewport `/players/stats` (LS-9075). */
export function WebBaseballCardFeed({
  isPremium,
  showSportToggle,
  onSportChange,
  onPlayerPress,
  onCompare,
  onPremiumPress,
}: WebSportCardFeedProps) {
  const {
    position,
    setPosition,
    searchInput,
    setSearchInput,
    appliedSearch,
    handleClearFilters,
  } = useCardFeedUrlState();
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const queryKey = `${position}|${appliedSearch}|${sortDir}`;
  const { cursor, setCursor, isResetRef } = useResettableCursor(queryKey);

  const { data, loading, error, totalCount, hasNextPage, endCursor, refetch } =
    useCareerStatsWithNames({
      first: PAGE_SIZE,
      after: cursor,
      orderBy: 'totalScore',
      orderDirection: sortDir,
      position: positionFilterParam(position),
      searchTerm: appliedSearch || undefined,
    });

  const accumulated = useAccumulatedPages(data, loading, cursor, isResetRef);

  const rows: PlayerFeedRow[] = useMemo(
    () =>
      accumulated.map((player) => ({
        id: String(player.playerId),
        position: player.primaryPosition ?? 'UT',
        name: player.displayName,
        subStats: formatBaseballCardSubStats({
          homeRuns: player.homeRuns,
          rbi: player.rbi,
          battingAverage: player.battingAverage,
        }),
        fpts: Math.round(player.fantasyPoints).toLocaleString(),
      })),
    [accumulated],
  );

  const isInitialLoading =
    loading && accumulated.length === 0 && cursor === undefined;
  const isLoadingMore = loading && cursor !== undefined;

  const handleEndReached = useCallback(() => {
    if (hasNextPage && endCursor && !loading) {
      setCursor(endCursor);
    }
  }, [hasNextPage, endCursor, loading, setCursor]);

  return (
    <PlayersCardFeed
      sport="baseball"
      onSportChange={(sport) =>
        onSportChange(sport === 'baseball' ? 'mlb' : 'nfl')
      }
      showSportToggle={showSportToggle}
      positions={cardPositionsForSport('baseball')}
      position={position}
      onPositionChange={setPosition}
      searchValue={searchInput}
      onSearchChange={setSearchInput}
      sortDirection={sortDir}
      onToggleSort={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
      rows={rows}
      resultCount={totalCount}
      onPlayerPress={onPlayerPress}
      isLoading={isInitialLoading}
      isError={Boolean(error)}
      onRetry={() => void refetch()}
      onClearFilters={handleClearFilters}
      isPremium={isPremium}
      onPremiumPress={onPremiumPress}
      hasMore={hasNextPage}
      isLoadingMore={isLoadingMore}
      onEndReached={handleEndReached}
      onOverflowPress={onCompare}
      testID="players-stats-card-feed-mlb"
    />
  );
}

function footballFeedPositionParam(position: string): string[] | undefined {
  return position === 'ALL' ? undefined : [position];
}

/** NFL card feed for narrow-viewport `/players/stats` (LS-9075). */
export function WebFootballCardFeed({
  isPremium,
  showSportToggle,
  onSportChange,
  onPlayerPress,
  onCompare,
  onPremiumPress,
}: WebSportCardFeedProps) {
  const {
    position,
    setPosition,
    searchInput,
    setSearchInput,
    appliedSearch,
    handleClearFilters,
  } = useCardFeedUrlState();
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const queryKey = `${position}|${appliedSearch}|${sortDir}`;
  const { cursor, setCursor, isResetRef } = useResettableCursor(queryKey);

  const { data, loading, error, refetch } = useFootballPlayersQuery({
    variables: {
      positions: footballFeedPositionParam(position),
      search: appliedSearch || undefined,
      after: cursor,
      first: PAGE_SIZE,
      sortBy: 'fpts',
      sortDir,
    },
    notifyOnNetworkStatusChange: true,
  });

  const nodes = useMemo(() => data?.footballPlayers?.nodes ?? [], [data]);
  const accumulated = useAccumulatedPages(nodes, loading, cursor, isResetRef);

  const rows: PlayerFeedRow[] = useMemo(
    () =>
      accumulated.map((player) => ({
        id: String(player.id),
        position: player.isDst ? 'DST' : (player.position ?? 'FLEX'),
        name: [player.firstName, player.lastName].filter(Boolean).join(' '),
        subStats: formatFootballCardSubStats(player),
        fpts: Math.round(
          player.careerStats?.fantasyPoints ?? 0,
        ).toLocaleString(),
      })),
    [accumulated],
  );

  const pageInfo = data?.footballPlayers?.pageInfo;
  const hasMore = pageInfo?.hasNextPage ?? false;
  const isInitialLoading =
    loading && accumulated.length === 0 && cursor === undefined;
  const isLoadingMore = loading && cursor !== undefined;

  const handleEndReached = useCallback(() => {
    if (hasMore && pageInfo?.endCursor && !loading) {
      setCursor(pageInfo.endCursor);
    }
  }, [hasMore, pageInfo?.endCursor, loading, setCursor]);

  return (
    <PlayersCardFeed
      sport="football"
      onSportChange={(sport) =>
        onSportChange(sport === 'baseball' ? 'mlb' : 'nfl')
      }
      showSportToggle={showSportToggle}
      positions={cardPositionsForSport('football')}
      position={position}
      onPositionChange={setPosition}
      searchValue={searchInput}
      onSearchChange={setSearchInput}
      sortDirection={sortDir}
      onToggleSort={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
      rows={rows}
      // The footballPlayers connection exposes no totalCount, only pageInfo —
      // reflect the loaded count rather than fabricating a grand total
      // (mirrors native's FootballCardFeed).
      resultCount={accumulated.length}
      onPlayerPress={onPlayerPress}
      isLoading={isInitialLoading}
      isError={Boolean(error)}
      onRetry={() => void refetch()}
      onClearFilters={handleClearFilters}
      isPremium={isPremium}
      onPremiumPress={onPremiumPress}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onEndReached={handleEndReached}
      onOverflowPress={onCompare}
      testID="players-stats-card-feed-nfl"
    />
  );
}

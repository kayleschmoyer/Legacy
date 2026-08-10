import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFeatureIsOn } from '@growthbook/growthbook-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMedia, XStack, YStack } from 'tamagui';
import {
  cardPositionsForSport,
  FootballStatsPage,
  formatBaseballCardSubStats,
  formatFootballCardSubStats,
  type PlayerFeedRow,
  PlayersCardFeed,
  positionFilterParam,
  useAccumulatedPages,
  useCareerStatsWithNames,
  useDebouncedValue,
  useResettableCursor,
} from '@legacy-sports/shared-components';
import { useFootballPlayersQuery } from '@legacy-sports/graphql';
import { usePullToRefresh } from '../../../common/hooks/usePullToRefresh';
import {
  sanitizeSearchParam,
  toPlayerDetailIdParam,
} from '../../../common/utilities/RouteUtils';
import { useSubscription } from '../../../features/subscription/useSubscription';
import { SportSwitcherPill } from '../../../components/SportSwitcherPill';
// The stats-table presentation reuses `PlayerStatsScreen` wholesale — it
// already wraps `PlayerStatsPage` in `PremiumGate` and wires expo-router
// param hydration, share, and export (LS-9079: un-orphans this screen by
// making it the wide-viewport rendering of this very tab, rather than a
// standalone route only reachable via a deep link).
import PlayerStatsScreen from '../PlayerStats';

type Sport = 'baseball' | 'football';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

// ── expo-router param round-trip ────────────────────────────────────────────
// Mirrors the one-way-hydration pattern in `../PlayerStats.tsx`
// (buildStatsParams/parseStatsParams): parse once on mount to seed initial
// state, then mirror committed state back via `router.setParams` on change.
// That pair's own param shape (view/pageSize/team/minHomeRuns/...) doesn't
// cover this screen's fields (position/searchTerm/sortDir round-trip isn't
// implemented there at all — sortDir has no param handling in that module),
// so this is a parallel pair scoped to the card feed's state, reusing that
// module's exported `sanitizeSearchParam` for value sanitization (LS-8832).

interface CardFeedParamState {
  position: string;
  searchTerm: string;
  sortDir: SortDir;
}

function firstParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : null;
}

function parseCardFeedParams(
  params: Record<string, string | string[]>,
): CardFeedParamState {
  return {
    position: sanitizeSearchParam(firstParam(params.position)) ?? 'ALL',
    searchTerm: sanitizeSearchParam(firstParam(params.searchTerm)) ?? '',
    sortDir: firstParam(params.sortDir) === 'asc' ? 'asc' : 'desc',
  };
}

function buildCardFeedParams(
  state: CardFeedParamState,
): Record<string, string> {
  return {
    position: state.position,
    searchTerm: state.searchTerm,
    sortDir: state.sortDir,
  };
}

// ── Baseball data source ─────────────────────────────────────────────────
// Cursor-continuation pagination (`useResettableCursor`/`useAccumulatedPages`,
// shared by both sport feeds below) now lives in shared-components'
// `cardFeed/useCursorPagination` (LS-9073) so the web card presentation
// (`PlayersGrid`'s cards view) can reuse the identical pagination model
// instead of re-deriving it.

interface SportFeedProps {
  position: string;
  appliedSearch: string;
  sortDir: SortDir;
  topInset: number;
  isPremium: boolean;
  onPositionChange: (position: string) => void;
  onSearchChange: (value: string) => void;
  searchInput: string;
  onToggleSort: () => void;
  onPremiumPress: () => void;
  onOverflowPress: () => void;
  showSportToggle: boolean;
  sport: Sport;
  onSportChange: (sport: Sport) => void;
}

function BaseballCardFeed({
  position,
  appliedSearch,
  sortDir,
  topInset,
  isPremium,
  onPositionChange,
  onSearchChange,
  searchInput,
  onToggleSort,
  onPremiumPress,
  onOverflowPress,
  showSportToggle,
  sport,
  onSportChange,
}: SportFeedProps) {
  const router = useRouter();

  // The server sorts (orderBy: 'totalScore' per
  // COLUMN_TO_SORT_FIELD_MAP.fantasyPoints), so a sortDir change requires a
  // fresh query from page 1, same as a position/search change.
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

  const { refreshing, onRefresh } = usePullToRefresh([() => refetch()]);

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

  const handlePlayerPress = useCallback(
    (id: string) => {
      const playerId = toPlayerDetailIdParam(id);
      if (playerId === null) return;
      const row = rows.find((r) => r.id === id);
      router.push({
        pathname: '/PlayerDetail',
        params: { playerId, playerName: row?.name ?? '' },
      });
    },
    [router, rows],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && endCursor && !loading) {
      setCursor(endCursor);
    }
  }, [hasNextPage, endCursor, loading, setCursor]);

  const handleClearFilters = useCallback(() => {
    onPositionChange('ALL');
    onSearchChange('');
  }, [onPositionChange, onSearchChange]);

  return (
    <PlayersCardFeed
      sport={sport}
      onSportChange={onSportChange}
      showSportToggle={showSportToggle}
      topInset={topInset}
      positions={cardPositionsForSport('baseball')}
      position={position}
      onPositionChange={onPositionChange}
      searchValue={searchInput}
      onSearchChange={onSearchChange}
      sortDirection={sortDir}
      onToggleSort={onToggleSort}
      rows={rows}
      resultCount={totalCount}
      onPlayerPress={handlePlayerPress}
      isLoading={isInitialLoading}
      isError={Boolean(error)}
      onRetry={() => void refetch()}
      onClearFilters={handleClearFilters}
      isPremium={isPremium}
      onPremiumPress={onPremiumPress}
      hasMore={hasNextPage}
      isLoadingMore={isLoadingMore}
      onEndReached={handleEndReached}
      onOverflowPress={onOverflowPress}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}

// ── Football data source ─────────────────────────────────────────────────

function footballFeedPositionParam(position: string): string[] | undefined {
  return position === 'ALL' ? undefined : [position];
}

function FootballCardFeed({
  position,
  appliedSearch,
  sortDir,
  topInset,
  isPremium,
  onPositionChange,
  onSearchChange,
  searchInput,
  onToggleSort,
  onPremiumPress,
  onOverflowPress,
  showSportToggle,
  sport,
  onSportChange,
}: SportFeedProps) {
  const router = useRouter();

  // The server sorts (footballPlayers(sortBy: 'fpts') — LS-9071), so a
  // sortDir change requires a fresh query from page 1, same as a
  // position/search change (mirrors the baseball feed above).
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

  const { refreshing, onRefresh } = usePullToRefresh([() => refetch()]);

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
        trend: 'flat',
      })),
    [accumulated],
  );

  const pageInfo = data?.footballPlayers?.pageInfo;
  const hasMore = pageInfo?.hasNextPage ?? false;
  const isInitialLoading =
    loading && accumulated.length === 0 && cursor === undefined;
  const isLoadingMore = loading && cursor !== undefined;

  const handlePlayerPress = useCallback(
    (id: string) => {
      // Football has its own detail route (career stats shape differs from
      // baseball's `/PlayerDetail`, which reads batting/pitching-specific
      // fields) — preserve the existing, already-correct navigation target
      // rather than routing every sport through `/PlayerDetail`.
      router.push(`/football/players/${id}`);
    },
    [router],
  );

  const handleEndReached = useCallback(() => {
    if (hasMore && pageInfo?.endCursor && !loading) {
      setCursor(pageInfo.endCursor);
    }
  }, [hasMore, pageInfo?.endCursor, loading, setCursor]);

  const handleClearFilters = useCallback(() => {
    onPositionChange('ALL');
    onSearchChange('');
  }, [onPositionChange, onSearchChange]);

  return (
    <PlayersCardFeed
      sport={sport}
      onSportChange={onSportChange}
      showSportToggle={showSportToggle}
      topInset={topInset}
      positions={cardPositionsForSport('football')}
      position={position}
      onPositionChange={onPositionChange}
      searchValue={searchInput}
      onSearchChange={onSearchChange}
      sortDirection={sortDir}
      onToggleSort={onToggleSort}
      rows={rows}
      // The footballPlayers connection exposes no totalCount, only pageInfo —
      // reflect the loaded count rather than fabricating a grand total.
      resultCount={accumulated.length}
      onPlayerPress={handlePlayerPress}
      isLoading={isInitialLoading}
      isError={Boolean(error)}
      onRetry={() => void refetch()}
      onClearFilters={handleClearFilters}
      isPremium={isPremium}
      onPremiumPress={onPremiumPress}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onEndReached={handleEndReached}
      onOverflowPress={onOverflowPress}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}

// ── Wide-viewport (tablet) stats table ──────────────────────────────────────
// Football has no PlayerStats.tsx-style screen wrapper to reuse (that file is
// baseball-only), so this is a thin binding of the shared `FootballStatsPage`
// — same shape of adapter `PlayerStats.tsx` provides for baseball, scoped
// down to what the tablet table needs (LS-9079).

function FootballStatsTable({
  isPremium,
}: {
  isPremium: boolean;
}): React.JSX.Element {
  const router = useRouter();

  const handlePlayerDetails = useCallback(
    (playerId: number) => {
      // Mirrors FootballCardFeed's handlePlayerPress above — same detail
      // route regardless of which presentation the row was tapped from.
      router.push(`/football/players/${playerId}`);
    },
    [router],
  );

  return (
    <FootballStatsPage
      isPremium={isPremium}
      onPlayerDetails={handlePlayerDetails}
      showHeader
      showActions
    />
  );
}

// ── Screen ────────────────────────────────────────────────────────────────

export default function PlayersTab(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { top: topInset } = useSafeAreaInsets();
  const { isPremium } = useSubscription();
  const footballEnabled = useFeatureIsOn('football_enabled');

  const [sport, setSport] = useState<Sport>('baseball');
  // Incremented on every sport change so the football feed receives a new
  // key, guaranteeing a full remount and clearing its internal pagination
  // state whenever the user switches sports (mirrors the pre-redesign
  // `sportKey` remount contract for FootballPlayers).
  const [sportKey, setSportKey] = useState(0);

  const [position, setPosition] = useState<string>(
    () => parseCardFeedParams(params).position,
  );
  const [searchInput, setSearchInput] = useState<string>(
    () => parseCardFeedParams(params).searchTerm,
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => parseCardFeedParams(params).sortDir,
  );

  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const appliedSearch =
    debouncedSearch.trim().length >= SEARCH_MIN_LENGTH
      ? debouncedSearch.trim()
      : '';

  // Mirror committed state back into expo-router params (persists across
  // navigation/backgrounding, shareable) — persists the debounced value, not
  // every keystroke, to avoid a setParams call per character typed. `params`
  // (the raw route params) is deliberately not a dependency — only the lazy
  // initializers above read it, for one-way hydration on mount.
  useEffect(() => {
    router.setParams(
      buildCardFeedParams({ position, searchTerm: debouncedSearch, sortDir }),
    );
  }, [router, position, debouncedSearch, sortDir]);

  const handleSportChange = useCallback(
    (newSport: Sport) => {
      if (newSport === sport) return;
      setSport(newSport);
      setSportKey((k) => k + 1);
      setPosition('ALL');
      setSearchInput('');
    },
    [sport],
  );

  const handleToggleSort = useCallback(() => {
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
  }, []);

  const handleOverflowPress = useCallback(() => {
    router.push('/PlayerComparison');
  }, [router]);

  const handlePremiumPress = useCallback(() => {
    router.navigate('/subscription-settings');
  }, [router]);

  const showSportToggle = footballEnabled;
  const activeSport: Sport = footballEnabled ? sport : 'baseball';

  // Tablet+ widths get the stats table instead of the card feed; phone
  // widths keep the card feed (LS-9079 — the native mirror of LS-9074's
  // web-side viewport branching). Reads the `$sm` (≤800px) breakpoint
  // explicitly, matching the established convention (PlayersScreen.tsx,
  // apps/web's PlayerStatsPage.tsx/FootballPlayersPage.tsx).
  // Bind `useMedia` through an explicit signature (matches
  // PlayersScreen.tsx's LS-9074 pattern) so the call/result stay type-safe
  // under this project's typed ESLint rules.
  const readMedia = useMedia as () => { sm?: boolean };
  const isNarrowViewport = Boolean(readMedia().sm);

  const sharedProps: SportFeedProps = {
    position,
    appliedSearch,
    sortDir,
    topInset,
    isPremium,
    onPositionChange: setPosition,
    onSearchChange: setSearchInput,
    searchInput,
    onToggleSort: handleToggleSort,
    onPremiumPress: handlePremiumPress,
    onOverflowPress: handleOverflowPress,
    showSportToggle,
    sport: activeSport,
    onSportChange: handleSportChange,
  };

  if (!isNarrowViewport) {
    return (
      <YStack flex={1} backgroundColor="$background">
        {showSportToggle && (
          <XStack paddingHorizontal={12} paddingVertical={10} gap={8}>
            <SportSwitcherPill
              label="Baseball"
              active={activeSport === 'baseball'}
              onPress={() => handleSportChange('baseball')}
              testID="players-tab-sport-switch-baseball"
            />
            <SportSwitcherPill
              label="Football"
              active={activeSport === 'football'}
              onPress={() => handleSportChange('football')}
              testID="players-tab-sport-switch-football"
            />
          </XStack>
        )}
        {activeSport === 'football' ? (
          <FootballStatsTable isPremium={isPremium} />
        ) : (
          <PlayerStatsScreen />
        )}
      </YStack>
    );
  }

  if (activeSport === 'football') {
    return <FootballCardFeed key={sportKey} {...sharedProps} />;
  }
  return <BaseballCardFeed {...sharedProps} />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

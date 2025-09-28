/**
 * CareerStatsService - Server-side Career Statistics Management
 *
 * Provides type-safe, server-side operations for career batting statistics
 * including filtering, sorting, pagination, and search functionality.
 *
 * @author Legacy Sports Team
 * @since 2025-09-28
 */

import { gql, useLazyQuery, useQuery } from '@apollo/client';
import * as React from 'react';

// =============================================================================
// GraphQL Operations
// =============================================================================

/**
 * Primary GraphQL query for career batting statistics with server-side operations
 */
export const CAREER_BATTING_STATS_QUERY = gql`
  query CareerBattingStatsQuery(
    $limit: Int
    $offset: Int
    $orderBy: String
    $orderDirection: String
    $minGames: Int
    $minHomeRuns: Int
    $minRBI: Int
  ) {
    careerBattingStats(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      orderDirection: $orderDirection
      minGames: $minGames
      minHomeRuns: $minHomeRuns
      minRBI: $minRBI
    ) {
      playerId
      games
      plateAppearances
      atBats
      runs
      hits
      doubles
      triples
      homeRuns
      rbi
      stolenBases
      caughtStealing
      baseOnBalls
      strikeouts
      totalBases
      groundedIntoDoublePlays
      hitByPitch
      sacrificeHits
      intentionalBaseOnBalls
      battingAverage
      onBasePercentage
      sluggingPercentage
    }
  }
`;

/**
 * GraphQL query to fetch all players (for name lookup)
 * Note: We fetch a large batch and cache client-side since the API doesn't support ID filtering
 */
export const PLAYERS_QUERY = gql`
  query PlayersQuery($limit: Int, $offset: Int) {
    players(limit: $limit, offset: $offset) {
      id
      firstName
      lastName
      brefId
    }
  }
`;

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Player information from GraphQL API
 */
export interface Player {
  id: number;
  firstName: string | null;
  lastName: string | null;
  brefId: string | null;
}

/**
 * Raw career batting statistics from GraphQL API
 */
export interface CareerBattingStatsRaw {
  playerId: number | null;
  games: number | null;
  plateAppearances: number | null;
  atBats: number | null;
  runs: number | null;
  hits: number | null;
  doubles: number | null;
  triples: number | null;
  homeRuns: number | null;
  rbi: number | null;
  stolenBases: number | null;
  caughtStealing: number | null;
  baseOnBalls: number | null;
  strikeouts: number | null;
  totalBases: number | null;
  groundedIntoDoublePlays: number | null;
  hitByPitch: number | null;
  sacrificeHits: number | null;
  intentionalBaseOnBalls: number | null;
  battingAverage: number | null;
  onBasePercentage: number | null;
  sluggingPercentage: number | null;
}

/**
 * Enhanced player statistics with computed fields and display formatting
 */
export interface PlayerCareerStats {
  readonly id: string;
  readonly playerId: number;
  readonly displayName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly games: number;
  readonly plateAppearances: number;
  readonly atBats: number;
  readonly runs: number;
  readonly hits: number;
  readonly doubles: number;
  readonly triples: number;
  readonly homeRuns: number;
  readonly rbi: number;
  readonly stolenBases: number;
  readonly caughtStealing: number;
  readonly baseOnBalls: number;
  readonly strikeouts: number;
  readonly totalBases: number;
  readonly groundedIntoDoublePlays: number;
  readonly hitByPitch: number;
  readonly sacrificeHits: number;
  readonly intentionalBaseOnBalls: number;
  readonly battingAverage: number;
  readonly onBasePercentage: number;
  readonly sluggingPercentage: number;
  readonly ops: number; // On-base Plus Slugging
  readonly formattedBattingAverage: string;
  readonly formattedOnBasePercentage: string;
  readonly formattedSluggingPercentage: string;
  readonly formattedOPS: string;
}

/**
 * Server-side query parameters for career statistics
 */
export interface CareerStatsQueryParams {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: string;
  readonly orderDirection?: 'asc' | 'desc';
  readonly minGames?: number;
  readonly minHomeRuns?: number;
  readonly minRBI?: number;
}

/**
 * GraphQL query response structure
 */
export interface CareerStatsQueryResponse {
  readonly careerBattingStats: CareerBattingStatsRaw[];
}

/**
 * Service response with enhanced data and metadata
 */
export interface CareerStatsServiceResponse {
  readonly data: PlayerCareerStats[];
  readonly loading: boolean;
  readonly error?: Error | null;
  readonly totalCount: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly currentPage: number;
  readonly pageSize: number;
  readonly refetch: () => void;
}

// =============================================================================
// Data Transformation Utilities
// =============================================================================

/**
 * Safely formats a numeric value to a fixed decimal string
 *
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places (default: 3)
 * @param fallback - Fallback string for null/undefined values
 * @returns Formatted string representation
 */
function formatStatistic(
  value: number | null | undefined,
  decimals = 3,
  fallback = '--',
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return fallback;
  }
  return value.toFixed(decimals);
}

/**
 * Safely converts nullable number to non-null with fallback
 *
 * @param value - The nullable number value
 * @param fallback - Fallback value (default: 0)
 * @returns Non-null number
 */
function safeNumber(value: number | null | undefined, fallback = 0): number {
  return value ?? fallback;
}

/**
 * Transforms raw GraphQL career stats to enhanced player stats
 *
 * @param rawStats - Raw statistics from GraphQL API
 * @param player - Player information (optional, for name display)
 * @returns Enhanced player statistics with computed fields
 */
export function transformCareerStats(
  rawStats: CareerBattingStatsRaw,
  player?: Player,
): PlayerCareerStats {
  const playerId = safeNumber(rawStats.playerId);
  const games = safeNumber(rawStats.games);
  const plateAppearances = safeNumber(rawStats.plateAppearances);
  const atBats = safeNumber(rawStats.atBats);
  const runs = safeNumber(rawStats.runs);
  const hits = safeNumber(rawStats.hits);
  const doubles = safeNumber(rawStats.doubles);
  const triples = safeNumber(rawStats.triples);
  const homeRuns = safeNumber(rawStats.homeRuns);
  const rbi = safeNumber(rawStats.rbi);
  const stolenBases = safeNumber(rawStats.stolenBases);
  const caughtStealing = safeNumber(rawStats.caughtStealing);
  const baseOnBalls = safeNumber(rawStats.baseOnBalls);
  const strikeouts = safeNumber(rawStats.strikeouts);
  const totalBases = safeNumber(rawStats.totalBases);
  const groundedIntoDoublePlays = safeNumber(rawStats.groundedIntoDoublePlays);
  const hitByPitch = safeNumber(rawStats.hitByPitch);
  const sacrificeHits = safeNumber(rawStats.sacrificeHits);
  const intentionalBaseOnBalls = safeNumber(rawStats.intentionalBaseOnBalls);

  // Use server-computed values when available, with client-side fallbacks
  const battingAverage =
    rawStats.battingAverage ?? (atBats > 0 ? hits / atBats : 0);
  const onBasePercentage = rawStats.onBasePercentage ?? 0;
  const sluggingPercentage =
    rawStats.sluggingPercentage ?? (atBats > 0 ? totalBases / atBats : 0);

  // Compute OPS (On-base Plus Slugging)
  const ops = onBasePercentage + sluggingPercentage;

  // Generate display information
  const firstName = player?.firstName ?? '';
  const lastName = player?.lastName ?? '';
  const displayName =
    firstName && lastName ? `${firstName} ${lastName}` : `Player ${playerId}`;

  return {
    id: `player-${playerId}`,
    playerId,
    displayName,
    firstName,
    lastName,
    games,
    plateAppearances,
    atBats,
    runs,
    hits,
    doubles,
    triples,
    homeRuns,
    rbi,
    stolenBases,
    caughtStealing,
    baseOnBalls,
    strikeouts,
    totalBases,
    groundedIntoDoublePlays,
    hitByPitch,
    sacrificeHits,
    intentionalBaseOnBalls,
    battingAverage,
    onBasePercentage,
    sluggingPercentage,
    ops,
    formattedBattingAverage: formatStatistic(battingAverage),
    formattedOnBasePercentage: formatStatistic(onBasePercentage),
    formattedSluggingPercentage: formatStatistic(sluggingPercentage),
    formattedOPS: formatStatistic(ops),
  };
}

// =============================================================================
// React Hooks
// =============================================================================

/**
 * Primary hook for fetching career batting statistics with server-side operations
 *
 * Provides comprehensive data fetching with built-in error handling, loading states,
 * and pagination metadata. Supports all server-side operations including filtering,
 * sorting, and search.
 *
 * @param params - Query parameters for server-side operations
 * @returns Service response with data, loading state, and metadata
 *
 * @example
 * ```tsx
 * const { data, loading, error, hasNextPage, refetch } = useCareerStatsService({
 *   limit: 25,
 *   offset: 0,
 *   orderBy: 'homeRuns',
 *   orderDirection: 'desc',
 *   minGames: 100,
 *   searchTerm: 'ruth'
 * });
 * ```
 */
export function useCareerStatsService(
  params: CareerStatsQueryParams = {},
): CareerStatsServiceResponse {
  const {
    limit = 25,
    offset = 0,
    orderBy = 'homeRuns',
    orderDirection = 'desc',
    minGames = 10, // Default filter to exclude players with very few games
    ...otherParams
  } = params;

  const { data, loading, error, refetch } = useQuery<
    CareerStatsQueryResponse,
    CareerStatsQueryParams
  >(CAREER_BATTING_STATS_QUERY, {
    variables: {
      limit,
      offset,
      orderBy,
      orderDirection,
      minGames,
      ...otherParams,
    },
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'cache-and-network', // Balance performance with data freshness
  });

  // Transform raw data to enhanced format (without player names for now)
  const transformedData: PlayerCareerStats[] =
    data?.careerBattingStats?.map((rawStats) =>
      transformCareerStats(rawStats),
    ) ?? [];

  // Calculate pagination metadata
  const pageSize = limit;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalCount = transformedData.length;
  const hasNextPage = transformedData.length === pageSize; // Heuristic: if we got a full page, there might be more
  const hasPreviousPage = offset > 0;

  return {
    data: transformedData,
    loading,
    error: error || null,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    currentPage,
    pageSize,
    refetch: () => void refetch(),
  };
}

/**
 * Enhanced hook that fetches career stats with player names
 *
 * Combines career batting statistics with player information to show actual names
 * instead of just player IDs.
 *
 * @param params - Query parameters for filtering and pagination
 * @returns Career statistics with player names included
 */
export function useCareerStatsWithNames(params: CareerStatsQueryParams = {}) {
  const {
    limit = 25,
    offset = 0,
    orderBy = 'homeRuns',
    orderDirection = 'desc',
    minGames = 10,
    minHomeRuns,
    minRBI,
  } = params;

  // Fetch career statistics

  const {
    data: statsData,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useQuery<CareerStatsQueryResponse, CareerStatsQueryParams>(
    CAREER_BATTING_STATS_QUERY,
    {
      variables: {
        limit,
        offset,
        orderBy,
        orderDirection,
        minGames,
        minHomeRuns,
        minRBI,
      },
      errorPolicy: 'all',
      notifyOnNetworkStatusChange: true,
      fetchPolicy: 'cache-and-network', // Balance performance with data freshness
    },
  );

  // Fetch players for name lookup (fetch a large batch to cover most cases)
  const {
    data: playersData,
    loading: playersLoading,
    error: playersError,
  } = useQuery<{ players: Player[] }, { limit: number; offset: number }>(
    PLAYERS_QUERY,
    {
      variables: { limit: 5000, offset: 0 }, // Fetch a large batch for client-side lookup
      errorPolicy: 'all',
      fetchPolicy: 'cache-first', // Cache player names aggressively
    },
  );

  // Create a player lookup map
  const playersMap = React.useMemo(() => {
    if (!playersData?.players) return new Map<number, Player>();

    const map = new Map<number, Player>();
    for (const player of playersData.players) {
      map.set(player.id, player);
    }
    return map;
  }, [playersData]);

  // Transform data with player names
  const transformedData: PlayerCareerStats[] = React.useMemo(() => {
    if (!statsData?.careerBattingStats) return [];

    return statsData.careerBattingStats.map((rawStats) => {
      const playerId = rawStats.playerId;
      const player = playerId ? playersMap.get(playerId) : undefined;
      return transformCareerStats(rawStats, player);
    });
  }, [statsData, playersMap]);

  // Calculate pagination metadata
  const pageSize = limit;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalCount = transformedData.length;
  const hasNextPage = transformedData.length === pageSize;
  const hasPreviousPage = offset > 0;

  // Combined loading and error states
  const loading = statsLoading || playersLoading;
  const error = statsError || playersError || null;

  const refetch = React.useCallback(() => {
    return refetchStats();
  }, [refetchStats]);

  return {
    data: transformedData,
    loading,
    error,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    currentPage,
    pageSize,
    refetch,
  };
}

/**
 * Lazy query hook for on-demand career statistics fetching
 *
 * Useful for search-as-you-type functionality or conditional data loading.
 *
 * @returns Tuple with [executeQuery, queryResult]
 *
 * @example
 * ```tsx
 * const [searchPlayers, { data, loading }] = useCareerStatsLazyQuery();
 *
 * const handleSearch = (searchTerm: string) => {
 *   searchPlayers({
 *     variables: { searchTerm, limit: 10 }
 *   });
 * };
 * ```
 */
export function useCareerStatsLazyQuery() {
  return useLazyQuery<CareerStatsQueryResponse, CareerStatsQueryParams>(
    CAREER_BATTING_STATS_QUERY,
    {
      errorPolicy: 'all',
      notifyOnNetworkStatusChange: true,
    },
  );
}

// =============================================================================
// Predefined Configurations
// =============================================================================

/**
 * Available sorting options for career statistics
 */
export const CAREER_STATS_SORT_OPTIONS = [
  { label: 'Games (Most)', value: 'games', direction: 'desc' as const },
  { label: 'Home Runs (Most)', value: 'homeRuns', direction: 'desc' as const },
  { label: 'RBIs (Most)', value: 'rbi', direction: 'desc' as const },
  {
    label: 'Batting Average (Highest)',
    value: 'battingAverage',
    direction: 'desc' as const,
  },
  { label: 'Hits (Most)', value: 'hits', direction: 'desc' as const },
  {
    label: 'Stolen Bases (Most)',
    value: 'stolenBases',
    direction: 'desc' as const,
  },
  { label: 'OPS (Highest)', value: 'ops', direction: 'desc' as const },
  { label: 'Player ID', value: 'playerId', direction: 'asc' as const },
] as const;

/**
 * Default query parameters for career statistics
 */
export const DEFAULT_CAREER_STATS_PARAMS: Required<CareerStatsQueryParams> = {
  limit: 25,
  offset: 0,
  orderBy: 'homeRuns',
  orderDirection: 'desc',
  minGames: 10,
  minHomeRuns: 0,
  minRBI: 0,
} as const;

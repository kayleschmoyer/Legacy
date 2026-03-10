/**
 * CareerStatsService - Server-side Career Statistics Management
 *
 * Provides type-safe, server-side operations for career batting statistics
 * including filtering, sorting, pagination, and search functionality.
 *
 * @author Legacy Sports Team
 * @since 2025-09-28
 */

import * as React from 'react';
import { LOGGER } from '@legacy-sports/logging';
import {
  CareerBattingFragment,
  GetAllPlayers,
  GetCareerBattingStats,
  GetCareerBattingStatsQuery,
  GetCareerBattingStatsQueryVariables,
  PlayerFragment,
  useGetCareerBattingStatsLazyQuery,
  useGetCareerBattingStatsQuery,
} from '../../../api/db/graphql.generated';

// =============================================================================
// GraphQL Operations (Using Codegen Generated Queries)
// =============================================================================

// All GraphQL operations are now imported from the generated file:
// - GetCareerBattingStats: Primary query for career batting statistics
// - GetAllPlayers: Query to fetch players with positions
// - Associated hooks: useGetCareerBattingStatsQuery, useGetCareerBattingStatsLazyQuery, etc.

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Player information from GraphQL API (using generated types)
 * Note: Now uses the PlayerFragment from generated code
 */
export type CareerStatsPlayer = PlayerFragment;

/**
 * Raw career batting statistics from GraphQL (using generated CareerBattingFragment)
 * Note: Fields use abbreviated names (g, pa, ab, etc.) and are string representations of BigInt
 */
export type CareerBattingStatsRaw = CareerBattingFragment;

/**
 * Raw career fielding statistics from GraphQL (matches database structure)
 */
export interface CareerFieldingStatsRaw {
  playerId: number;
  games: number;
  gamesStarted: number;
  fieldingPercentage: number | null;
  positionsPlayed: string | null; // JSON string of position data
}

/**
 * Position data from the database positionsPlayed field
 */
export interface PositionData {
  readonly games: number;
  readonly gamesStarted?: number;
  readonly position?: string;
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
  readonly primaryPosition?: string;
  // Batting statistics
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
  /** Approximate offensive WAR (lWAR) — computed server-side from counting stats */
  readonly offensiveWAR: number | null;
  // Fielding statistics
  readonly fieldingGames?: number;
  readonly fieldingPercentage?: number;
  readonly positionsPlayed?: Record<string, PositionData>;
  readonly formattedPositions?: string;
}

/**
 * Server-side query parameters for career statistics (using generated types)
 */
export type CareerStatsQueryParams = GetCareerBattingStatsQueryVariables;

/**
 * GraphQL connection response structure (using generated types)
 */
export type CareerStatsQueryResponse = GetCareerBattingStatsQuery;

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
 * Safely extracts a non-null number from potentially null/undefined values
 *
 * @param value - The nullable number value
 * @param fallback - Fallback value (default: 0)
 * @returns Non-null number
 */
function safeNumber(value: number | null | undefined, fallback = 0): number {
  return value ?? fallback;
}

/**
 * Parse positions played JSON string into a structured object
 *
 * @param positionsPlayedJson - JSON string of position data from database
 * @returns Parsed positions object or undefined if parsing fails
 */
function parsePositionsPlayed(
  positionsPlayedJson: string | null | undefined,
): Record<string, PositionData> | undefined {
  if (!positionsPlayedJson) return undefined;

  try {
    const parsed = JSON.parse(positionsPlayedJson) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, PositionData>)
      : undefined;
  } catch (error) {
    LOGGER.warn('Failed to parse positions data:', String(error));
    return undefined;
  }
}

/**
 * Format positions played data into a readable string sorted by games played
 *
 * @param positionsPlayedJson - JSON string of position data from database
 * @returns Formatted string like "1B, OF, DH" (sorted by most games played)
 */
function formatPositionsPlayed(
  positionsPlayedJson: string | null | undefined,
): string {
  if (!positionsPlayedJson) return '';

  try {
    const positionsData: Record<string, PositionData> = JSON.parse(
      positionsPlayedJson,
    ) as Record<string, PositionData>;

    // Use entries to preserve position code (key), sort by games played descending
    const sortedPositions = Object.entries(positionsData)
      .sort(([, a], [, b]) => b.games - a.games)
      .map(([positionCode, data]) => data.position ?? positionCode);

    return sortedPositions.join(', ');
  } catch (error) {
    LOGGER.warn('Failed to parse positions played data:', String(error));
    return '';
  }
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
  player?: CareerStatsPlayer,
): PlayerCareerStats {
  const playerId = safeNumber(rawStats.playerId);
  // Convert field names to numbers (using full field names from new schema)
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

  // Use calculated statistics from schema when available, or calculate if needed
  const battingAverage =
    rawStats.battingAverage ?? (atBats > 0 ? hits / atBats : 0);
  const onBasePercentage =
    rawStats.onBasePercentage ??
    (plateAppearances > 0
      ? (hits + baseOnBalls + hitByPitch) / plateAppearances
      : 0);
  const sluggingPercentage =
    rawStats.sluggingPercentage ?? (atBats > 0 ? totalBases / atBats : 0);

  // Compute OPS (On-base Plus Slugging)
  const ops = onBasePercentage + sluggingPercentage;

  // Generate display information using player data from GraphQL response or fallback
  const playerData = rawStats.player ?? player; // CareerBattingFragment now includes player relation
  const firstName = playerData?.firstName ?? '';
  const lastName = playerData?.lastName ?? '';
  const displayName = `${firstName} ${lastName}`.trim() || `Player ${playerId}`;

  return {
    id: `player-${playerId}`,
    playerId,
    displayName,
    firstName,
    lastName,
    primaryPosition: rawStats.primaryPosition ?? undefined,
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
    offensiveWAR: rawStats.offensiveWAR ?? null,
    // Parse positions played from the new field
    positionsPlayed: parsePositionsPlayed(rawStats.positionsPlayed),
    formattedPositions: formatPositionsPlayed(rawStats.positionsPlayed),
  };
}

/**
 * Transforms raw GraphQL career stats with fielding data to enhanced player stats
 *
 * @param battingStats - Raw batting statistics from GraphQL API
 * @param fieldingStats - Raw fielding statistics from GraphQL API (optional)
 * @param player - Player information (optional, for name display)
 * @returns Enhanced player statistics with computed fields and fielding data
 */
export function transformCareerStatsWithFielding(
  battingStats: CareerBattingStatsRaw,
  fieldingStats?: CareerFieldingStatsRaw,
  player?: CareerStatsPlayer,
): PlayerCareerStats {
  // Start with the existing batting transformation
  const baseStats = transformCareerStats(battingStats, player);

  // Add fielding data if available
  if (fieldingStats) {
    const fieldingGames = safeNumber(fieldingStats.games);
    const fieldingPercentage = fieldingStats.fieldingPercentage ?? undefined;
    const positionsPlayedJson = fieldingStats.positionsPlayed;

    // Parse positions data
    let positionsPlayed: Record<string, PositionData> | undefined;
    try {
      positionsPlayed = positionsPlayedJson
        ? (JSON.parse(positionsPlayedJson) as Record<string, PositionData>)
        : undefined;
    } catch (error) {
      LOGGER.warn(
        'Failed to parse positions data for player',
        battingStats.playerId,
        String(error),
      );
    }

    return {
      ...baseStats,
      fieldingGames,
      fieldingPercentage,
      positionsPlayed,
      formattedPositions: formatPositionsPlayed(positionsPlayedJson),
    };
  }

  return baseStats;
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
  // Use generated hook directly
  const { data, loading, error, refetch } = useGetCareerBattingStatsQuery({
    variables: params,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'cache-and-network', // Balance performance with data freshness
  });

  // Transform raw data from connection format (using edges instead of nodes)
  const transformedData: PlayerCareerStats[] =
    data?.careerBattingStats?.edges
      ?.map((edge) =>
        edge
          ? transformCareerStats(edge.node || ({} as CareerBattingFragment))
          : null,
      )
      .filter((item): item is PlayerCareerStats => item !== null) ?? [];

  // Extract pagination metadata from connection
  const totalCount = data?.careerBattingStats?.totalCount ?? 0;
  const pageSize = params.first ?? 25;
  const hasNextPage = data?.careerBattingStats?.pageInfo?.hasNextPage ?? false;
  const hasPreviousPage =
    data?.careerBattingStats?.pageInfo?.hasPreviousPage ?? false;

  // Calculate current page from cursor (simplified approximation)
  const currentPage = 1; // Since we're using cursor-based pagination, page concept is simplified

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
  // Use generated hook directly
  const {
    data: statsData,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useGetCareerBattingStatsQuery({
    variables: params,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'network-only', // Always fetch fresh data when sorting/filtering changes
  });

  // Transform data (simplified - just batting stats for now)
  const transformedData: PlayerCareerStats[] = React.useMemo(() => {
    if (!statsData?.careerBattingStats?.edges) return [];

    return statsData.careerBattingStats.edges
      .map((edge) => {
        return edge
          ? transformCareerStats(edge.node || ({} as CareerBattingFragment))
          : null;
      })
      .filter((item): item is PlayerCareerStats => item !== null);
  }, [statsData]);

  // Extract pagination metadata from connection
  const totalCount = statsData?.careerBattingStats?.totalCount ?? 0;
  const pageSize = params.first ?? 25;
  const hasNextPage =
    statsData?.careerBattingStats?.pageInfo?.hasNextPage ?? false;
  const hasPreviousPage =
    statsData?.careerBattingStats?.pageInfo?.hasPreviousPage ?? false;
  const currentPage = 1; // Simplified for cursor-based pagination

  // Combined loading and error states
  const loading = statsLoading;
  const error = statsError || null;

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
  return useGetCareerBattingStatsLazyQuery({
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });
}

// =============================================================================
// Predefined Configurations
// =============================================================================

/**
 * Available sorting options for career statistics (using string values)
 */
export const CAREER_STATS_SORT_OPTIONS = [
  { label: 'Games (Most)', value: 'games', direction: 'desc' },
  { label: 'Home Runs (Most)', value: 'homeRuns', direction: 'desc' },
  { label: 'RBIs (Most)', value: 'rbi', direction: 'desc' },
  { label: 'Hits (Most)', value: 'hits', direction: 'desc' },
  { label: 'Stolen Bases (Most)', value: 'stolenBases', direction: 'desc' },
  { label: 'At Bats (Most)', value: 'atBats', direction: 'desc' },
  { label: 'Runs (Most)', value: 'runs', direction: 'desc' },
  {
    label: 'Batting Average (Highest)',
    value: 'battingAverage',
    direction: 'desc',
  },
] as const;

/**
 * Default query parameters for career statistics (using generated types)
 */
export const DEFAULT_CAREER_STATS_PARAMS: CareerStatsQueryParams = {
  first: 25,
  orderBy: 'homeRuns',
  orderDirection: 'desc',
  minGames: 10,
  minHomeRuns: 0,
  minRBI: 0,
  minBattingAvg: 0.0,
  searchTerm: '',
} as const;

// =============================================================================
// GraphQL Document Exports (for testing and direct usage)
// =============================================================================

/**
 * Career batting statistics GraphQL query document
 */
export const CAREER_BATTING_STATS_QUERY = GetCareerBattingStats;

/**
 * Players query document
 */
export const PLAYERS_QUERY = GetAllPlayers;

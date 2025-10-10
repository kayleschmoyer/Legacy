// Career Statistics API for Players Table
// Uses the career statistics queries from the GraphQL schema

import {
  useGetCareerBattingStatsQuery,
  GetCareerBattingStatsQuery,
  GetCareerBattingStatsQueryVariables,
  CareerBattingFragment,
} from '../../api/db/graphql.generated';

// Use generated types instead of manual interfaces
export type CareerBattingStats = CareerBattingFragment;
export type GetCareerBattingStatsResponse = GetCareerBattingStatsQuery;
export type GetCareerBattingStatsVariables = GetCareerBattingStatsQueryVariables;

// Enhanced player interface that combines basic player info with career stats
export interface PlayerWithCareerStats {
  playerId: number | null | undefined;
  displayName: string;

  // Career Batting Statistics
  games: number | null | undefined;
  plateAppearances: number | null | undefined;
  atBats: number | null | undefined;
  runs: number | null | undefined;
  hits: number | null | undefined;
  doubles: number | null | undefined;
  triples: number | null | undefined;
  homeRuns: number | null | undefined;
  rbi: number | null | undefined;
  stolenBases: number | null | undefined;
  caughtStealing: number | null | undefined;
  baseOnBalls: number | null | undefined;
  strikeouts: number | null | undefined;
  totalBases: number | null | undefined;

  // Computed Statistics
  battingAverage: number | null | undefined;
  onBasePercentage: number | null | undefined;
  sluggingPercentage: number | null | undefined;
}

// Hook for getting career batting statistics
export function useCareerBattingStatsQuery(
  variables?: GetCareerBattingStatsVariables,
) {
  const { data, loading, error, refetch, fetchMore } = useGetCareerBattingStatsQuery({
    variables,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  });

  // Transform GraphQL data to enhanced player format with career stats
  // Note: Using abbreviated field names from generated schema (g, pa, ab, etc.)
  const transformedData: PlayerWithCareerStats[] =
    data?.careerBattings?.nodes?.filter(stats => stats !== null).map((stats) => ({
      playerId: stats.playerId,
      displayName: `Player ${stats.playerId || 'Unknown'}`, // We'll need to join with player names later

      // Career Statistics (using abbreviated field names from schema)
      games: parseInt(stats.g || '0', 10),
      plateAppearances: parseInt(stats.pa || '0', 10),
      atBats: parseInt(stats.ab || '0', 10),
      runs: parseInt(stats.r || '0', 10),
      hits: parseInt(stats.h || '0', 10),
      doubles: parseInt(stats.doubles || '0', 10),
      triples: parseInt(stats.triples || '0', 10),
      homeRuns: parseInt(stats.hr || '0', 10),
      rbi: parseInt(stats.rbi || '0', 10),
      stolenBases: parseInt(stats.sb || '0', 10),
      caughtStealing: parseInt(stats.cs || '0', 10),
      baseOnBalls: parseInt(stats.bb || '0', 10),
      strikeouts: parseInt(stats.so || '0', 10),
      totalBases: parseInt(stats.tb || '0', 10),

      // Computed Statistics (not in schema - need to calculate)
      battingAverage: null,
      onBasePercentage: null,
      sluggingPercentage: null,
    })) || [];

  return {
    data: transformedData,
    loading,
    error,
    refetch,
    fetchMore,
    totalCount: transformedData.length,
  };
}

// Sort options for career statistics
export interface CareerStatsSortOption {
  label: string;
  orderBy: string;
  orderDirection: 'asc' | 'desc';
}

export const CAREER_STATS_SORT_OPTIONS: CareerStatsSortOption[] = [
  { label: 'Games Played (Most)', orderBy: 'games', orderDirection: 'desc' },
  { label: 'Games Played (Least)', orderBy: 'games', orderDirection: 'asc' },
  { label: 'Home Runs (Most)', orderBy: 'homeRuns', orderDirection: 'desc' },
  { label: 'Home Runs (Least)', orderBy: 'homeRuns', orderDirection: 'asc' },
  { label: 'RBIs (Most)', orderBy: 'rbi', orderDirection: 'desc' },
  { label: 'RBIs (Least)', orderBy: 'rbi', orderDirection: 'asc' },
  {
    label: 'Batting Avg (Highest)',
    orderBy: 'battingAverage',
    orderDirection: 'desc',
  },
  {
    label: 'Batting Avg (Lowest)',
    orderBy: 'battingAverage',
    orderDirection: 'asc',
  },
  { label: 'Hits (Most)', orderBy: 'hits', orderDirection: 'desc' },
  { label: 'Hits (Least)', orderBy: 'hits', orderDirection: 'asc' },
  {
    label: 'Stolen Bases (Most)',
    orderBy: 'stolenBases',
    orderDirection: 'desc',
  },
  {
    label: 'Stolen Bases (Least)',
    orderBy: 'stolenBases',
    orderDirection: 'asc',
  },
];

// Column definitions for displaying career statistics
export interface CareerStatsColumn {
  key: keyof PlayerWithCareerStats;
  label: string;
  sortable: boolean;
  width?: number;
  format?: (value: number | null | undefined) => string;
}

export const CAREER_BATTING_COLUMNS: CareerStatsColumn[] = [
  { key: 'displayName', label: 'Player', sortable: false, width: 200 },
  { key: 'games', label: 'G', sortable: true, width: 60 },
  { key: 'atBats', label: 'AB', sortable: true, width: 60 },
  { key: 'hits', label: 'H', sortable: true, width: 60 },
  { key: 'homeRuns', label: 'HR', sortable: true, width: 60 },
  { key: 'rbi', label: 'RBI', sortable: true, width: 60 },
  { key: 'stolenBases', label: 'SB', sortable: true, width: 60 },
  {
    key: 'battingAverage',
    label: 'AVG',
    sortable: true,
    width: 80,
    format: (value) => value?.toFixed(3) || '--',
  },
  {
    key: 'onBasePercentage',
    label: 'OBP',
    sortable: true,
    width: 80,
    format: (value) => value?.toFixed(3) || '--',
  },
  {
    key: 'sluggingPercentage',
    label: 'SLG',
    sortable: true,
    width: 80,
    format: (value) => value?.toFixed(3) || '--',
  },
];

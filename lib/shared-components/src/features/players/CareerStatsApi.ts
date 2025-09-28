// Career Statistics API for Players Table
// Uses the career statistics queries from the GraphQL schema

import {
  type CareerBattingFragment,
  CareerBattingFragmentDoc,
  GetCareerBattingStats,
  type GetCareerBattingStatsLazyQueryHookResult,
  type GetCareerBattingStatsQuery,
  type GetCareerBattingStatsQueryHookResult,
  type GetCareerBattingStatsQueryVariables,
  useGetCareerBattingStatsLazyQuery,
  useGetCareerBattingStatsQuery,
} from '../../api/db/graphql.generated';

// Re-export for convenience
export {
  type CareerBattingFragment,
  type GetCareerBattingStatsQuery,
  type GetCareerBattingStatsQueryVariables,
  type GetCareerBattingStatsQueryHookResult,
  type GetCareerBattingStatsLazyQueryHookResult,
  CareerBattingFragmentDoc,
  GetCareerBattingStats,
  useGetCareerBattingStatsQuery,
  useGetCareerBattingStatsLazyQuery,
};

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
export function useCareerBattingStatsQuery(variables?: {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: string;
  minGames?: number;
  minHomeRuns?: number;
  minRBI?: number;
}) {
  const { data, loading, error, refetch, fetchMore } =
    useGetCareerBattingStatsQuery({
      variables,
      errorPolicy: 'all',
      notifyOnNetworkStatusChange: true,
    });

  // Transform GraphQL data to enhanced player format with career stats
  const transformedData: PlayerWithCareerStats[] =
    data?.careerBattingStats?.map((stats: CareerBattingFragment) => ({
      playerId: stats.playerId,
      displayName: `Player ${stats.playerId || 'Unknown'}`, // We'll need to join with player names later

      // Career Statistics
      games: stats.games,
      plateAppearances: stats.plateAppearances,
      atBats: stats.atBats,
      runs: stats.runs,
      hits: stats.hits,
      doubles: stats.doubles,
      triples: stats.triples,
      homeRuns: stats.homeRuns,
      rbi: stats.rbi,
      stolenBases: stats.stolenBases,
      caughtStealing: stats.caughtStealing,
      baseOnBalls: stats.baseOnBalls,
      strikeouts: stats.strikeouts,
      totalBases: stats.totalBases,

      // Computed Statistics
      battingAverage: stats.battingAverage,
      onBasePercentage: stats.onBasePercentage,
      sluggingPercentage: stats.sluggingPercentage,
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

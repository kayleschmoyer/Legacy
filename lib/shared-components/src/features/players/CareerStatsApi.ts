// Career Statistics API for Players Table
// Uses the career statistics queries from the GraphQL schema

import {
  CareerBattingFragment,
  GetCareerBattingStatsQuery,
  GetCareerBattingStatsQueryVariables,
  useGetCareerBattingStatsQuery,
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
  const rawStats = data?.careerBattingStats?.edges?.map(edge => edge?.node);
  if (!Array.isArray(rawStats)) {
    return { data: [], loading, error, refetch };
  }

  const transformedData: PlayerWithCareerStats[] =
    rawStats.filter(stats => stats !== null && stats !== undefined).map((stats) => {
      if (!stats) return null;
      
      return {
        playerId: stats.playerId,
        displayName: `Player ${stats.playerId || 'Unknown'}`, // We'll need to join with player names later

        // Career Statistics (using full field names from schema)
        games: stats.games || 0,
        plateAppearances: stats.plateAppearances || 0,
        atBats: stats.atBats || 0,
        runs: stats.runs || 0,
        hits: stats.hits || 0,
        doubles: stats.doubles || 0,
        triples: stats.triples || 0,
        homeRuns: stats.homeRuns || 0,
        rbi: stats.rbi || 0,
        stolenBases: stats.stolenBases || 0,
        caughtStealing: stats.caughtStealing || 0,
        baseOnBalls: stats.baseOnBalls || 0,
        strikeouts: stats.strikeouts || 0,
        totalBases: stats.totalBases || 0,

        // Computed Statistics (not in schema - need to calculate)
        battingAverage: null,
        onBasePercentage: null,
        sluggingPercentage: null,
      };
    }).filter(Boolean) as PlayerWithCareerStats[];

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

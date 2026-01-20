import {
  type MatchupStatus,
  useGetCurrentMatchupForLeagueQuery,
  useGetMatchupByIdQuery,
  useGetMatchupHistoryQuery,
  useGetMatchupsByWeekQuery,
  useGetMatchupsForLeagueQuery,
} from '../api/db/graphql.generated';

/**
 * Hook for fetching a single matchup by ID
 */
export function useMatchupById(matchupId: number | null | undefined) {
  const { data, loading, error, refetch } = useGetMatchupByIdQuery({
    variables: { id: matchupId ?? 0 },
    skip: !matchupId,
  });

  return {
    matchup: data?.getMatchupById ?? null,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching all matchups for a league, optionally filtered by week
 */
export function useMatchupsForLeague(
  leagueId: number | null | undefined,
  weekNumber?: number,
) {
  const { data, loading, error, refetch } = useGetMatchupsForLeagueQuery({
    variables: {
      leagueId: leagueId ?? 0,
      weekNumber: weekNumber ?? null,
    },
    skip: !leagueId,
  });

  return {
    matchups: data?.getMatchupsForLeague ?? [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching the current matchup for a league
 */
export function useCurrentMatchup(leagueId: number | null | undefined) {
  const { data, loading, error, refetch } = useGetCurrentMatchupForLeagueQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });

  return {
    matchup: data?.getCurrentMatchupForLeague ?? null,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching matchups for a specific week
 */
export function useMatchupsByWeek(
  leagueId: number | null | undefined,
  weekNumber: number | null | undefined,
) {
  const { data, loading, error, refetch } = useGetMatchupsByWeekQuery({
    variables: {
      leagueId: leagueId ?? 0,
      weekNumber: weekNumber ?? 1,
    },
    skip: !leagueId || !weekNumber,
  });

  return {
    matchups: data?.getMatchupsByWeek ?? [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching matchup history with optional filters
 */
export function useMatchupHistory(
  leagueId: number | null | undefined,
  options?: {
    season?: number;
    teamId?: number;
    status?: MatchupStatus;
    limit?: number;
  },
) {
  const { data, loading, error, refetch } = useGetMatchupHistoryQuery({
    variables: {
      leagueId: leagueId ?? 0,
      season: options?.season ?? null,
      teamId: options?.teamId ?? null,
      status: options?.status ?? null,
      limit: options?.limit ?? null,
    },
    skip: !leagueId,
  });

  return {
    matchups: data?.getMatchupHistory ?? [],
    loading,
    error,
    refetch,
  };
}

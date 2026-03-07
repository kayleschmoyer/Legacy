import {
  useGetCurrentWeekForLeagueQuery,
  useGetMatchupByIdQuery,
  useGetMatchupsByWeekQuery,
  useGetMatchupsForLeagueQuery,
} from '../../../api/db/graphql.generated';

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
 * Hook for fetching the current week number for a league
 */
export function useCurrentWeek(leagueId: number | null | undefined) {
  const { data, loading, error, refetch } = useGetCurrentWeekForLeagueQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });

  return {
    currentWeek: data?.getCurrentWeekForLeague ?? null,
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
 * Combined hook that provides easy access to all matchup queries
 */
export function useMatchup(leagueId: number | null | undefined) {
  const current = useCurrentWeek(leagueId);
  const all = useMatchupsForLeague(leagueId);

  return {
    currentWeek: current.currentWeek,
    allMatchups: all.matchups,
    loading: current.loading || all.loading,
    error: current.error || all.error,
    refetch: () => {
      void current.refetch();
      void all.refetch();
    },
  };
}

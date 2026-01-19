import {
  useGetCurrentMatchupForLeagueQuery,
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
  weekNumber?: number
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
  weekNumber: number | null | undefined
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
  const current = useCurrentMatchup(leagueId);
  const all = useMatchupsForLeague(leagueId);

  return {
    currentMatchup: current.matchup,
    allMatchups: all.matchups,
    loading: current.loading || all.loading,
    error: current.error || all.error,
    refetch: () => {
      void current.refetch();
      void all.refetch();
    },
  };
}

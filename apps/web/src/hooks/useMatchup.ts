import {
  useGetCurrentWeekForLeagueQuery,
  useGetMatchupByIdQuery,
  useGetMatchupRosterQuery,
  useGetMatchupsByWeekQuery,
  useGetMatchupsForLeagueQuery,
  useSwapMatchupPlayerPositionsMutation,
  useUpdateMatchupPlayerPositionMutation,
} from '@legacy-sports/graphql';

/**
 * Hook for fetching a single matchup by ID
 */
export function useMatchupById(matchupId: number | null | undefined) {
  const { data, previousData, loading, error, refetch } =
    useGetMatchupByIdQuery({
      variables: { id: matchupId ?? 0 },
      skip: !matchupId,
    });

  // Only fall back to previousData when a valid matchupId is present (i.e.,
  // the query is not skipped). Without this guard, previousData would surface
  // stale matchup content whenever the caller clears matchupId (skip: true).
  const resolvedData = matchupId ? (data ?? previousData) : data;

  return {
    matchup: resolvedData?.getMatchupById ?? null,
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
 * Hook for fetching the roster of a specific team in a specific matchup.
 * Useful for viewing historical lineups from previous weeks.
 */
export function useMatchupRoster(
  matchupId: number | null | undefined,
  teamId: number | null | undefined,
) {
  const { data, loading, error, refetch } = useGetMatchupRosterQuery({
    variables: {
      matchupId: matchupId ?? 0,
      teamId: teamId ?? 0,
    },
    skip: !matchupId || !teamId,
  });

  return {
    roster: data?.getMatchupRoster ?? [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for updating a matchup player's position.
 * Only works when the matchup status is 'scheduled'.
 */
export function useUpdateMatchupPlayerPosition() {
  const [mutate, { loading, error }] = useUpdateMatchupPlayerPositionMutation();

  const updatePosition = async (
    matchupPlayerId: number,
    positionId: number | null,
  ) => {
    const result = await mutate({
      variables: {
        matchupPlayerId,
        positionId: positionId ?? null,
      },
    });
    return result.data?.updateMatchupPlayerPosition ?? null;
  };

  return { updatePosition, loading, error };
}

/**
 * Hook for atomically swapping two matchup players' positions.
 * Only works when the matchup status is 'scheduled'.
 */
export function useSwapMatchupPlayerPositions() {
  const [mutate, { loading, error }] = useSwapMatchupPlayerPositionsMutation();

  const swapPositions = async (
    matchupPlayerIdA: number,
    positionIdA: number | null,
    matchupPlayerIdB: number,
    positionIdB: number | null,
  ) => {
    const result = await mutate({
      variables: {
        matchupPlayerIdA,
        positionIdA: positionIdA ?? null,
        matchupPlayerIdB,
        positionIdB: positionIdB ?? null,
      },
    });
    return result.data?.swapMatchupPlayerPositions ?? null;
  };

  return { swapPositions, loading, error };
}

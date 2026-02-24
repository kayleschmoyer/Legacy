import {
  type MatchupStatus,
  useGetCurrentMatchupForLeagueQuery,
  useGetMatchupByIdQuery,
  useGetMatchupHistoryQuery,
  useGetMatchupRosterQuery,
  useGetMatchupsByWeekQuery,
  useGetMatchupsForLeagueQuery,
  useGetTeamMatchupHistoryQuery,
  useSwapMatchupPlayerPositionsMutation,
  useUpdateMatchupPlayerPositionMutation,
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
 * Hook for fetching all matchups for a team, ordered by week (newest first).
 * Allows users to browse their lineup history across weeks.
 */
export function useTeamMatchupHistory(
  leagueId: number | null | undefined,
  teamId: number | null | undefined,
  limit?: number,
) {
  const { data, loading, error, refetch } = useGetTeamMatchupHistoryQuery({
    variables: {
      leagueId: leagueId ?? 0,
      teamId: teamId ?? 0,
      limit: limit ?? null,
    },
    skip: !leagueId || !teamId,
  });

  return {
    matchups: data?.getTeamMatchupHistory ?? [],
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

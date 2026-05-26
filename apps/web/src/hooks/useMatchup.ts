import { useEffect, useRef } from 'react';
import {
  type MatchupStatus,
  useGetCurrentWeekForLeagueQuery,
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
 * Hook for fetching matchup history with optional filters.
 * Automatically refetches when the league's current week changes so callers
 * never see stale history after a week rollover.
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
  const { currentWeek } = useCurrentWeek(leagueId);
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

  // Refetch when the current week advances so stale history is never shown
  // across a week rollover. The ref sentinel (undefined) prevents a refetch on
  // the initial render before the week query has resolved.
  const prevWeekRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (
      prevWeekRef.current !== undefined &&
      prevWeekRef.current !== currentWeek
    ) {
      void refetch();
    }
    prevWeekRef.current = currentWeek;
  }, [currentWeek, refetch]);

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

import { useEffect, useMemo, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  GetTeamMembers,
  type GetTeamMembersQuery,
  type GetTeamMembersQueryVariables,
  type Sport,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';

/**
 * Returns the set of player IDs rostered on the current user's team(s) of the
 * given sport. Used by the availability filter on the Players List pages to
 * distinguish free agents from rostered players.
 *
 * By default aggregates across all of the viewer's leagues of `sport` — only
 * meaningful when the viewer belongs to exactly one, since a player can be a
 * free agent in one league and rostered in another. Pass `leagueId` to scope
 * the result to a single league instead (LS-9158) — required for a correct
 * result when the viewer has 2+ leagues of the sport.
 *
 * Only fetches when `skip` is false. Uses cache-first so rapid filter toggles
 * don't re-hit the network.
 */
export function useLeagueRosteredPlayerIds(
  sport: Sport,
  skip = false,
  leagueId: number | null = null,
): { playerIds: Set<number>; loading: boolean } {
  const client = useApolloClient();
  const [playerIds, setPlayerIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(false);

  const { data: leaguesData } = useGetUserLeaguesQuery({ skip });

  const teamIds = useMemo(
    () =>
      (leaguesData?.userLeagues ?? [])
        .filter((l) => l.sport === sport)
        .filter((l) => leagueId === null || l.id === leagueId)
        .map((l) => l.userMembership?.teamId)
        .filter((id): id is number => id != null),
    [leaguesData, sport, leagueId],
  );

  useEffect(() => {
    if (skip || teamIds.length === 0) {
      setPlayerIds(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.allSettled(
      teamIds.map((teamId) =>
        client.query<GetTeamMembersQuery, GetTeamMembersQueryVariables>({
          query: GetTeamMembers,
          variables: { teamId },
          fetchPolicy: 'cache-first',
        }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const ids = new Set<number>();
      for (const result of results) {
        if (result.status === 'rejected') {
          LOGGER.error(
            'Failed to fetch league roster data for availability filter',
            result.reason as Error,
          );
          continue;
        }
        for (const member of result.value.data?.teamMembers ?? []) {
          if (member?.playerId != null) ids.add(member.playerId);
        }
      }
      setPlayerIds(ids);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [skip, teamIds, client]);

  return { playerIds, loading };
}

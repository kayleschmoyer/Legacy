import { useEffect, useMemo, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  GetTeamMembers,
  type GetTeamMembersQuery,
  type GetTeamMembersQueryVariables,
  Sport,
  useGetUserLeaguesQuery,
} from '@legacy-sports/graphql';

export interface MyRosterPlayerIdsResult {
  readonly playerIds: Set<number>;
  readonly loading: boolean;
}

/**
 * Fetches the set of player IDs rostered on the current user's teams across
 * all their football leagues. Only active when `skip` is false (typically
 * gated behind premium access). Uses cache-first Apollo queries so repeated
 * toggles of the filter do not re-hit the network.
 */
export function useMyRosterPlayerIds(skip: boolean): MyRosterPlayerIdsResult {
  const client = useApolloClient();
  const [playerIds, setPlayerIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(false);

  const { data: leaguesData } = useGetUserLeaguesQuery({ skip });

  const footballTeamIds = useMemo(
    () =>
      (leaguesData?.userLeagues ?? [])
        .filter((l) => l.sport === Sport.Football)
        .map((l) => l.userMembership?.teamId)
        .filter((id): id is number => id != null),
    [leaguesData],
  );

  useEffect(() => {
    if (skip || footballTeamIds.length === 0) {
      setPlayerIds(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.all(
      footballTeamIds.map((teamId) =>
        client.query<GetTeamMembersQuery, GetTeamMembersQueryVariables>({
          query: GetTeamMembers,
          variables: { teamId },
          fetchPolicy: 'cache-first',
        }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const ids = new Set<number>();
        for (const result of results) {
          for (const member of result.data?.teamMembers ?? []) {
            if (member.playerId != null) ids.add(member.playerId);
          }
        }
        setPlayerIds(ids);
        setLoading(false);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          LOGGER.error(
            'Failed to fetch team members for My Rostered filter',
            error,
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [skip, footballTeamIds, client]);

  return { playerIds, loading };
}

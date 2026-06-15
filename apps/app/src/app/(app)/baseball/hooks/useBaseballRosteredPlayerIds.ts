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

export interface BaseballRosteredPlayerIdsResult {
  readonly playerIds: Set<number>;
  readonly loading: boolean;
}

/**
 * Fetches the set of player IDs rostered on the current user's teams across
 * all their baseball leagues. Used for the availability filter on the baseball
 * Players List page. Only active when `skip` is false.
 */
export function useBaseballRosteredPlayerIds(
  skip = false,
): BaseballRosteredPlayerIdsResult {
  const client = useApolloClient();
  const [playerIds, setPlayerIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(false);

  const { data: leaguesData } = useGetUserLeaguesQuery({ skip });

  const baseballTeamIds = useMemo(
    () =>
      (leaguesData?.userLeagues ?? [])
        .filter((l) => l.sport === Sport.Baseball)
        .map((l) => l.userMembership?.teamId)
        .filter((id): id is number => id != null),
    [leaguesData],
  );

  useEffect(() => {
    if (skip || baseballTeamIds.length === 0) {
      setPlayerIds(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.allSettled(
      baseballTeamIds.map((teamId) =>
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
            'Failed to fetch team members for baseball availability filter',
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
  }, [skip, baseballTeamIds, client]);

  return { playerIds, loading };
}

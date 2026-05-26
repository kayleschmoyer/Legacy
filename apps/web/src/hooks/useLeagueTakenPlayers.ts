import { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  GetTeamMembers,
  GetTeamMembersQuery,
  GetTeamMembersQueryVariables,
  useGetLeagueTeamsQuery,
} from '../api/db/graphql.generated';

/**
 * @param leagueId
 * @param refreshKey Bump to force a fresh roster fetch even when teamsData is
 *   unchanged. Callers that paginate a separate "available players" query
 *   should pass their page (or page+sort+filter) so the taken-player set is
 *   re-pulled on every page change — without this, the set stays frozen for
 *   the lifetime of the teams query and pagination can surface players who
 *   have already been rostered by another team since first mount (LS-4032).
 */
export function useLeagueTakenPlayers(leagueId: number, refreshKey?: unknown) {
  const client = useApolloClient();
  const { data: teamsData, loading: teamsLoading } = useGetLeagueTeamsQuery({
    variables: { leagueId },
  });
  const [takenPlayerIds, setTakenPlayerIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  // Track the refreshKey that was in effect when the last fetch completed.
  // If resolvedKey !== refreshKey the data is stale — report loading:true
  // synchronously on the very render where refreshKey changes, before the
  // effect fires, so displayPlayers never shows already-claimed players during
  // the async re-fetch window (LS-4044).
  const [resolvedKey, setResolvedKey] = useState<unknown>(refreshKey);

  useEffect(() => {
    if (teamsLoading) return;
    if (!teamsData?.leagueTeams) {
      setLoading(false);
      setResolvedKey(refreshKey);
      return;
    }

    const fetchMembers = async () => {
      setLoading(true);
      try {
        const teams = teamsData.leagueTeams || [];
        // Filter out nulls and ensure we have valid objects with IDs
        const teamIds = teams
          .filter(
            (t): t is NonNullable<typeof t> => t !== null && t !== undefined,
          )
          .map((t) => t.id)
          .filter((id): id is number => id != null);

        const promises = teamIds.map((id) =>
          client.query<GetTeamMembersQuery, GetTeamMembersQueryVariables>({
            query: GetTeamMembers,
            variables: { teamId: id },
            fetchPolicy: 'network-only', // Ensure we get fresh roster positions
          }),
        );

        const results = await Promise.all(promises);
        const ids = new Set<number>();

        results.forEach((res) => {
          if (res.data?.teamMembers) {
            res.data.teamMembers.forEach((m) => {
              if (m?.player?.id) {
                ids.add(m.player.id);
              }
            });
          }
        });

        setTakenPlayerIds(ids);
        setResolvedKey(refreshKey);
      } catch (err) {
        LOGGER.error(
          'Failed to fetch league rosters',
          err instanceof Error ? err : String(err),
        );
        setResolvedKey(refreshKey);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers().catch((err: unknown) => {
      LOGGER.error(
        'Error fetching members:',
        err instanceof Error ? err : String(err),
      );
    });
  }, [teamsData, teamsLoading, client, refreshKey]);

  return {
    takenPlayerIds,
    loading: loading || teamsLoading || resolvedKey !== refreshKey,
  };
}

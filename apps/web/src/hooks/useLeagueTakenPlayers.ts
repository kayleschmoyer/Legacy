import { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  GetTeamMembers,
  GetTeamMembersQuery,
  GetTeamMembersQueryVariables,
  useGetLeagueTeamsQuery,
} from '@legacy-sports/graphql';

/**
 * @param leagueId
 * @param refreshKey Optional. Bump to force a fresh roster fetch when you
 *   know the taken-player set has changed (e.g. after a successful waiver
 *   claim). Do NOT pass filter/page state here — the taken-player set is
 *   league-wide and does not vary by filter, so including filter state as the
 *   key causes an unnecessary network round-trip on every filter change
 *   (LS-5923).
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

    // Guards against a stale response from a superseded fetch (e.g. leagueId
    // or refreshKey changing again before the in-flight request resolves)
    // overwriting the state set by a newer fetch (LS-2454).
    let cancelled = false;

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
        if (cancelled) return;

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
        if (cancelled) return;
        LOGGER.error(
          'Failed to fetch league rosters',
          err instanceof Error ? err : String(err),
        );
        setResolvedKey(refreshKey);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMembers().catch((err: unknown) => {
      LOGGER.error(
        'Error fetching members:',
        err instanceof Error ? err : String(err),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [teamsData, teamsLoading, client, refreshKey]);

  return {
    takenPlayerIds,
    loading: loading || teamsLoading || resolvedKey !== refreshKey,
  };
}

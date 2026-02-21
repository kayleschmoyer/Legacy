import { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import {
  GetTeamMembers,
  GetTeamMembersQuery,
  GetTeamMembersQueryVariables,
  useGetLeagueTeamsQuery,
} from '../api/db/graphql.generated';

export function useLeagueTakenPlayers(leagueId: number) {
  const client = useApolloClient();
  const { data: teamsData, loading: teamsLoading } = useGetLeagueTeamsQuery({
    variables: { leagueId },
  });
  const [takenPlayerIds, setTakenPlayerIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (teamsLoading) return;
    if (!teamsData?.leagueTeams) {
      setLoading(false);
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
      } catch (err) {
        console.error('Failed to fetch league rosters', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers().catch((err) => {
      console.error('Error fetching members:', err);
    });
  }, [teamsData, teamsLoading, client]);

  return { takenPlayerIds, loading: loading || teamsLoading };
}

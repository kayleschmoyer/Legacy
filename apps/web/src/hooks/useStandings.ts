import { useGetLeagueStandingsQuery } from '../api/db/graphql.generated';

/**
 * Hook for fetching league standings
 */
export function useStandings(leagueId: number | null | undefined) {
  const { data, loading, error, refetch } = useGetLeagueStandingsQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
  });

  const standings = data?.getLeagueStandings ?? [];

  // Sort standings by win percentage (descending), then by points for
  const sortedStandings = [...standings].sort((a, b) => {
    const winPctDiff = (b.winPercentage ?? 0) - (a.winPercentage ?? 0);
    if (winPctDiff !== 0) return winPctDiff;
    return (b.pointsFor ?? 0) - (a.pointsFor ?? 0);
  });

  return {
    standings: sortedStandings,
    loading,
    error,
    refetch,
  };
}

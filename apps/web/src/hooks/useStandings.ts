import type { ErrorPolicy } from '@apollo/client';
import { useGetLeagueStandingsQuery } from '@legacy-sports/graphql';

export interface UseStandingsOptions {
  errorPolicy?: ErrorPolicy;
}

/**
 * Hook for fetching league standings.
 *
 * Pass `throughWeek` to get historical standings as of that week (only
 * matchups through that week count toward the record); omit for current
 * standings.
 */
export function useStandings(
  leagueId: number | null | undefined,
  throughWeek?: number | null,
  options?: UseStandingsOptions,
) {
  const { data, loading, error, refetch } = useGetLeagueStandingsQuery({
    variables: { leagueId: leagueId ?? 0, throughWeek: throughWeek ?? null },
    skip: !leagueId,
    errorPolicy: options?.errorPolicy,
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

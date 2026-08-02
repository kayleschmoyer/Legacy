import { useGetPlayoffBracketQuery } from '@legacy-sports/graphql';

/**
 * Fetches the playoff bracket for a league. Returns the bracket (or null),
 * loading/error state, and a `refetch` to force a fresh fetch past the Apollo
 * cache (e.g. for pull-to-refresh).
 */
export function usePlayoffBracket(leagueId: number | null | undefined) {
  const { data, loading, error, refetch } = useGetPlayoffBracketQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  return {
    bracket: data?.getPlayoffBracket ?? null,
    loading,
    error,
    refetch,
  };
}

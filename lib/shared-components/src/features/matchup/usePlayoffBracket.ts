import { useGetPlayoffBracketQuery } from '@legacy-sports/graphql';

/**
 * Fetches the playoff bracket for a league. Returns the bracket (or null) plus
 * loading/error state so consumers can feed it straight into `<PlayoffBracket>`.
 */
export function usePlayoffBracket(leagueId: number | null | undefined) {
  const { data, loading, error } = useGetPlayoffBracketQuery({
    variables: { leagueId: leagueId ?? 0 },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  return {
    bracket: data?.getPlayoffBracket ?? null,
    loading,
    error,
  };
}

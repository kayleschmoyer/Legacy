import { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  GetMatchupById,
  GetMatchupByIdQuery,
  GetMatchupByIdQueryVariables,
  MatchupStatus,
} from '@legacy-sports/graphql';
import type { NFLHomeMatchupHighlight } from '@legacy-sports/shared-components/football';

export interface MatchupHighlightLeague {
  id: string | number;
  name?: string | null;
  currentMatchup?: number | null;
  /** Authoritative season phase — `'active'` gates the bye-week fallback below. */
  leaguePhase?: string | null;
  currentWeekNumber?: number | null;
}

/**
 * Resolves one matchup highlight card per league that has a scheduled
 * matchup this week. Previously Football Home only ever highlighted the
 * first league with a matchup, in whatever order the leagues API returned
 * them — an arbitrary choice with no rule a multi-league user could reason
 * about, and every other league's matchup was silently hidden (LS-6265 /
 * FBH-011). Fetches `getMatchupById` per league in parallel, since the
 * leagues list only carries a `currentMatchup` id, not the matchup itself.
 *
 * Bye week (LS-6264 / FBH-010): a mid-season league with no `currentMatchup`
 * isn't "nothing to show" — it can mean the highlighted team is on bye. Those
 * leagues get a defined bye-week card (`status: 'bye'`, `noOpponent: true`)
 * instead of silently dropping out of the highlights list. A league that
 * simply hasn't started its season yet (`leaguePhase !== 'active'`) is not
 * treated as a bye — it still has no highlight.
 */
export function useFootballMatchupHighlights(
  leagues: MatchupHighlightLeague[],
  onPressLeague: (leagueId: string | number) => void,
): { highlights: NFLHomeMatchupHighlight[]; loading: boolean } {
  const client = useApolloClient();
  const [highlights, setHighlights] = useState<NFLHomeMatchupHighlight[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const leaguesWithMatchups = leagues.filter(
      (l): l is MatchupHighlightLeague & { currentMatchup: number } =>
        l.currentMatchup != null,
    );
    const byeLeagues = leagues.filter(
      (l): l is MatchupHighlightLeague & { currentWeekNumber: number } =>
        l.currentMatchup == null &&
        l.leaguePhase === 'active' &&
        l.currentWeekNumber != null,
    );
    const byeHighlights: NFLHomeMatchupHighlight[] = byeLeagues.map(
      (league) => ({
        leagueId: league.id,
        leagueName: league.name,
        weekNumber: league.currentWeekNumber,
        awayTeamName: league.name ?? 'Your team',
        homeTeamName: '',
        status: 'bye',
        noOpponent: true,
        onPress: () => onPressLeague(league.id),
      }),
    );

    if (leaguesWithMatchups.length === 0) {
      setHighlights(byeHighlights);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const resolveLeague = async (
      league: MatchupHighlightLeague & { currentMatchup: number },
    ): Promise<NFLHomeMatchupHighlight | null> => {
      const { data } = await client.query<
        GetMatchupByIdQuery,
        GetMatchupByIdQueryVariables
      >({
        query: GetMatchupById,
        variables: { id: league.currentMatchup },
      });
      const matchup = data?.getMatchupById;
      if (
        !matchup ||
        matchup.status === MatchupStatus.Cancelled ||
        matchup.weekNumber == null ||
        !matchup.team1?.name ||
        !matchup.team2?.name
      ) {
        return null;
      }

      const status =
        matchup.status === MatchupStatus.InProgress
          ? 'live'
          : matchup.status === MatchupStatus.Completed
            ? 'final'
            : 'pre';

      return {
        leagueId: league.id,
        leagueName: league.name,
        weekNumber: matchup.weekNumber,
        awayTeamName: matchup.team2.name,
        homeTeamName: matchup.team1.name,
        status,
        onPress: () => onPressLeague(league.id),
      };
    };

    Promise.all(leaguesWithMatchups.map(resolveLeague))
      .then((results) => {
        if (cancelled) return;
        setHighlights([
          ...results.filter(
            (highlight): highlight is NFLHomeMatchupHighlight =>
              highlight != null,
          ),
          ...byeHighlights,
        ]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        LOGGER.error(
          'Failed to resolve football matchup highlights',
          err instanceof Error ? err : String(err),
        );
        setHighlights(byeHighlights);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leagues, client, onPressLeague]);

  return { highlights, loading };
}

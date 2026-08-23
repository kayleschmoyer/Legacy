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
 * Mobile counterpart to apps/web's `useFootballMatchupHighlights` (LS-6263 /
 * FBH-009) — same per-league matchup resolution (one highlight per league
 * with a scheduled matchup this week, plus a bye-week card for an active
 * league with none), fetching `getMatchupById` per league in parallel since
 * the leagues list only carries a `currentMatchup` id. `onPressLeague` is
 * also passed the resolved matchup id (undefined for a bye week) so the
 * screen can deep-link straight to that matchup instead of only the league.
 */
export function useFootballMatchupHighlights(
  leagues: MatchupHighlightLeague[],
  onPressLeague: (leagueId: string | number, matchupId?: number) => void,
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
        onPress: () => onPressLeague(league.id, league.currentMatchup),
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

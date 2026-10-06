import { useMemo } from 'react';
import {
  FootballStatsDataQuality,
  type MatchupScoresQuery,
  MatchupStatus,
  useMatchupScoresQuery,
} from '@legacy-sports/graphql';

/**
 * Football matchup scoring for the client (LS-10829).
 *
 * The client-side matchup scoring path (`computeMatchupScores` on web and
 * mobile) scores only baseball per-game stat blocks, so for an NFL matchup it
 * sums to 0 actual / 0 projected. Football's actual and projected points are
 * already computed server-side by `matchupScores` (`FootballMatchupPlayer`
 * per starter, `FootballMatchupStats` per team) — the source the Roster
 * Comparison table has used since LS-9612. Every football surface reads them
 * through this module so the roster tab, the scoreboard and the comparison
 * table cannot disagree.
 */

export interface FootballScore {
  actual: number;
  projected: number;
}

export interface FootballPlayerScore extends FootballScore {
  /** Games already played this week (0 or 1; 2 for a rare double-header). */
  gamesPlayed: number;
  /**
   * LS-6394: non-`ok` means a scheduled game produced no stat rows, so
   * `actual` may under-count.
   */
  dataQuality: FootballStatsDataQuality;
}

export interface FootballMatchupScoreMaps {
  /** Starters only — `matchupScores` excludes bench players. */
  playerScores: ReadonlyMap<number, FootballPlayerScore>;
  teamScores: ReadonlyMap<number, FootballScore>;
}

/** Index a `matchupScores` response by player id and team id. */
export function mapFootballMatchupScores(
  data: MatchupScoresQuery | null | undefined,
): FootballMatchupScoreMaps {
  const playerScores = new Map<number, FootballPlayerScore>();
  const teamScores = new Map<number, FootballScore>();
  data?.matchupScores?.forEach((teamStats) => {
    if (teamStats.__typename !== 'FootballMatchupStats') return;
    if (teamStats.teamId != null) {
      teamScores.set(teamStats.teamId, {
        actual: teamStats.totalPoints ?? 0,
        projected: teamStats.projectedPoints ?? 0,
      });
    }
    teamStats.players?.forEach((player) => {
      if (player.playerId == null) return;
      playerScores.set(player.playerId, {
        actual: player.totalPoints ?? 0,
        projected: player.projectedPoints ?? 0,
        gamesPlayed: player.games?.length ?? 0,
        dataQuality: player.dataQuality ?? FootballStatsDataQuality.Ok,
      });
    });
  });
  return { playerScores, teamScores };
}

export interface UseFootballMatchupScoresResult extends FootballMatchupScoreMaps {
  loading: boolean;
  /** True once the query has failed and no data came back. */
  hasError: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Fetch and index `matchupScores` for one league week. Pass `skip` for
 * non-football leagues — the query only resolves football stats.
 */
export function useFootballMatchupScores({
  leagueId,
  weekNum,
  skip = false,
}: {
  leagueId: number | null | undefined;
  weekNum: number | null | undefined;
  skip?: boolean;
}): UseFootballMatchupScoresResult {
  const { data, loading, error, refetch } = useMatchupScoresQuery({
    variables: { leagueId: leagueId ?? 0, weekNum: weekNum ?? 0 },
    skip: skip || !leagueId || !weekNum,
  });
  const maps = useMemo(() => mapFootballMatchupScores(data), [data]);
  return {
    ...maps,
    loading,
    hasError: error != null && data == null,
    refetch,
  };
}

export interface FootballMatchupTotals {
  /** Null when live scores are not available yet (see `scoresUnavailable`). */
  team1Score: number | null;
  team2Score: number | null;
  team1Projected: number | null;
  team2Projected: number | null;
  /**
   * True when the matchup is live, its `matchupScores` totals are still
   * loading or failed to load, and the stored score is 0–0. Callers must show
   * a loading/unavailable state rather than a 0–0 score — it would otherwise
   * be announced as a tie (LS-10794).
   */
  scoresUnavailable: boolean;
}

export interface FootballMatchupTotalsMatchup {
  status?: MatchupStatus | string | null;
  team1Id?: number | null;
  team2Id?: number | null;
  team1Score?: number | null;
  team2Score?: number | null;
}

/**
 * Team totals for a football matchup's scoreboard.
 *
 * Completed matchups keep the server-stored scores as the sole authority, as
 * baseball's `computeMatchupScores` does (BMD-009). Otherwise the live
 * `matchupScores` team totals are used — they are the same numbers the Roster
 * Comparison table shows. A matchup that hasn't started falls back to its
 * stored (zero) score, which the scoreboards already render as a pre-lock
 * placeholder. A live matchup whose totals are missing falls back to its
 * stored score when that is non-zero, and is otherwise reported as
 * `scoresUnavailable`.
 */
export function computeFootballMatchupTotals(
  matchup: FootballMatchupTotalsMatchup | null | undefined,
  teamScores: ReadonlyMap<number, FootballScore>,
): FootballMatchupTotals {
  const stored = {
    team1Score: matchup?.team1Score ?? 0,
    team2Score: matchup?.team2Score ?? 0,
    team1Projected: null,
    team2Projected: null,
    scoresUnavailable: false,
  };
  if (!matchup || matchup.status === MatchupStatus.Completed) return stored;

  const team1 =
    matchup.team1Id != null ? teamScores.get(matchup.team1Id) : undefined;
  // A bye matchup has no second team; only the first side must resolve.
  const team2 =
    matchup.team2Id != null ? teamScores.get(matchup.team2Id) : undefined;
  const resolved = team1 != null && (matchup.team2Id == null || team2 != null);

  if (resolved) {
    return {
      team1Score: team1.actual,
      team2Score: team2?.actual ?? 0,
      team1Projected: team1.projected,
      team2Projected: team2?.projected ?? null,
      scoresUnavailable: false,
    };
  }

  if (matchup.status === MatchupStatus.Scheduled) return stored;

  // Live totals missing (loading or failed): the server-stored score is still
  // a real score, so show it — the same fallback baseball uses when its
  // players query errors (LS-2937). Only a stored 0–0 is indistinguishable
  // from "no stats", and announcing that as a tie is the LS-10794 bug.
  if (stored.team1Score !== 0 || stored.team2Score !== 0) return stored;

  return {
    team1Score: null,
    team2Score: null,
    team1Projected: null,
    team2Projected: null,
    scoresUnavailable: true,
  };
}

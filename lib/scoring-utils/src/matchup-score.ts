/**
 * The single implementation of "score a matchup and persist the result".
 *
 * Before LS-9532 this orchestration existed three times — in
 * `lambdas/stats-lambda/src/scoring-utils.ts`, in
 * `lambdas/game-selection/src/services/season-game-selector.ts` and in
 * `lambdas/db/src/schema/commissioner-tools.ts` — each copy re-deriving the
 * league's scoring settings by hand next to a pasted copy of the stat-row
 * mapping. The commissioner copy got it wrong: it passed
 * `getScoringMultipliersForLeague`'s raw `source_column` keys (snake_case)
 * into a scoring engine that looks weights up by camelCase field name, so
 * `outs_recorded`, `e_def` and `dp_def` silently resolved to weight 0 and every
 * matchup it touched came out under-scored. The stats-lambda copy had a
 * different version of the same trap — a `?? getDefaultScoringSettings()`
 * fallback that would quietly persist default-scored values for a league with
 * a custom profile.
 *
 * Both bugs share one root cause: scoring settings were an argument. Here they
 * are not. The core resolves and camel-cases the league's multipliers itself,
 * from a league id, and there is no exported entry point that accepts settings
 * from a caller. A caller cannot pass the wrong keys or omit them, because a
 * caller never supplies them.
 */

import {
  getCamelCaseScoringMultipliersForLeague,
  getMatchupPlayerGameStats,
  type PublicDb,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import {
  calculateMatchupScore,
  partitionMatchupPlayerGameStats,
  type ScoringSettings,
} from '@legacy-sports/scoring';

/** Games per matchup assumed when the matchup row does not specify one. */
const DEFAULT_GAMES_PER_MATCHUP = 5;

export interface MatchupScoreResult {
  matchupId: number;
  team1Score: number | null;
  team2Score: number | null;
  team1GamesSelected: number;
  team2GamesSelected: number;
  gamesPerMatchup: number;
  /** False when the matchup already had both scores and was left untouched. */
  updated: boolean;
}

export interface ScoreMatchupOptions {
  /**
   * Recompute and rewrite even when both scores are already persisted.
   *
   * Defaults to false, which makes scoring idempotent for callers that may run
   * over an already-scored matchup. Every pipeline that scores in response to
   * new stats or a changed scoring profile passes true.
   */
  forceRecalculation?: boolean;
}

/**
 * Scores every matchup in one league against a scoring profile read once.
 *
 * Use this instead of calling {@link scoreMatchup} in a loop: the profile is a
 * property of the league, not of the matchup, so re-reading it per matchup
 * costs a query per iteration and buys nothing.
 */
export interface LeagueMatchupScorer {
  readonly leagueId: number;
  scoreMatchup(
    matchupId: number,
    options?: ScoreMatchupOptions,
  ): Promise<MatchupScoreResult>;
}

/**
 * Read a league's scoring profile once and return a scorer bound to it.
 */
export async function createLeagueMatchupScorer(
  db: PublicDb,
  leagueId: number,
): Promise<LeagueMatchupScorer> {
  const scoringSettings = await resolveLeagueScoringSettings(db, leagueId);

  return {
    leagueId,
    scoreMatchup: (matchupId, options) =>
      scoreMatchupWithSettings(db, matchupId, scoringSettings, options),
  };
}

/**
 * Compute and persist one matchup's scores using its league's scoring profile.
 *
 * Throws `Matchup <id> not found` when the matchup row is gone — callers that
 * race matchup deletion (the game-selection and stats pipelines both can)
 * match on that exact message to treat it as a graceful skip.
 */
export async function scoreMatchup(
  db: PublicDb,
  matchupId: number,
  leagueId: number,
  options?: ScoreMatchupOptions,
): Promise<MatchupScoreResult> {
  const scoringSettings = await resolveLeagueScoringSettings(db, leagueId);
  return scoreMatchupWithSettings(db, matchupId, scoringSettings, options);
}

/**
 * The league's multipliers in the only form the scoring engine can read.
 *
 * `getCamelCaseScoringMultipliersForLeague` is deliberate, not interchangeable
 * with `getScoringMultipliersForLeague`: the raw accessor keys its output by
 * `scoring_stat_definitions.source_column`, which is snake_case, while
 * `computeScoring` looks weights up by the camelCase keys of the aggregated
 * stats record. Raw keys do not throw — they miss, and the stat scores 0.
 */
async function resolveLeagueScoringSettings(
  db: PublicDb,
  leagueId: number,
): Promise<ScoringSettings> {
  const multipliers = await getCamelCaseScoringMultipliersForLeague(
    db,
    leagueId,
  );

  return {
    batting: multipliers.batting,
    pitching: multipliers.pitching,
    fielding: multipliers.fielding,
  };
}

/**
 * The core. Private on purpose — see the module doc: settings being an
 * argument is what produced the bugs this function consolidates away.
 */
async function scoreMatchupWithSettings(
  db: PublicDb,
  matchupId: number,
  scoringSettings: ScoringSettings,
  options?: ScoreMatchupOptions,
): Promise<MatchupScoreResult> {
  const forceRecalculation = options?.forceRecalculation ?? false;

  const matchup = await db.query.matchups.findFirst({
    where: (matchups, { eq }) => eq(matchups.id, matchupId),
  });

  if (!matchup) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  const { team1Id, team2Id, gamesPerMatchup, team1Score, team2Score } = matchup;

  if (!forceRecalculation && team1Score && team2Score) {
    return {
      matchupId,
      team1Score: parseFloat(team1Score),
      team2Score: parseFloat(team2Score),
      team1GamesSelected: 0,
      team2GamesSelected: 0,
      gamesPerMatchup: gamesPerMatchup ?? 0,
      updated: false,
    };
  }

  // One row per selected slot, not per distinct game: a game selected into N
  // slots of a matchup contributes N times (LS-9602/LS-9532). `calculateStandings`
  // counts the same way, which is what keeps the persisted score and the
  // standings recompute in agreement.
  const statRows = await getMatchupPlayerGameStats(db, matchupId);

  const { team1PlayerStats, team2PlayerStats } =
    partitionMatchupPlayerGameStats(statRows, team1Id, team2Id);

  const matchupScore = calculateMatchupScore(
    matchupId,
    team1Id,
    team2Id,
    team1PlayerStats,
    team2PlayerStats,
    gamesPerMatchup ?? DEFAULT_GAMES_PER_MATCHUP,
    scoringSettings,
  );

  // ── The single site that persists a computed baseball matchup score. ────
  // Every baseball entry point reaches this line and no other; keep it that
  // way.
  //
  // Scoring provenance (`matchups.scored_at`) is stamped one level down, inside
  // `updateMatchupScore` (LS-9665) — not here. That placement is deliberate: the
  // football pipeline
  // (`lambdas/stats-lambda/src/handlers/calculate-football-matchup-scores.ts`)
  // computes its score with a different engine over different stat tables and so
  // does not route through this function, but it does persist through
  // `updateMatchupScore`, which is what keeps football matchups stamped too.
  //
  // The two writers that bypass `updateMatchupScore` entirely both take a score
  // as input rather than computing one — the admin/system `updateMatchupScore`
  // GraphQL mutation (`lambdas/db/src/schema/matchups/mutations.ts`) and the
  // commissioner's hand-entered `editMatchupScore`
  // (`lambdas/db/src/schema/commissioner-tools.ts`) — and each stamps
  // `scored_at` inline for the same reason.
  const updatedMatchup = await updateMatchupScore(
    db,
    matchupId,
    matchupScore.team1Score?.totalScore ?? null,
    matchupScore.team2Score?.totalScore ?? null,
  );

  return {
    matchupId,
    team1Score: updatedMatchup.team1Score
      ? parseFloat(updatedMatchup.team1Score)
      : null,
    team2Score: updatedMatchup.team2Score
      ? parseFloat(updatedMatchup.team2Score)
      : null,
    team1GamesSelected: matchupScore.team1Score?.gamesSelected ?? 0,
    team2GamesSelected: matchupScore.team2Score?.gamesSelected ?? 0,
    gamesPerMatchup: matchupScore.gamesPerMatchup,
    updated: true,
  };
}

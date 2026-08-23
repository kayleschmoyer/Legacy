/**
 * Side-effect-free scoring utilities.
 *
 * Holds the core matchup-scoring logic for the baseball stats pipeline.
 * Kept free of module-level side effects so callers (load-game.ts) can import
 * it without paying for them at module load.
 */

import {
  getMatchupPlayerGameStats,
  type PublicDb,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import {
  calculateMatchupScore,
  partitionMatchupPlayerGameStats,
  type ScoringSettings,
} from '@legacy-sports/scoring';

export interface CalculateMatchupScoresResponse {
  matchupId: number;
  team1Score: number | null;
  team2Score: number | null;
  team1GamesSelected: number;
  team2GamesSelected: number;
  gamesPerMatchup: number;
  updated: boolean;
}

/**
 * Core logic for calculating and updating matchup scores.
 *
 * `scoringSettings` is required on purpose: it must carry the league's own
 * multipliers. Defaulting it would silently persist default-scored values for
 * a league with custom scoring, with no error and no log line (LS-9535).
 */
export async function calculateAndUpdateMatchupScores(
  db: PublicDb,
  matchupId: number,
  scoringSettings: ScoringSettings,
  forceRecalculation = false,
): Promise<CalculateMatchupScoresResponse> {
  // 1. Get matchup details
  const matchupResult = await db.query.matchups.findFirst({
    where: (matchups, { eq }) => eq(matchups.id, matchupId),
  });

  if (!matchupResult) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  const { team1Id, team2Id, gamesPerMatchup, team1Score, team2Score } =
    matchupResult;

  // Skip if scores already calculated and not forcing recalculation
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

  // 2. Get player game stats for this matchup
  const playerGameStatsResult = await getMatchupPlayerGameStats(db, matchupId);

  // 3. Organize stats by team
  const { team1PlayerStats, team2PlayerStats } =
    partitionMatchupPlayerGameStats(playerGameStatsResult, team1Id, team2Id);

  // 4. Calculate matchup scores
  const matchupScore = calculateMatchupScore(
    matchupId,
    team1Id,
    team2Id,
    team1PlayerStats,
    team2PlayerStats,
    gamesPerMatchup ?? 5,
    scoringSettings,
  );

  // 5. Update matchup table with calculated scores
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

/**
 * Calculate Matchup Scores Lambda Handler
 *
 * Orchestrates real-time matchup score calculation.
 * Triggered when:
 * - Games are selected for a matchup
 * - Lineup changes occur
 * - Matchup status updates are needed
 *
 * Integrates with MatchupService and scoring libraries to:
 * 1. Fetch player game stats from database
 * 2. Calculate team scores using scoring settings
 * 3. Update matchup table with calculated scores
 * 4. Return updated matchup data
 */

import {
  getMatchupPlayerGameStats,
  PublicDb,
  runWithPublicClient,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import {
  calculateMatchupScore,
  getDefaultScoringSettings,
  type PlayerGameStats,
  type ScoringSettings,
} from '@legacy-sports/scoring';

export interface CalculateMatchupScoresEvent {
  matchupId: number;
  /**
   * Optional: Custom scoring settings (league-specific)
   * If not provided, uses default scoring settings
   */
  scoringSettings?: ScoringSettings;
  /**
   * Whether to force recalculation even if scores exist
   */
  forceRecalculation?: boolean;
}

export interface CalculateMatchupScoresResponse {
  matchupId: number;
  team1Score: number | null;
  team2Score: number | null;
  team1GamesSelected: number;
  team2GamesSelected: number;
  gamesPerMatchup: number;
  updated: boolean;
  error?: string;
}

/**
 * Main Lambda handler for calculating matchup scores
 */
export async function handler(
  event: CalculateMatchupScoresEvent,
): Promise<CalculateMatchupScoresResponse> {
  const { matchupId, scoringSettings, forceRecalculation = false } = event;

  try {
    return await runWithPublicClient(getDbOptions(), async (db) => {
      return await calculateAndUpdateMatchupScores(
        db,
        matchupId,
        scoringSettings,
        forceRecalculation,
      );
    });
  } catch (error) {
    console.error('Error calculating matchup scores:', error);
    return {
      matchupId,
      team1Score: null,
      team2Score: null,
      team1GamesSelected: 0,
      team2GamesSelected: 0,
      gamesPerMatchup: 0,
      updated: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Core logic for calculating and updating matchup scores
 */
export async function calculateAndUpdateMatchupScores(
  db: PublicDb,
  matchupId: number,
  scoringSettings?: ScoringSettings,
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
  const team1PlayerStats = new Map<number, PlayerGameStats[]>();
  const team2PlayerStats = new Map<number, PlayerGameStats[]>();

  for (const stat of playerGameStatsResult) {
    const playerGameStat: PlayerGameStats = {
      playerId: stat.playerId,
      season: stat.season,
      gameNum: stat.gameNum,
      batting: stat.battingStats
        ? {
            pa: stat.battingStats.pa,
            ab: stat.battingStats.ab,
            r: stat.battingStats.r,
            h: stat.battingStats.h,
            doubles: stat.battingStats.doubles,
            triples: stat.battingStats.triples,
            hr: stat.battingStats.hr,
            rbi: stat.battingStats.rbi,
            sb: stat.battingStats.sb,
            cs: stat.battingStats.cs,
            bb: stat.battingStats.bb,
            so: stat.battingStats.so,
            gidp: stat.battingStats.gidp,
            hbp: stat.battingStats.hbp,
            sh: stat.battingStats.sh,
            sf: stat.battingStats.sf,
            ibb: stat.battingStats.ibb,
          }
        : undefined,
      pitching: stat.pitchingStats
        ? {
            w: stat.pitchingStats.w,
            l: stat.pitchingStats.l,
            gs: stat.pitchingStats.gs,
            gf: stat.pitchingStats.gf,
            cg: stat.pitchingStats.cg,
            sho: stat.pitchingStats.sho,
            sv: stat.pitchingStats.sv,
            ip: stat.pitchingStats.ip,
            h: stat.pitchingStats.h,
            r: stat.pitchingStats.r,
            er: stat.pitchingStats.er,
            hr: stat.pitchingStats.hr,
            bb: stat.pitchingStats.bb,
            ibb: stat.pitchingStats.ibb,
            so: stat.pitchingStats.so,
            hbp: stat.pitchingStats.hbp,
            battersFaced: stat.pitchingStats.battersFaced,
            outsRecorded: stat.pitchingStats.outsRecorded,
          }
        : undefined,
      fielding: stat.fieldingStats
        ? {
            innDef: stat.fieldingStats.innDef,
            chances: stat.fieldingStats.chances,
            po: stat.fieldingStats.po,
            a: stat.fieldingStats.a,
            eDef: stat.fieldingStats.eDef,
            dpDef: stat.fieldingStats.dpDef,
          }
        : undefined,
    };

    if (stat.teamId === team1Id) {
      const playerStats = team1PlayerStats.get(stat.playerId);
      if (playerStats) {
        playerStats.push(playerGameStat);
      } else {
        team1PlayerStats.set(stat.playerId, [playerGameStat]);
      }
      // Non-null assertion is safe because we just set the value if it didn't exist
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
      team1PlayerStats.get(stat.playerId)!.push(playerGameStat);
    } else if (stat.teamId === team2Id) {
      const playerStats = team2PlayerStats.get(stat.playerId);
      if (playerStats) {
        playerStats.push(playerGameStat);
      } else {
        team2PlayerStats.set(stat.playerId, [playerGameStat]);
      }
      // Non-null assertion is safe because we just set the value if it didn't exist
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
      team2PlayerStats.get(stat.playerId)!.push(playerGameStat);
    }
  }

  // 4. Calculate matchup scores
  const settings = scoringSettings ?? getDefaultScoringSettings();
  const matchupScore = calculateMatchupScore(
    matchupId,
    team1Id,
    team2Id,
    team1PlayerStats,
    team2PlayerStats,
    gamesPerMatchup ?? 5,
    settings,
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

/**
 * Batch calculate scores for multiple matchups
 * Useful for weekly score updates
 */
export async function batchCalculateMatchupScores(
  matchupIds: number[],
  scoringSettings?: ScoringSettings,
): Promise<CalculateMatchupScoresResponse[]> {
  const results: CalculateMatchupScoresResponse[] = [];

  for (const matchupId of matchupIds) {
    try {
      const result = await handler({
        matchupId,
        scoringSettings,
        forceRecalculation: true,
      });
      results.push(result);
    } catch (error) {
      console.error(
        `Error calculating scores for matchup ${matchupId}:`,
        error,
      );
      results.push({
        matchupId,
        team1Score: null,
        team2Score: null,
        team1GamesSelected: 0,
        team2GamesSelected: 0,
        gamesPerMatchup: 0,
        updated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

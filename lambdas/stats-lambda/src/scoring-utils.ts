/**
 * Side-effect-free scoring utilities.
 *
 * Extracted from the calculate-matchup-scores handler so that callers
 * (e.g. load-game.ts) can import the core scoring logic without pulling
 * in module-level side effects (Rollbar init, heavier handler deps).
 */

import {
  getMatchupPlayerGameStats,
  type PublicDb,
  updateMatchupScore,
} from '@legacy-sports/db-client';
import {
  calculateMatchupScore,
  getDefaultScoringSettings,
  type PlayerGameStats,
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
  error?: string;
}

/**
 * Core logic for calculating and updating matchup scores.
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
    } else if (stat.teamId === team2Id) {
      const playerStats = team2PlayerStats.get(stat.playerId);
      if (playerStats) {
        playerStats.push(playerGameStat);
      } else {
        team2PlayerStats.set(stat.playerId, [playerGameStat]);
      }
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

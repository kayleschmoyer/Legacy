/**
 * Matchup Scoring Engine
 *
 * Calculates team scores for fantasy matchups by aggregating individual player
 * performances across selected games from the matchup's chosen season.
 */

import { computeScoring } from './ComputeScoring';
import {
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from './baseball/DefaultScoring';

export interface PlayerGameStats {
  playerId: number;
  season: number;
  gameNum: number;
  batting?: {
    pa?: number | null;
    ab?: number | null;
    r?: number | null;
    h?: number | null;
    doubles?: number | null;
    triples?: number | null;
    hr?: number | null;
    rbi?: number | null;
    sb?: number | null;
    cs?: number | null;
    bb?: number | null;
    so?: number | null;
    gidp?: number | null;
    hbp?: number | null;
    sh?: number | null;
    sf?: string | null;
    ibb?: number | null;
  };
  pitching?: {
    w?: number | null;
    l?: number | null;
    gs?: number | null;
    gf?: number | null;
    cg?: number | null;
    sho?: number | null;
    sv?: number | null;
    ip?: number | null;
    h?: number | null;
    r?: number | null;
    er?: number | null;
    hr?: number | null;
    bb?: number | null;
    ibb?: number | null;
    so?: number | null;
    hbp?: number | null;
    battersFaced?: number | null;
    outsRecorded?: number | null;
  };
  fielding?: {
    innDef?: number | null;
    chances?: number | null;
    po?: number | null;
    a?: number | null;
    eDef?: number | null;
    dpDef?: number | null;
  };
}

export interface AggregatedPlayerStats {
  playerId: number;
  totalGames: number;
  battingStats: Record<string, number>;
  pitchingStats: Record<string, number>;
  fieldingStats: Record<string, number>;
}

export interface TeamScore {
  teamId: number;
  totalScore: number;
  battingScore: number;
  pitchingScore: number;
  fieldingScore: number;
  playerScores: PlayerScore[];
  gamesSelected: number;
  gamesRemaining: number;
}

export interface PlayerScore {
  playerId: number;
  totalScore: number;
  battingScore: number;
  pitchingScore: number;
  fieldingScore: number;
  gamesPlayed: number;
}

export interface MatchupScore {
  matchupId: number;
  team1Score: TeamScore | null;
  team2Score: TeamScore | null;
  gamesPerMatchup: number;
}

export interface ScoringSettings {
  batting: Partial<Record<string, number>>;
  pitching: Partial<Record<string, number>>;
  fielding: Partial<Record<string, number>>;
}

/**
 * Aggregate individual game stats for a player into cumulative totals
 */
export function aggregatePlayerStats(
  gameStats: PlayerGameStats[],
): AggregatedPlayerStats {
  if (gameStats.length === 0) {
    throw new Error('No game stats provided for aggregation');
  }

  const playerId = gameStats[0].playerId;
  const battingStats: Record<string, number> = {};
  const pitchingStats: Record<string, number> = {};
  const fieldingStats: Record<string, number> = {};

  for (const game of gameStats) {
    // Aggregate batting stats
    if (game.batting) {
      for (const [key, value] of Object.entries(game.batting)) {
        if (typeof value === 'number') {
          battingStats[key] = (battingStats[key] || 0) + value;
        }
      }
    }

    // Aggregate pitching stats
    if (game.pitching) {
      for (const [key, value] of Object.entries(game.pitching)) {
        if (typeof value === 'number') {
          pitchingStats[key] = (pitchingStats[key] || 0) + value;
        }
      }
    }

    // Aggregate fielding stats
    if (game.fielding) {
      for (const [key, value] of Object.entries(game.fielding)) {
        if (typeof value === 'number') {
          fieldingStats[key] = (fieldingStats[key] || 0) + value;
        }
      }
    }
  }

  return {
    playerId,
    totalGames: gameStats.length,
    battingStats,
    pitchingStats,
    fieldingStats,
  };
}

/**
 * Calculate fantasy score for a single player based on aggregated stats
 */
export function calculatePlayerScore(
  aggregatedStats: AggregatedPlayerStats,
  scoringSettings: ScoringSettings,
): PlayerScore {
  const battingScore = computeScoring(
    aggregatedStats.battingStats,
    scoringSettings.batting,
  );

  const pitchingScore = computeScoring(
    aggregatedStats.pitchingStats,
    scoringSettings.pitching,
  );

  const fieldingScore = computeScoring(
    aggregatedStats.fieldingStats,
    scoringSettings.fielding,
  );

  return {
    playerId: aggregatedStats.playerId,
    totalScore: battingScore + pitchingScore + fieldingScore,
    battingScore,
    pitchingScore,
    fieldingScore,
    gamesPlayed: aggregatedStats.totalGames,
  };
}

/**
 * Calculate total team score from all rostered players' performances
 */
export function calculateTeamScore(
  teamId: number,
  playerGameStats: Map<number, PlayerGameStats[]>,
  gamesPerMatchup: number,
  scoringSettings: ScoringSettings,
): TeamScore {
  const playerScores: PlayerScore[] = [];
  let totalGamesSelected = 0;

  // Calculate score for each player
  for (const [, gameStats] of playerGameStats.entries()) {
    if (gameStats.length === 0) continue;

    const aggregated = aggregatePlayerStats(gameStats);
    const playerScore = calculatePlayerScore(aggregated, scoringSettings);
    playerScores.push(playerScore);
    totalGamesSelected += gameStats.length;
  }

  // Sum up all player scores
  const totalScore = playerScores.reduce((sum, ps) => sum + ps.totalScore, 0);
  const battingScore = playerScores.reduce(
    (sum, ps) => sum + ps.battingScore,
    0,
  );
  const pitchingScore = playerScores.reduce(
    (sum, ps) => sum + ps.pitchingScore,
    0,
  );
  const fieldingScore = playerScores.reduce(
    (sum, ps) => sum + ps.fieldingScore,
    0,
  );

  return {
    teamId,
    totalScore,
    battingScore,
    pitchingScore,
    fieldingScore,
    playerScores,
    gamesSelected: totalGamesSelected,
    gamesRemaining: gamesPerMatchup - totalGamesSelected,
  };
}

/**
 * Calculate scores for both teams in a matchup
 */
export function calculateMatchupScore(
  matchupId: number,
  team1Id: number | null,
  team2Id: number | null,
  team1PlayerGameStats: Map<number, PlayerGameStats[]>,
  team2PlayerGameStats: Map<number, PlayerGameStats[]>,
  gamesPerMatchup: number,
  scoringSettings: ScoringSettings = {
    batting: DEFAULT_BATTING_SCORING,
    pitching: DEFAULT_PITCHING_SCORING,
    fielding: DEFAULT_FIELDING_SCORING,
  },
): MatchupScore {
  const team1Score = team1Id
    ? calculateTeamScore(
        team1Id,
        team1PlayerGameStats,
        gamesPerMatchup,
        scoringSettings,
      )
    : null;

  const team2Score = team2Id
    ? calculateTeamScore(
        team2Id,
        team2PlayerGameStats,
        gamesPerMatchup,
        scoringSettings,
      )
    : null;

  return {
    matchupId,
    team1Score,
    team2Score,
    gamesPerMatchup,
  };
}

/**
 * Get default scoring settings (can be overridden with league-specific settings)
 */
export function getDefaultScoringSettings(): ScoringSettings {
  return {
    batting: { ...DEFAULT_BATTING_SCORING },
    pitching: { ...DEFAULT_PITCHING_SCORING },
    fielding: { ...DEFAULT_FIELDING_SCORING },
  };
}

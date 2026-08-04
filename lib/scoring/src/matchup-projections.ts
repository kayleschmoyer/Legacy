/**
 * Matchup Projections Engine
 *
 * Calculates two types of fantasy score projections:
 * 1. Career Projection: Based on career averages (all-time performance)
 * 2. Matchup Projection: Based on selected season averages (season-specific performance)
 *
 * These projections help users make informed decisions about player selection
 * and game selection strategies.
 */

import { computeAverageScoring } from './ComputeScoring';
import {
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from './baseball/DefaultScoring';
import type { ScoringSettings } from './matchup-scoring';

export interface SeasonStats {
  playerId: number;
  season: number;
  battingStats?: {
    g?: number | null;
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
  pitchingStats?: {
    g?: number | null;
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
  fieldingStats?: {
    g?: number | null;
    innDef?: number | null;
    chances?: number | null;
    po?: number | null;
    a?: number | null;
    eDef?: number | null;
    dpDef?: number | null;
  };
}

export interface ProjectionScore {
  totalPerGame: number;
  battingPerGame: number;
  pitchingPerGame: number;
  fieldingPerGame: number;
  gamesPlayed: number;
}

/**
 * Calculate matchup projection based on selected season averages
 * More accurate for current season performance
 */
export function calculateMatchupProjection(
  seasonStats: SeasonStats,
  scoringSettings: ScoringSettings = {
    batting: DEFAULT_BATTING_SCORING,
    pitching: DEFAULT_PITCHING_SCORING,
    fielding: DEFAULT_FIELDING_SCORING,
  },
): ProjectionScore {
  const battingPerGame = seasonStats.battingStats
    ? computeAverageScoring(seasonStats.battingStats, scoringSettings.batting)
    : 0;

  const pitchingPerGame = seasonStats.pitchingStats
    ? computeAverageScoring(seasonStats.pitchingStats, scoringSettings.pitching)
    : 0;

  const fieldingPerGame = seasonStats.fieldingStats
    ? computeAverageScoring(seasonStats.fieldingStats, scoringSettings.fielding)
    : 0;

  const gamesPlayed = Math.max(
    seasonStats.battingStats?.g ?? 0,
    seasonStats.pitchingStats?.g ?? 0,
    seasonStats.fieldingStats?.g ?? 0,
  );

  return {
    totalPerGame: battingPerGame + pitchingPerGame + fieldingPerGame,
    battingPerGame,
    pitchingPerGame,
    fieldingPerGame,
    gamesPlayed,
  };
}

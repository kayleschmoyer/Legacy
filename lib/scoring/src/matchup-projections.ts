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

export interface CareerStats {
  playerId: number;
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

export interface PlayerProjection {
  playerId: number;
  careerProjection: ProjectionScore;
  matchupProjection: ProjectionScore | null;
  selectedSeason: number | null;
}

export interface ProjectionScore {
  totalPerGame: number;
  battingPerGame: number;
  pitchingPerGame: number;
  fieldingPerGame: number;
  gamesPlayed: number;
}

/**
 * Calculate career projection based on career averages
 * Uses existing career stats aggregation (from LS-7)
 */
export function calculateCareerProjection(
  careerStats: CareerStats,
  scoringSettings: ScoringSettings = {
    batting: DEFAULT_BATTING_SCORING,
    pitching: DEFAULT_PITCHING_SCORING,
    fielding: DEFAULT_FIELDING_SCORING,
  },
): ProjectionScore {
  const battingPerGame = careerStats.battingStats
    ? computeAverageScoring(careerStats.battingStats, scoringSettings.batting)
    : 0;

  const pitchingPerGame = careerStats.pitchingStats
    ? computeAverageScoring(careerStats.pitchingStats, scoringSettings.pitching)
    : 0;

  const fieldingPerGame = careerStats.fieldingStats
    ? computeAverageScoring(careerStats.fieldingStats, scoringSettings.fielding)
    : 0;

  const gamesPlayed = Math.max(
    careerStats.battingStats?.g ?? 0,
    careerStats.pitchingStats?.g ?? 0,
    careerStats.fieldingStats?.g ?? 0,
  );

  return {
    totalPerGame: battingPerGame + pitchingPerGame + fieldingPerGame,
    battingPerGame,
    pitchingPerGame,
    fieldingPerGame,
    gamesPlayed,
  };
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

/**
 * Calculate both career and matchup projections for a player
 * This provides dual perspective for roster management decisions
 */
export function calculatePlayerProjections(
  careerStats: CareerStats,
  seasonStats: SeasonStats | null,
  scoringSettings?: ScoringSettings,
): PlayerProjection {
  const careerProjection = calculateCareerProjection(careerStats, scoringSettings);
  
  const matchupProjection = seasonStats
    ? calculateMatchupProjection(seasonStats, scoringSettings)
    : null;

  return {
    playerId: careerStats.playerId,
    careerProjection,
    matchupProjection,
    selectedSeason: seasonStats?.season ?? null,
  };
}

/**
 * Project total expected score for remaining games in matchup
 * Useful for strategic game selection
 */
export function projectRemainingScore(
  projection: ProjectionScore,
  gamesRemaining: number,
): number {
  return projection.totalPerGame * gamesRemaining;
}

/**
 * Compare career vs matchup projection to identify hot/cold streaks
 * Returns percentage difference (positive = performing above career average)
 */
export function compareProjections(
  careerProjection: ProjectionScore,
  matchupProjection: ProjectionScore,
): number {
  if (careerProjection.totalPerGame === 0) return 0;
  
  const difference = matchupProjection.totalPerGame - careerProjection.totalPerGame;
  return (difference / careerProjection.totalPerGame) * 100;
}

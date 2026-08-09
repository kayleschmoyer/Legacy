import {
  computeDefenseScore,
  type GameFootballDefense,
} from './DefenseScoring';
import { computeIDPScore, type GameFootballDefenseIdp } from './IDPScoring';
import type { FootballScoringSettings } from './ScoringSettings';
import { computeScoring } from '../ComputeScoring';

/**
 * Normalized offense/kicking stat shapes shared by both the per-game matchup
 * scoring path (matchupScores.ts) and the career-totals path (football.ts) —
 * both sum the same four stat groups the same way, just from different
 * source rows (a single game vs. a career aggregate).
 */
export interface FootballOffenseFantasyStats {
  passing?: {
    yds: number | null;
    td: number | null;
    int: number | null;
    sacked: number | null;
  } | null;
  rushing?: {
    yds: number | null;
    td: number | null;
    fumbles: number | null;
  } | null;
  receiving?: {
    rec: number | null;
    yds: number | null;
    td: number | null;
    fumbles: number | null;
  } | null;
  kicking?: {
    fgm: number | null;
    fg_50m: number | null;
    xpm: number | null;
  } | null;
}

/**
 * Sum fantasy points across whichever offense/kicking stat groups are
 * present, using the given (profile-aware or default) scoring settings.
 */
export function computeFootballOffenseFantasyPoints(
  stats: FootballOffenseFantasyStats,
  settings: FootballScoringSettings,
): number {
  let total = 0;

  if (stats.passing) {
    total += computeScoring(stats.passing, settings.passing);
  }
  if (stats.rushing) {
    total += computeScoring(stats.rushing, settings.rushing);
  }
  if (stats.receiving) {
    total += computeScoring(stats.receiving, settings.receiving);
  }
  if (stats.kicking) {
    total += computeScoring(stats.kicking, settings.kicking);
  }

  return total;
}

/** DST (team defense) fantasy points using the given scoring settings. */
export function computeFootballDefenseFantasyPoints(
  stats: GameFootballDefense,
  settings: FootballScoringSettings,
): number {
  return computeDefenseScore(stats, settings.defense, settings.defenseBands);
}

/** Individual defensive player fantasy points using the given scoring settings. */
export function computeFootballIdpFantasyPoints(
  stats: GameFootballDefenseIdp,
  settings: FootballScoringSettings,
): number {
  return computeIDPScore(stats, settings.idp);
}

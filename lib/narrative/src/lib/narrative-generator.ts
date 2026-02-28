/**
 * Template-based matchup narrative generator.
 *
 * Generates a human-readable recap for a completed fantasy matchup, including
 * a headline, a short narrative paragraph, and bullet-point highlights for
 * standout historical player performances.
 */

import {
  type MatchupContext,
  type MatchupNarrativeResult,
  type MatchupNarrativeType,
  type PlayerPerformance,
  type TeamRecap,
} from './types';
import {
  BATTER_STANDOUT_LINES,
  BLOWOUT_CLOSINGS,
  BLOWOUT_OPENINGS,
  CLOSE_CLOSINGS,
  CLOSE_OPENINGS,
  NORMAL_CLOSINGS,
  NORMAL_OPENINGS,
  PITCHER_STANDOUT_LINES,
} from './templates';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Score margin that constitutes a blowout. */
const BLOWOUT_THRESHOLD = 20;
/** Score margin indicating a close game. */
const CLOSE_THRESHOLD = 5;
/** Minimum fantasy points for a player to be considered a top performer. */
const MIN_HIGHLIGHT_POINTS = 10;
/** Maximum number of highlight bullets to include. */
const MAX_HIGHLIGHTS = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministically pick an item from an array using the matchupId as seed. */
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Replace {token} placeholders in a template string. */
function fill(
  template: string,
  tokens: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = tokens[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

/** Format a score to one decimal place. */
function fmt(score: number): string {
  return score.toFixed(1);
}

/** Classify the matchup type based on the score margin. */
function classifyMatchup(
  winScore: number,
  lossScore: number,
): MatchupNarrativeType {
  const margin = winScore - lossScore;
  if (margin >= BLOWOUT_THRESHOLD) return 'blowout';
  if (margin <= CLOSE_THRESHOLD) return 'close';
  return 'normal';
}

/** Return the top N performers across both teams sorted by fantasy points. */
function getTopPerformers(team: TeamRecap, n: number): PlayerPerformance[] {
  return [...team.performers]
    .filter((p) => p.fantasyPoints >= MIN_HIGHLIGHT_POINTS)
    .sort((a, b) => b.fantasyPoints - a.fantasyPoints)
    .slice(0, n);
}

/** Generate a batting stat line for a player, e.g. "2 HR, 5 RBI, .305 avg". */
function battingStatLine(p: PlayerPerformance): string {
  const parts: string[] = [];
  if (p.hr) parts.push(`${p.hr} HR`);
  if (p.rbi) parts.push(`${p.rbi} RBI`);
  if (p.h) parts.push(`${p.h} H`);
  if (p.sb) parts.push(`${p.sb} SB`);
  if (p.ba !== undefined && p.ba > 0)
    parts.push(`.${Math.round(p.ba * 1000)} avg`);
  return parts.length > 0
    ? parts.join(', ')
    : `${p.fantasyPoints.toFixed(1)} pts`;
}

/** Generate a pitching stat line for a player, e.g. "7.1 IP, 9 K, 1 ER". */
function pitchingStatLine(p: PlayerPerformance): string {
  const parts: string[] = [];
  if (p.ip !== undefined) parts.push(`${p.ip.toFixed(1)} IP`);
  if (p.k) parts.push(`${p.k} K`);
  if (p.er !== undefined) parts.push(`${p.er} ER`);
  return parts.length > 0
    ? parts.join(', ')
    : `${p.fantasyPoints.toFixed(1)} pts`;
}

/** Build the bullet-point highlight for a single player. */
function buildPlayerHighlight(p: PlayerPerformance, teamName: string): string {
  const seasonLabel = p.season ? ` (${p.season})` : '';
  const statLine = p.isPitcher ? pitchingStatLine(p) : battingStatLine(p);
  return `${p.playerName}${seasonLabel} (${teamName}): ${statLine}`;
}

/** Build the standout sentence for the top performer on a team. */
function buildStandoutSentence(
  performer: PlayerPerformance,
  teamName: string,
  seed: number,
): string {
  const templates = performer.isPitcher
    ? PITCHER_STANDOUT_LINES
    : BATTER_STANDOUT_LINES;
  const template = pick(templates, seed);
  return fill(template, {
    playerName: performer.playerName,
    season: performer.season ?? 'unknown',
    teamName,
  });
}

// ── Main Public API ───────────────────────────────────────────────────────────

/**
 * Generate a template-based narrative recap for a completed matchup.
 *
 * @param context - Matchup data including team names, scores, and player stats.
 * @returns A `MatchupNarrativeResult` with headline, narrative, and highlights.
 */
export function generateMatchupRecap(
  context: MatchupContext,
): MatchupNarrativeResult {
  const { matchupId, weekNumber, team1, team2 } = context;

  const score1 = team1.score;
  const score2 = team2.score;

  // Determine winner/loser
  let winner: TeamRecap;
  let loser: TeamRecap;
  let winnerId: number | null;

  if (score1 > score2) {
    winner = team1;
    loser = team2;
    winnerId = team1.teamId;
  } else if (score2 > score1) {
    winner = team2;
    loser = team1;
    winnerId = team2.teamId;
  } else {
    // Tie — treat team1 as "winner" for template purposes but mark null
    winner = team1;
    loser = team2;
    winnerId = null;
  }

  const winScore = winner.score;
  const lossScore = loser.score;
  const matchupType = classifyMatchup(winScore, lossScore);

  // Pick templates using matchupId as a seed so the same matchup
  // always generates the same narrative.
  const seed = matchupId;

  // ── Headline ───────────────────────────────────────────────────────────────
  let headline: string;
  if (winnerId === null) {
    headline = `Week ${weekNumber}: ${team1.teamName} and ${team2.teamName} fight to a ${fmt(score1)}–${fmt(score2)} tie`;
  } else {
    const margin = winScore - lossScore;
    const adjective =
      matchupType === 'blowout'
        ? 'Dominant'
        : matchupType === 'close'
          ? 'Narrow'
          : 'Solid';
    headline = `Week ${weekNumber}: ${winner.teamName} scores ${adjective} ${fmt(winScore)}–${fmt(lossScore)} victory over ${loser.teamName}`;
    void margin; // suppress unused warning
  }

  // ── Opening sentence ───────────────────────────────────────────────────────
  const openings =
    matchupType === 'blowout'
      ? BLOWOUT_OPENINGS
      : matchupType === 'close'
        ? CLOSE_OPENINGS
        : NORMAL_OPENINGS;

  const openingTemplate = pick(openings, seed);
  const opening = fill(openingTemplate, {
    winner: winner.teamName,
    loser: loser.teamName,
    winScore: fmt(winScore),
    lossScore: fmt(lossScore),
    week: weekNumber,
  });

  // ── Standout performer sentence ────────────────────────────────────────────
  const winnerTop = getTopPerformers(winner, 1)[0];
  const loserTop = getTopPerformers(loser, 1)[0];

  let standoutSentences = '';
  if (winnerTop) {
    standoutSentences +=
      ' ' + buildStandoutSentence(winnerTop, winner.teamName, seed + 1);
  }
  if (loserTop) {
    standoutSentences +=
      ' ' + buildStandoutSentence(loserTop, loser.teamName, seed + 2);
  }

  // ── Closing sentence ───────────────────────────────────────────────────────
  const closings =
    matchupType === 'blowout'
      ? BLOWOUT_CLOSINGS
      : matchupType === 'close'
        ? CLOSE_CLOSINGS
        : NORMAL_CLOSINGS;

  const closingTemplate = pick(closings, seed + 3);
  const closing = fill(closingTemplate, {
    winner: winner.teamName,
    loser: loser.teamName,
  });

  const narrative = `${opening}${standoutSentences} ${closing}`.trim();

  // ── Highlights ─────────────────────────────────────────────────────────────
  const winnerPerformers = getTopPerformers(
    winner,
    Math.ceil(MAX_HIGHLIGHTS / 2),
  );
  const loserPerformers = getTopPerformers(
    loser,
    Math.floor(MAX_HIGHLIGHTS / 2),
  );

  const highlights: string[] = [
    ...winnerPerformers.map((p) => buildPlayerHighlight(p, winner.teamName)),
    ...loserPerformers.map((p) => buildPlayerHighlight(p, loser.teamName)),
  ].slice(0, MAX_HIGHLIGHTS);

  return {
    headline,
    narrative,
    highlights,
    matchupType,
    winnerId,
  };
}

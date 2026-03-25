// ---------------------------------------------------------------------------
// Draft utility functions — rule-based pick commentary and intelligence
// ---------------------------------------------------------------------------

import {
  type DraftPickRecord,
  type DraftPlayer,
  type IntelligenceRecommendation,
} from './types';

// ---------------------------------------------------------------------------
// Commentary
// ---------------------------------------------------------------------------

/**
 * Returns a broadcaster-style quip for a pick announcement.
 * Uses early-return archetype matching then falls through to context lines.
 */
export function getDraftCommentary(
  player: DraftPlayer,
  round: number,
  isMyPick: boolean,
  isAuto: boolean,
): string {
  if (isAuto) {
    return `⏱ System auto-drafted ${player.name} — the clock ran out!`;
  }

  if (player.isPitcher) {
    const saves = player.saves ?? 0;
    const k = player.strikeouts ?? 0;
    const era = player.era ?? 99;

    if (saves > 30)
      return `🔒 ${player.name} is an elite closer — ${saves} saves is shutdown territory!`;
    if (saves > 15)
      return `💼 Solid closer ${player.name} brings ${saves} saves and bullpen stability.`;
    if (k > 200)
      return `🔥 ${player.name} is a strikeout machine — ${k} Ks will dominate the category!`;
    if (era < 3.0)
      return `📊 Elite ERA alert! ${player.name}'s ${era.toFixed(2)} ERA is lights-out.`;
  } else {
    const hr = player.hr;
    const sb = player.sb;
    const rbi = player.rbi;
    const avg = player.avg;

    if (hr > 40)
      return `💣 ${player.name} hits tape-measure shots — ${hr} home runs is elite power!`;
    if (hr > 30)
      return `⚡ Power pick! ${player.name} brings ${hr} home runs to the lineup.`;
    if (sb > 30)
      return `🏃 Speed demon! ${player.name} swiped ${sb} bags — stolen base gold.`;
    if (sb > 20)
      return `💨 ${player.name} has wheels — ${sb} stolen bases adds serious speed.`;
    if (rbi > 100)
      return `🎯 RBI machine! ${player.name}'s ${rbi} RBI means run production all season.`;
    if (avg > 0.32)
      return `📈 High average alert! ${player.name} at .${Math.round(avg * 1000)} is batting category gold.`;
  }

  // Pick-context fallbacks
  if (round <= 2)
    return `⭐ Premium pick! Grabbing ${player.name} early sets the foundation for this roster.`;
  if (round <= 5)
    return `📋 Smart mid-round selection — ${player.name} brings solid value at this spot.`;
  if (round >= 10)
    return `💎 Nice sleeper grab! ${player.name} could be a late-round steal.`;
  if (isMyPick) {
    const firstName = player.name.split(' ')[0];
    return `✅ Good pick! ${firstName} joins the roster — building something special here.`;
  }
  return `📋 ${player.name} off the board — another team adds value to their lineup.`;
}

// ---------------------------------------------------------------------------
// Draft Intelligence
// ---------------------------------------------------------------------------

/** Roster quota per position */
const ROSTER_SLOTS: Record<string, number> = {
  C: 1,
  '1B': 1,
  '2B': 1,
  '3B': 1,
  SS: 1,
  OF: 3,
  SP: 2,
  RP: 1,
};

function minMaxNorm(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return () => 0.5;
  return (v) => (v - min) / range;
}

/**
 * Computes top-5 draft recommendations using:
 *   Stat Value 50% + Positional Need 30% + Scarcity 20%
 *
 * Derives the available pool from statsLookup minus pickHistory,
 * so it is never limited by the active position filter.
 */
export function computeDraftIntelligence(
  statsLookup: Map<number, DraftPlayer>,
  pickHistory: DraftPickRecord[],
  myTeamId: number | null,
): IntelligenceRecommendation[] {
  // Available pool = all players minus already drafted ones
  const pickedIds = new Set(pickHistory.map((p) => p.playerId));
  const available = Array.from(statsLookup.values()).filter(
    (p) => !pickedIds.has(p.id),
  );

  if (available.length === 0) return [];

  // Separate groups for independent normalization
  const hitters = available.filter((p) => !p.isPitcher);
  const pitchers = available.filter((p) => p.isPitcher);

  // My current roster for positional need
  const myPickedIds = pickHistory
    .filter((p) => p.teamId === myTeamId)
    .map((p) => p.playerId);
  const myTeamPlayers = myPickedIds
    .map((id) => statsLookup.get(id))
    .filter((p): p is DraftPlayer => p !== undefined);

  const positionCount: Record<string, number> = {};
  for (const p of myTeamPlayers) {
    positionCount[p.position] = (positionCount[p.position] ?? 0) + 1;
  }

  const getPositionalNeed = (position: string): number => {
    const quota = ROSTER_SLOTS[position] ?? 1;
    const have = positionCount[position] ?? 0;
    if (have === 0) return 1.0;
    if (have < quota) return 0.5;
    return 0.0;
  };

  // Scarcity: 1 - (countAtPosition / maxCountAnyPosition)
  const availableByPos: Record<string, number> = {};
  for (const p of available) {
    availableByPos[p.position] = (availableByPos[p.position] ?? 0) + 1;
  }
  const maxCountAnyPos = Math.max(...Object.values(availableByPos), 1);

  const getScarcity = (position: string): number => {
    const count = availableByPos[position] ?? 0;
    return 1 - count / maxCountAnyPos;
  };

  // Stat scores — hitters
  type Scored = { player: DraftPlayer; statScore: number };
  const scoredHitters: Scored[] = [];
  if (hitters.length > 0) {
    const normHr = minMaxNorm(hitters.map((p) => p.hr));
    const normRbi = minMaxNorm(hitters.map((p) => p.rbi));
    const normAvg = minMaxNorm(hitters.map((p) => p.avg));
    const normSb = minMaxNorm(hitters.map((p) => p.sb));
    const normObp = minMaxNorm(hitters.map((p) => p.obp));
    const normSlg = minMaxNorm(hitters.map((p) => p.slg));
    for (const p of hitters) {
      const statScore =
        normHr(p.hr) * 0.25 +
        normRbi(p.rbi) * 0.2 +
        normAvg(p.avg) * 0.2 +
        normSb(p.sb) * 0.15 +
        normObp(p.obp) * 0.1 +
        normSlg(p.slg) * 0.1;
      scoredHitters.push({ player: p, statScore });
    }
  }

  // Stat scores — pitchers (ERA and WHIP are inverted)
  const scoredPitchers: Scored[] = [];
  if (pitchers.length > 0) {
    const normK = minMaxNorm(pitchers.map((p) => p.strikeouts ?? 0));
    const normW = minMaxNorm(pitchers.map((p) => p.wins ?? 0));
    const normSv = minMaxNorm(pitchers.map((p) => p.saves ?? 0));
    const normEraRaw = minMaxNorm(pitchers.map((p) => p.era ?? 99));
    const normWhipRaw = minMaxNorm(pitchers.map((p) => p.whip ?? 99));
    for (const p of pitchers) {
      const statScore =
        normK(p.strikeouts ?? 0) * 0.25 +
        (1 - normEraRaw(p.era ?? 99)) * 0.25 +
        normW(p.wins ?? 0) * 0.2 +
        normSv(p.saves ?? 0) * 0.15 +
        (1 - normWhipRaw(p.whip ?? 99)) * 0.15;
      scoredPitchers.push({ player: p, statScore });
    }
  }

  // Combine and compute final score
  const recommendations: IntelligenceRecommendation[] = [
    ...scoredHitters,
    ...scoredPitchers,
  ].map(({ player, statScore }) => {
    const posNeed = getPositionalNeed(player.position);
    const scarcity = getScarcity(player.position);
    const score = statScore * 0.5 + posNeed * 0.3 + scarcity * 0.2;

    // Top 2 display stats
    const topStats: Array<{ label: string; value: string }> = player.isPitcher
      ? [
          { label: 'ERA', value: player.era?.toFixed(2) ?? '—' },
          { label: 'K', value: String(player.strikeouts ?? 0) },
        ]
      : [
          { label: 'AVG', value: player.avg.toFixed(3) },
          { label: 'HR', value: String(player.hr) },
        ];

    // Reason string
    let reason: string;
    if (posNeed === 1.0) {
      reason = `Fills your empty ${player.position} slot`;
    } else if (posNeed === 0.5) {
      reason = `Adds depth at ${player.position}`;
    } else if (scarcity > 0.7) {
      reason = `Only ${availableByPos[player.position] ?? 0} ${player.position}s left`;
    } else {
      reason = `Top rated ${player.position} available`;
    }

    return { player, score, topStats, reason };
  });

  return recommendations.sort((a, b) => b.score - a.score).slice(0, 5);
}

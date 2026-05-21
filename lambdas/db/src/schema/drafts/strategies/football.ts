/**
 * Football auto-pick strategy — positional-need fill order with mock FPG.
 *
 * Real football stats land in a separate follow-up outside epic LS-4568. Until
 * then, players with no projected FPG get a deterministic mock value seeded by
 * (position archetype + playerId) so the strategy produces sensible, stable
 * rosters against the mock player pool.
 *
 * Roster fill priority per the ADR-0011 §5 spec: QB → RB → WR → TE → K → DEF
 * → FLEX → BENCH. The strategy walks the unfilled slot types in this canonical
 * order and selects the highest-FPG candidate for the first slot type with an
 * eligible player.
 */

import type { AutoPickScore, AutoPickStrategy } from './types';
import type { PlayerDraftInfo } from '../candidate-pool';

/**
 * Football slot type → eligible stat positions. Mirrors the future
 * `ALLOWED_POSITIONS_BY_SPORT['football']` entry from ADR-0011 §3.
 * Kept local to this strategy until that shared map lands (slice [3/10]).
 *
 * Note on DEF: most fantasy providers expose team defenses as a single 'DEF'
 * stat position; 'DST' is included to be compatible with feeds that use the
 * alternate label.
 */
export const ALLOWED_POSITIONS_FOOTBALL: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF', 'DST'],
  FLEX: ['RB', 'WR', 'TE'],
});

/** Canonical fill order for unfilled slots — earlier entries are higher priority. */
const FOOTBALL_FILL_ORDER: readonly string[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DEF',
  'FLEX',
];

/** Mock baseline projected matchup points by stat position. */
const MOCK_FPG_BY_POSITION: Readonly<Record<string, number>> = Object.freeze({
  QB: 24,
  RB: 16,
  WR: 13,
  TE: 10,
  K: 8,
  DEF: 9,
  DST: 9,
});

/**
 * Deterministic per-player jitter so equal-archetype players sort stably and
 * differently. Range: roughly [-2.0, +2.0).
 */
function jitterFromPlayerId(playerId: number): number {
  // Simple LCG-style hash keeps output deterministic across runs and platforms.
  const hashed = ((playerId * 2654435761) >>> 0) % 4000;
  return hashed / 1000 - 2.0;
}

/**
 * Effective FPG for football scoring. Real stats win if present; otherwise we
 * fall back to a position-archetype baseline + per-player jitter.
 */
export function effectiveFootballFpg(
  info: PlayerDraftInfo,
  id: number,
): number {
  if (info.fpg > 0) return info.fpg;
  let baseline = 0;
  for (const pos of info.positions) {
    const candidate = MOCK_FPG_BY_POSITION[pos] ?? 0;
    if (candidate > baseline) baseline = candidate;
  }
  if (baseline === 0) return 0;
  return Math.max(0, baseline + jitterFromPlayerId(id));
}

function pickBestForSlot(
  playerDraftInfo: Map<number, PlayerDraftInfo>,
  slotType: string,
): { playerId: number; fpg: number } | undefined {
  const allowedStatPositions = ALLOWED_POSITIONS_FOOTBALL[slotType] ?? [
    slotType,
  ];
  let bestId: number | undefined;
  let bestFpg = -Infinity;
  for (const [id, info] of playerDraftInfo) {
    if (!allowedStatPositions.some((sp) => info.positions.includes(sp))) {
      continue;
    }
    const fpg = effectiveFootballFpg(info, id);
    if (fpg > bestFpg) {
      bestFpg = fpg;
      bestId = id;
    }
  }
  return bestId === undefined ? undefined : { playerId: bestId, fpg: bestFpg };
}

function scoreForUnfilledPositions(
  playerDraftInfo: Map<number, PlayerDraftInfo>,
  unfilledPositionTypes: string[],
): AutoPickScore {
  if (unfilledPositionTypes.length === 0) {
    return { playerId: undefined, reason: '' };
  }

  // Walk the canonical priority order; honor only slots the team still needs.
  const unfilledSet = new Set(unfilledPositionTypes);
  const orderedUnfilled = FOOTBALL_FILL_ORDER.filter((slot) =>
    unfilledSet.has(slot),
  );
  // Slot types in unfilledPositionTypes that aren't in the canonical order
  // (e.g. BENCH or custom league slots) sort after the canonical ones.
  for (const slot of unfilledPositionTypes) {
    if (!orderedUnfilled.includes(slot)) orderedUnfilled.push(slot);
  }

  for (const slotType of orderedUnfilled) {
    const best = pickBestForSlot(playerDraftInfo, slotType);
    if (best) {
      return {
        playerId: best.playerId,
        reason: `Best available for ${slotType} — ${best.fpg.toFixed(1)} projected matchup pts`,
      };
    }
  }

  return { playerId: undefined, reason: '' };
}

export const footballStrategy: AutoPickStrategy = {
  sport: 'football',
  scoreForUnfilledPositions,
};

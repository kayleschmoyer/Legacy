/**
 * Football auto-pick strategy — positional-need fill order with mock FPG.
 *
 * Callers (candidate-pool.ts) now feed `PlayerDraftInfo.fpg` from the real
 * football_player_scoring_cache when a player has one (LS-9484). Any player
 * without a cache row yet — or without enough career stats to produce a
 * nonzero score — still gets a deterministic mock value seeded by (position
 * archetype + playerId) here, so the strategy always produces sensible,
 * stable rosters even for thin data.
 *
 * Roster fill priority per the ADR-0011 §5 spec: QB → RB → WR → TE → K → DEF
 * → FLEX → BENCH. The strategy walks the unfilled slot types in this canonical
 * order and selects the highest-FPG candidate for the first slot type with an
 * eligible player.
 */

import type { AutoPickScore, AutoPickStrategy } from './types';
import type { PlayerDraftInfo } from '../candidate-pool';

/**
 * Football slot type → eligible stat positions. Mirrors
 * `ALLOWED_POSITIONS_BY_SPORT['football']` (@legacy-sports/utils).
 * Kept local to this strategy for historical reasons (slice [3/10]) but must
 * stay in sync with that shared map — see strategies/football.spec.ts's
 * LS-4763 parity test.
 *
 * DST (team defense) and DL/LB/DB (individual defensive players) are two
 * mutually-exclusive slot vocabularies selected by a league's
 * `defensiveFormat` (LS-9475) — a league only ever configures one, so having
 * both sets of keys here is harmless: `pickBestForSlot` is only ever called
 * with slot types the league's own `leaguePositions` actually contains. The
 * real roster slot key is 'DST', never 'DEF' — a prior version of this map
 * used 'DEF' as the canonical key, which no real league_positions row ever
 * matches (LS-9475 postmortem: that branch was silently dead).
 */
export const ALLOWED_POSITIONS_FOOTBALL: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DST: ['DST'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
  FLEX: ['RB', 'WR', 'TE'],
  BENCH: ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DL', 'LB', 'DB'],
});

/**
 * Canonical fill order for unfilled slots — earlier entries are higher
 * priority. Includes both defensive-format vocabularies (see comment above);
 * only the slot types present in a given league's unfilled set are ever
 * walked, so an idp league never reaches 'DST' and vice versa.
 */
const FOOTBALL_FILL_ORDER: readonly string[] = [
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST',
  'DL',
  'LB',
  'DB',
  'FLEX',
];

/**
 * Position-archetype baseline used to ORDER candidates when no projection has
 * been served. These are ranking weights, not measurements — never surface one
 * to a user as a projected total (LS-9476). IDP weights are lower than
 * offensive skill positions, ordered LB > DL > DB per typical tackle-heavy
 * IDP scoring (LS-9475) — real scoring settings will supersede this once a
 * football scoring cache exists (LS-9484).
 */
export const MOCK_FPG_BY_POSITION: Readonly<Record<string, number>> =
  Object.freeze({
    QB: 24,
    RB: 16,
    WR: 13,
    TE: 10,
    K: 8,
    DST: 9,
    LB: 7,
    DL: 6,
    DB: 5,
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

/**
 * True when the player carries a real served projection rather than the
 * position-archetype baseline. `effectiveFootballFpg` treats any `fpg > 0` as
 * real, so this is the same test it branches on — kept beside it so the two
 * cannot drift.
 */
function hasServedProjection(info: PlayerDraftInfo): boolean {
  return info.fpg > 0;
}

function pickBestForSlot(
  playerDraftInfo: Map<number, PlayerDraftInfo>,
  slotType: string,
): { playerId: number; fpg: number; projected: boolean } | undefined {
  const allowedStatPositions = ALLOWED_POSITIONS_FOOTBALL[slotType] ?? [
    slotType,
  ];
  let bestId: number | undefined;
  let bestFpg = -Infinity;
  let bestProjected = false;
  for (const [id, info] of playerDraftInfo) {
    if (!allowedStatPositions.some((sp) => info.positions.includes(sp))) {
      continue;
    }
    const fpg = effectiveFootballFpg(info, id);
    if (fpg > bestFpg) {
      bestFpg = fpg;
      bestId = id;
      bestProjected = hasServedProjection(info);
    }
  }
  return bestId === undefined
    ? undefined
    : { playerId: bestId, fpg: bestFpg, projected: bestProjected };
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
        // Only quote a number when one was actually served. The archetype
        // baseline exists to ORDER candidates, not to measure them: with
        // players.projected_fantasy_points unset league-wide every football
        // player takes that path, so quoting it printed an invented figure
        // to the draft room as though it were a projection (LS-9476).
        reason: best.projected
          ? `Best available for ${slotType} — ${best.fpg.toFixed(1)} projected matchup pts`
          : `Best available for ${slotType} — ranked by position (no projection available)`,
      };
    }
  }

  return { playerId: undefined, reason: '' };
}

export const footballStrategy: AutoPickStrategy = {
  sport: 'football',
  scoreForUnfilledPositions,
};

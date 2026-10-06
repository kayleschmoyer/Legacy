/**
 * Drag-and-drop eligibility for the live draft board (LS-8068).
 *
 * The draft "My Roster" rail renders one row per depth-chart bucket — the
 * league's configured slot types from `buildRosterSlotInstances` (LS-10501),
 * e.g. C / 1B / OF / P / DH / BENCH for baseball, QB / RB / FLEX / SFLEX /
 * DST / DL / BENCH for football. When a player card is dragged onto one of
 * those rows we need to know whether the player may fill that slot so the
 * drop either drafts them or is rejected with a toast.
 *
 * Bucket keys are league `position_slot` codes, so they map straight onto the
 * canonical `ALLOWED_POSITIONS_BY_SPORT` eligibility table. Two keys need
 * translation:
 *   - baseball `P` → any pitching position (the SP/RP rows collapse into one
 *     `P` bucket, see `buildDepthChartBuckets`)
 *   - `BENCH` (synthetic overflow bucket, any sport) → anyone
 *
 * An empty / missing eligibility list is treated as universally eligible — the
 * server-side draft mutation is the final gate, matching `canPlayerPlayPosition`
 * in features/roster/rosterEligibility.ts.
 */
import {
  ALLOWED_POSITIONS_BY_SPORT,
  PITCHING_POSITIONS,
} from '@legacy-sports/utils';
import { BENCH_SLOT } from './rosterSlots';
import type { Sport } from '../../utils/colors';

/**
 * Resolves the canonical stat-positions that satisfy a rail display slot,
 * or `undefined` when the slot code is unknown for the sport.
 */
function allowedPositionsForSlot(
  sport: Sport,
  slotPos: string,
): readonly string[] | undefined {
  const map = ALLOWED_POSITIONS_BY_SPORT[sport];
  if (sport === 'baseball' && slotPos === 'P') return [...PITCHING_POSITIONS];
  return map[slotPos];
}

/**
 * True when a player with the given eligible positions may be dropped onto the
 * rail display slot `slotPos` for the active `sport`.
 */
export function isPlayerEligibleForSlot(
  sport: Sport,
  slotPos: string,
  eligiblePositions: readonly string[] | null | undefined,
): boolean {
  const eligible = eligiblePositions ?? [];
  // No classification data — defer to the server (final gate).
  if (eligible.length === 0) return true;
  // The bench takes any player.
  if (slotPos === BENCH_SLOT) return true;
  const allowed = allowedPositionsForSlot(sport, slotPos);
  if (!allowed) return false;
  return eligible.some((p) => allowed.includes(p));
}

/**
 * Drag-and-drop eligibility for the live draft board (LS-8068).
 *
 * The draft "My Roster" rail renders depth-chart display slots (C / 1B / OF /
 * P / UTIL for baseball, QB / RB / FLEX / DEF for football). When a player card
 * is dragged onto one of those rows we need to know whether the player may fill
 * that slot so the drop either drafts them or is rejected with a toast.
 *
 * The display slot codes used by the rail (`DraftRail.getPositionSlotsForSport`)
 * are a superset/relabeling of the league `position_slot` codes, so we map them
 * onto the canonical `ALLOWED_POSITIONS_BY_SPORT` eligibility table rather than
 * duplicating the position rules. Two display-only codes need translation:
 *   - baseball `P`  → any pitching position (SP / RP / P)
 *   - baseball `U`  (UTIL) → any batter (mirrors the DH "any non-pitcher" rule)
 *   - football `DEF` → the canonical `DST` team-defense slot
 *
 * An empty / missing eligibility list is treated as universally eligible — the
 * server-side draft mutation is the final gate, matching `canPlayerPlayPosition`
 * in features/roster/rosterEligibility.ts.
 */
import {
  ALLOWED_POSITIONS_BY_SPORT,
  PITCHING_POSITIONS,
} from '@legacy-sports/utils';
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
  if (sport === 'baseball') {
    if (slotPos === 'P') return [...PITCHING_POSITIONS];
    // UTIL accepts any batter — reuse the DH "any non-pitcher" eligibility list.
    if (slotPos === 'U') return map['DH'];
    return map[slotPos];
  }
  // Football: the rail labels the team-defense slot "DEF"; canonical code is "DST".
  if (slotPos === 'DEF') return map['DST'];
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
  const allowed = allowedPositionsForSlot(sport, slotPos);
  if (!allowed) return false;
  return eligible.some((p) => allowed.includes(p));
}

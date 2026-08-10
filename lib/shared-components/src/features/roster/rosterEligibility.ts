/**
 * Cross-platform roster eligibility + classification utilities.
 *
 * Extracted from the web league-detail v2 `RosterBoardV2` and the native
 * `LeagueRosterManagement` so both platforms share one source of truth for
 * "can this player fill this slot", batter/pitcher classification, and slot
 * labels (LS-7813, epic LS-7708). Operates on platform-agnostic minimal shapes
 * so it stays decoupled from each app's generated GraphQL fragments.
 */
import {
  ALLOWED_POSITIONS_BY_SPORT,
  PITCHING_POSITIONS,
} from '@legacy-sports/utils';

/** Minimal player shape the roster helpers need (structurally satisfied by
 *  both web and native `TeamMemberFragment`). */
export interface RosterEligiblePlayer {
  player?: {
    eligiblePositions?: readonly string[] | null;
  } | null;
}

/** Slot types that represent a pitching position on the board. */
const PITCHER_SLOTS = new Set(['SP', 'RP', 'P']);

/** True when a league-position slot type is a pitching slot. */
export function isPitcherSlot(
  positionType: string | null | undefined,
): boolean {
  return PITCHER_SLOTS.has((positionType ?? '').toUpperCase());
}

/** Returns the player's eligible position strings (empty when unclassified). */
export function getEligiblePositions(player: RosterEligiblePlayer): string[] {
  return [...(player.player?.eligiblePositions ?? [])];
}

/** True when every eligible position is a pitching position. */
export function playerHasPitchingOnly(player: RosterEligiblePlayer): boolean {
  const eligible = getEligiblePositions(player);
  if (eligible.length === 0) return false;
  return eligible.every((p) => PITCHING_POSITIONS.has(p));
}

/** True when the player has at least one non-pitching (batting) position.
 *  Unclassified players (no eligibility data) default to the hitters group. */
export function playerHasBatting(player: RosterEligiblePlayer): boolean {
  const eligible = getEligiblePositions(player);
  if (eligible.length === 0) return true;
  return eligible.some((p) => !PITCHING_POSITIONS.has(p));
}

/** True when the player has at least one pitching-eligible position. */
export function isPlayerPitcher(player: RosterEligiblePlayer): boolean {
  return getEligiblePositions(player).some((p) => PITCHING_POSITIONS.has(p));
}

/** True when the player has at least one batting-eligible position. */
export function isPlayerBatter(player: RosterEligiblePlayer): boolean {
  return getEligiblePositions(player).some((p) => !PITCHING_POSITIONS.has(p));
}

/** True when the player qualifies as both a pitcher and a position player. */
export function isDualEligible(player: RosterEligiblePlayer): boolean {
  return isPlayerPitcher(player) && isPlayerBatter(player);
}

/**
 * True when `player` may be assigned to a slot of `positionType`.
 *
 * Mirrors the web canonical rule: an empty eligibility list is treated as
 * universally eligible (the server-side mutation is the final gate), otherwise
 * the player must be eligible for one of the positions the slot accepts.
 *
 * `sport` selects the eligibility crosswalk (defaults to baseball, this
 * function's original behavior — LS-5421 added the football table).
 */
export function canPlayerPlayPosition(
  player: RosterEligiblePlayer,
  positionType: string | null | undefined,
  sport: 'baseball' | 'football' = 'baseball',
): boolean {
  const eligible = getEligiblePositions(player);
  if (eligible.length === 0) return true;
  const allowed = ALLOWED_POSITIONS_BY_SPORT[sport][positionType ?? ''];
  if (!allowed) return false;
  return eligible.some((p) => allowed.includes(p));
}

/** Human-readable labels for league-position slot types. */
export const POSITION_LABEL: Record<string, string> = {
  SP: 'Starting Pitcher',
  RP: 'Relief Pitcher',
  P: 'Pitcher',
  C: 'Catcher',
  '1B': '1st Base',
  '2B': '2nd Base',
  '3B': '3rd Base',
  SS: 'Shortstop',
  LF: 'Left Field',
  CF: 'Center Field',
  RF: 'Right Field',
  OF: 'Outfield',
  IF: 'Infield',
  UTIL: 'Utility',
  DH: 'Designated Hitter',
  XDH: 'Extra Hitter',
  // Football (NFL) position/slot codes — mirrors Android's SLOT_LABELS in
  // FootballLeagueRosterScreen.tsx so slot labels match across platforms.
  QB: 'Quarterback',
  RB: 'Running Back',
  WR: 'Wide Receiver',
  TE: 'Tight End',
  FLEX: 'Flex',
  K: 'Kicker',
  DST: 'Defense / Special Teams',
  DL: 'Defensive Lineman',
  LB: 'Linebacker',
  DB: 'Defensive Back',
};

/** Returns the label for a slot type, falling back to the upper-cased code. */
export function getPositionLabel(
  positionType: string | null | undefined,
): string {
  const code = (positionType ?? '').toUpperCase();
  return POSITION_LABEL[code] ?? code;
}

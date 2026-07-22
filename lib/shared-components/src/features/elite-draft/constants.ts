// ---------------------------------------------------------------------------
// Shared constants for EliteDraftBoard
// ---------------------------------------------------------------------------

// LS-8578: POSITION_COLORS is re-exported from the canonical map — this file
// used to maintain its own divergent copy (baseball colors differed from
// canonical on every entry; football was missing DST/DL/LB/DB). The
// canonical map was promoted onto this file's baseball palette, so this is
// now a single source of truth, not a duplicate.
export { POSITION_COLORS } from '../../utils/colors';

export const TIMER_RADIUS = 50;
export const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
export const DEFAULT_PICK_TIME = 120; // matches server default

export const DEFAULT_NUM_TEAMS = 12;

export const CONFETTI_COLORS = [
  '#C5A55A',
  '#22C55E',
  '#3B82F6',
  '#F59E0B',
  '#8b5cf6',
  '#C41E3A',
  '#1B3A5C',
  '#D4BB78',
];

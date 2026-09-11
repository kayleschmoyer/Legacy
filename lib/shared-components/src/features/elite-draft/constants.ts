// ---------------------------------------------------------------------------
// Shared constants for EliteDraftBoard
// ---------------------------------------------------------------------------

import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED,
  POS_DST,
  POS_WR,
  TEXT_PRIMARY,
} from '../../utils/colors';

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

/**
 * Rendered height of the bottom-pinned positions-drafted slot strip
 * (LS-10004). Lives here rather than in `DraftSlotStrip.tsx` so `styles.ts`
 * can shorten `.d-layout` by exactly this much without importing a component:
 * the strip overlays the board, and the board must not run underneath it.
 */
export const DRAFT_SLOT_STRIP_HEIGHT_PX = 64;

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

/**
 * Brand palette for the Draft Room v2 my-pick splash confetti (LS-9402,
 * README "My-pick splash (overlay)") — distinct from CONFETTI_COLORS above,
 * which belongs to the pre-v2 DraftPickAnnouncement burst. Sourced from the
 * canonical design-token exports (theme-compliance ratchet, LS-8519) rather
 * than the design handoff's literal hex values — gold/goldLight/seamRed/fg1
 * match exactly; the WR and DST position colors are the closest canonical
 * stand-ins for the handoff's green/blue accents.
 */
export const SPLASH_CONFETTI_COLORS = [
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED,
  TEXT_PRIMARY,
  POS_WR,
  POS_DST,
];

// ---------------------------------------------------------------------------
// Shared constants for EliteDraftBoard
// ---------------------------------------------------------------------------

import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
} from '../../utils/colors';

export const POSITION_COLORS: Record<string, string> = {
  C: BRAND_SEAM_RED, // seam red
  '1B': '#B5651D', // warm amber
  '2B': BRAND_GOLD, // heritage gold
  '3B': '#2D6A4F', // forest green
  SS: BRAND_NAVY_LIGHT, // navy blue
  OF: '#64748B', // slate — replaces banned purple
  P: '#4A708B', // steel blue — replaces banned cyan
  SP: '#4A708B', // steel blue — replaces banned cyan
  RP: '#2E7D6E', // forest teal
  DH: '#8B2635', // burgundy
};

// Football position colors — sourced from the draft-board mockup's gridiron
// theme. Pre-stages the shared token vocabulary planned in ADR 0011 §3; once
// the sport-scoped getPositionColor(sport, pos) lands these will migrate to
// `lib/shared-components/src/utils/colors.ts`.
export const FOOTBALL_POSITION_COLORS: Record<string, string> = {
  QB: BRAND_SEAM_RED, // seam red
  RB: '#8B6F47', // dirt brown
  WR: '#2D6A4F', // turf green
  TE: '#7C8794', // steel
  K: BRAND_GOLD, // heritage gold
  DEF: '#4A6FA5', // navy blue
  FLEX: '#C49A6C', // muted gold
};

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

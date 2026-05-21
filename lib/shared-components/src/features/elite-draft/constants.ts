// ---------------------------------------------------------------------------
// Shared constants for EliteDraftBoard
// ---------------------------------------------------------------------------

import {
  BRAND_GOLD,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  POS_DEF,
  POS_FLEX,
  POS_K,
  POS_QB,
  POS_RB,
  POS_TE,
  POS_WR,
  type Sport,
} from '../../utils/colors';

export const POSITION_COLORS: Record<Sport, Record<string, string>> = {
  baseball: {
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
  },
  football: {
    QB: POS_QB,
    RB: POS_RB,
    WR: POS_WR,
    TE: POS_TE,
    K: POS_K,
    DEF: POS_DEF,
    FLEX: POS_FLEX,
  },
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

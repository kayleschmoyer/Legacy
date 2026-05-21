// ---------------------------------------------------------------------------
// Shared utility functions for EliteDraftBoard
// ---------------------------------------------------------------------------

import { FOOTBALL_POSITION_COLORS, POSITION_COLORS } from './constants';

export type DraftSport = 'baseball' | 'football';

const FALLBACK_POSITION_COLOR = '#6b7280';

export const getPositionColor = (position: string): string =>
  POSITION_COLORS[position] || FALLBACK_POSITION_COLOR;

// Sport-scoped lookup — pre-stages the `getPositionColor(sport, pos)` shape
// from ADR 0011 §3 while the baseball-only helper above remains the default
// for existing callers.
export const getPositionColorForSport = (
  sport: DraftSport,
  position: string,
): string => {
  const table =
    sport === 'football' ? FOOTBALL_POSITION_COLORS : POSITION_COLORS;
  return table[position] || FALLBACK_POSITION_COLOR;
};

export const normalizeTeamId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Collapse a raw player position into the 5-bucket vocabulary the Draft Board
 * design system uses for color accents (--pos-p, --pos-c, --pos-if, --pos-of,
 * --pos-u). Returns null when the input doesn't map (e.g. unknown/missing
 * position) so callers can omit data-pos rather than fall through to a default.
 */
export const normalizeDraftPosition = (
  position: string | null | undefined,
): 'P' | 'C' | 'IF' | 'OF' | 'U' | null => {
  if (!position) return null;
  switch (position.toUpperCase()) {
    case 'P':
    case 'SP':
    case 'RP':
      return 'P';
    case 'C':
      return 'C';
    case '1B':
    case '2B':
    case '3B':
    case 'SS':
      return 'IF';
    case 'OF':
    case 'CF':
    case 'LF':
    case 'RF':
      return 'OF';
    case 'DH':
    case 'UTIL':
    case 'U':
      return 'U';
    default:
      return null;
  }
};

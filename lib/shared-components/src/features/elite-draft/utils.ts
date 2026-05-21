// ---------------------------------------------------------------------------
// Shared utility functions for EliteDraftBoard
// ---------------------------------------------------------------------------

import { POSITION_COLORS } from './constants';
import type { Sport } from '../../utils/colors';

export const getPositionColor = (sport: Sport, position: string): string =>
  POSITION_COLORS[sport][position] || '#6b7280';

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

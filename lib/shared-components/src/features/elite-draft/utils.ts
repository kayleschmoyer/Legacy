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

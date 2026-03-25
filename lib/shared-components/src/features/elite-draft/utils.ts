// ---------------------------------------------------------------------------
// Shared utility functions for EliteDraftBoard
// ---------------------------------------------------------------------------

import { POSITION_COLORS } from './constants';

export const getPositionColor = (position: string): string =>
  POSITION_COLORS[position] || '#6b7280';

export const normalizeTeamId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

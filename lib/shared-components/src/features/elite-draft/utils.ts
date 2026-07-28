// ---------------------------------------------------------------------------
// Shared utility functions for EliteDraftBoard
// ---------------------------------------------------------------------------

import { POSITION_COLORS } from './constants';
import type { Sport } from '../../utils/colors';

export const getPositionColor = (sport: Sport, position: string): string =>
  POSITION_COLORS[sport][position] || '#6b7280';

export const normalizeTeamId = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

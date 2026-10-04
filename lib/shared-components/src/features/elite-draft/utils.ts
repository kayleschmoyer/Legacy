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

/**
 * Display label listing every position a player is eligible at, primary
 * first — e.g. "OF, C" (LS-10472). The position filter matches on ANY
 * eligible position, so showing only the primary made C-eligible outfielders
 * look like they leaked through the C filter. Display-only: slot fitting and
 * pitcher detection keep using `position` / `eligiblePositions` directly.
 */
export const formatEligiblePositions = (player: {
  position: string;
  eligiblePositions?: readonly string[] | null;
}): string => {
  const positions = [player.position];
  for (const p of player.eligiblePositions ?? []) {
    if (p && !positions.includes(p)) positions.push(p);
  }
  return positions.filter(Boolean).join(', ');
};

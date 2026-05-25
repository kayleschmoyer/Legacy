/** Canonical single source of truth for per-sport roster defaults.
 *
 * Imported by lambdas/db, lib/db-client, and lib/shared-components.
 * Keep this file free of UI or framework dependencies.
 */

import type { SportKind } from './allowed-positions';

/** Default starting roster slots for a new baseball league (DST format). */
export const DEFAULT_BASEBALL_ROSTER_POSITIONS = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'OF',
  'OF',
  'DH',
  'SP',
  'SP',
  'SP',
  'SP',
  'SP',
  'RP',
  'RP',
  'RP',
] as const;

/** Default starting roster slots for a new football league (DST format). */
export const DEFAULT_FOOTBALL_ROSTER_POSITIONS = [
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
] as const;

export const DEFAULT_ROSTER_POSITIONS_BY_SPORT = {
  baseball: DEFAULT_BASEBALL_ROSTER_POSITIONS,
  football: DEFAULT_FOOTBALL_ROSTER_POSITIONS,
} as const;

/** Default max roster size per sport (starters + bench + IR). */
export const DEFAULT_ROSTER_SIZE_BY_SPORT: Record<SportKind, number> = {
  baseball: 25,
  football: 16,
};

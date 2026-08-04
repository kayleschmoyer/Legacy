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

/** Default starting roster slots for a new football league (IDP format).
 *  Mirrors the DL/LB/DB starter counts in
 *  apps/web/src/components/leagues/wizard/StepRosterSettings.tsx's
 *  IDP_ROSTER_DEFAULTS (LS-6134). The DP (IDP Flex) slot is deliberately
 *  absent — it has no player-query or eligibility support (LS-6148). */
export const DEFAULT_FOOTBALL_IDP_ROSTER_POSITIONS = [
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DL',
  'DL',
  'LB',
  'LB',
  'DB',
  'DB',
] as const;

export const DEFAULT_ROSTER_POSITIONS_BY_SPORT = {
  baseball: DEFAULT_BASEBALL_ROSTER_POSITIONS,
  football: DEFAULT_FOOTBALL_ROSTER_POSITIONS,
} as const;

/** Union of every position-slot literal used across the default roster
 *  arrays above (baseball, football DST, football IDP). */
export type DefaultRosterPositionSlot =
  | (typeof DEFAULT_BASEBALL_ROSTER_POSITIONS)[number]
  | (typeof DEFAULT_FOOTBALL_ROSTER_POSITIONS)[number]
  | (typeof DEFAULT_FOOTBALL_IDP_ROSTER_POSITIONS)[number];

/** Resolves the default starter roster positions for a league, accounting
 *  for football's defensiveFormat ('dst' vs 'idp'). Baseball ignores
 *  defensiveFormat (LS-6134). */
export function getDefaultRosterPositions(
  sport: keyof typeof DEFAULT_ROSTER_POSITIONS_BY_SPORT,
  defensiveFormat?: string | null,
): readonly DefaultRosterPositionSlot[] {
  if (sport === 'football' && defensiveFormat === 'idp') {
    return DEFAULT_FOOTBALL_IDP_ROSTER_POSITIONS;
  }
  return DEFAULT_ROSTER_POSITIONS_BY_SPORT[sport];
}

/** Default max roster size per sport (starters + bench + IR). */
export const DEFAULT_ROSTER_SIZE_BY_SPORT: Record<SportKind, number> = {
  baseball: 25,
  football: 16,
};

/** Per-sport gamesPerMatchup bounds. Football regular season cap: 17 games. */
export const GAMES_PER_MATCHUP_BY_SPORT: Record<
  SportKind,
  { min: number; max: number; default: number }
> = {
  baseball: { min: 1, max: 162, default: 5 },
  football: { min: 1, max: 17, default: 5 },
};

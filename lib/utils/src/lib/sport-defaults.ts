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

/** Upper-bound sentinel for an open-ended ("to present") era range. */
export const ERA_OPEN_END_YEAR = 9999;

/** Inclusive year boundaries and display name for a pre-defined era. */
export interface EraYearRange {
  start: number;
  end: number;
  label: string;
}

/**
 * Canonical year boundaries for every pre-defined era, keyed by sport then by
 * `era_filter` enum value (LS-10689). The backend draft-pool filters
 * (`lib/db-client` DraftUtils / PlayerService) and every UI surface that shows
 * an era's years (create wizard, Commissioner Draft Settings, home summary)
 * derive from this table — never hardcode an era's years elsewhere.
 */
export const ERA_YEAR_RANGES_BY_SPORT: Record<
  SportKind,
  Readonly<Record<string, EraYearRange>>
> = {
  baseball: {
    dead_ball: { start: 1871, end: 1919, label: 'Dead Ball Era' },
    golden_age: { start: 1920, end: 1960, label: 'Golden Age' },
    expansion: { start: 1961, end: 1976, label: 'Expansion Era' },
    free_agency: { start: 1977, end: 1993, label: 'Free Agency Era' },
    steroid_era: { start: 1994, end: 2005, label: 'Steroid Era' },
    modern: { start: 2006, end: ERA_OPEN_END_YEAR, label: 'Modern Era' },
  },
  football: {
    pioneer: { start: 1920, end: 1945, label: 'Pioneer Era' },
    single_platoon: { start: 1946, end: 1959, label: 'Single-Platoon Era' },
    super_bowl_era: { start: 1960, end: 1977, label: 'Super Bowl Era' },
    west_coast: { start: 1978, end: 1993, label: 'West Coast Era' },
    salary_cap_era: { start: 1994, end: 2010, label: 'Salary Cap Era' },
    spread_offense: {
      start: 2011,
      end: ERA_OPEN_END_YEAR,
      label: 'Spread Offense Era',
    },
  },
};

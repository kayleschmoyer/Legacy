/**
 * Sport-aware validation rules for createLeagueAndTeams.
 *
 * Mirrors the client-side datasets in
 * `apps/web/src/pages/baseball/LeagueCreatePage.tsx` (LS-4631) and the
 * design source at `docs/design/HI6N3yPYUzeh981B5SkXmw/legacy-sports-create-league/project/CreateForm.jsx`.
 *
 * The server is authoritative — the client maps are UX hints. A raw GraphQL
 * call that bypasses the web form must not be able to land a league with
 * eraFilter/playerPool/maxRosterSize values that are inconsistent with the
 * declared sport (LS-4684), or to claim a premium era without entitlement
 * (LS-4685).
 */

export type { SportKind } from '@legacy-sports/utils';
import type { SportKind } from '@legacy-sports/utils';
export {
  DEFAULT_ROSTER_SIZE_BY_SPORT,
  GAMES_PER_MATCHUP_BY_SPORT,
} from '@legacy-sports/utils';

/** Era IDs that are valid for each sport. `all` and `custom` are shared. */
export const VALID_ERAS_BY_SPORT: Record<SportKind, ReadonlySet<string>> = {
  baseball: new Set([
    'all',
    'dead_ball',
    'golden_age',
    'expansion',
    'free_agency',
    'steroid_era',
    'modern',
    'custom',
  ]),
  football: new Set([
    'all',
    'pioneer',
    'single_platoon',
    'super_bowl_era',
    'west_coast',
    'salary_cap_era',
    'spread_offense',
    'custom',
  ]),
};

/** Era IDs that do NOT require a premium subscription. */
export const FREE_ERA_IDS_BY_SPORT: Record<SportKind, ReadonlySet<string>> = {
  baseball: new Set(['all', 'modern']),
  football: new Set(['all', 'spread_offense']),
};

/** Player pool values that are valid for each sport. */
export const VALID_POOLS_BY_SPORT: Record<SportKind, ReadonlySet<string>> = {
  baseball: new Set(['all', 'nl', 'al']),
  football: new Set(['all', 'nfc', 'afc']),
};

export interface RosterRange {
  readonly min: number;
  readonly max: number;
}

/** Min/max roster size per sport. */
export const ROSTER_RANGE_BY_SPORT: Record<SportKind, RosterRange> = {
  baseball: { min: 15, max: 50 },
  football: { min: 10, max: 25 },
};

import {
  FOOTBALL_DST_DATA_AVAILABLE,
  GAMES_PER_MATCHUP_BY_SPORT,
} from '@legacy-sports/utils';

/** True when gamesPerMatchup is within the sport's allowed range. */
export function isGamesPerMatchupValidForSport(
  sport: SportKind,
  gamesPerMatchup: number,
): boolean {
  const range = GAMES_PER_MATCHUP_BY_SPORT[sport];
  return gamesPerMatchup >= range.min && gamesPerMatchup <= range.max;
}

/** Re-export for resolvers that need the bounds object (e.g. to build error messages). */
export { GAMES_PER_MATCHUP_BY_SPORT as GAMES_PER_MATCHUP_RANGE_BY_SPORT } from '@legacy-sports/utils';

/** Normalize an arbitrary input to a known SportKind, defaulting to baseball. */
export function normalizeSport(value: string | null | undefined): SportKind {
  return value === 'football' ? 'football' : 'baseball';
}

/** True when the given era id is allowed for the given sport. */
export function isEraValidForSport(sport: SportKind, era: string): boolean {
  return VALID_ERAS_BY_SPORT[sport].has(era);
}

/** True when the given era id is free (no premium entitlement required). */
export function isEraFreeForSport(sport: SportKind, era: string): boolean {
  return FREE_ERA_IDS_BY_SPORT[sport].has(era);
}

/** True when the given player pool value is allowed for the given sport. */
export function isPoolValidForSport(sport: SportKind, pool: string): boolean {
  return VALID_POOLS_BY_SPORT[sport].has(pool);
}

/** True when the roster size is within the sport's allowed range. */
export function isRosterSizeValidForSport(
  sport: SportKind,
  size: number,
): boolean {
  const range = ROSTER_RANGE_BY_SPORT[sport];
  return size >= range.min && size <= range.max;
}

/** Earliest historically valid year for a sport's custom era range (first professional season). */
export const CUSTOM_ERA_MIN_YEAR_BY_SPORT: Record<SportKind, number> = {
  baseball: 1871,
  football: 1920,
};

/** True when a custom era year is between the sport's min year and the current year, inclusive. */
export function isCustomEraYearValidForSport(
  sport: SportKind,
  year: number,
  currentYear: number = new Date().getFullYear(),
): boolean {
  return year >= CUSTOM_ERA_MIN_YEAR_BY_SPORT[sport] && year <= currentYear;
}

/**
 * Custom era bounds to persist (LS-10500). The years only mean something for
 * the `custom` era; stray values left over from a switch back to another era
 * are ignored rather than stored.
 */
export function resolveCustomEraYears(
  eraFilter: string | null | undefined,
  startYear: number | null | undefined,
  endYear: number | null | undefined,
): { customEraStartYear: number | null; customEraEndYear: number | null } {
  if (eraFilter !== 'custom') {
    return { customEraStartYear: null, customEraEndYear: null };
  }
  return {
    customEraStartYear: startYear ?? null,
    customEraEndYear: endYear ?? null,
  };
}

/**
 * False when a new league asks for a defensive format whose players don't
 * exist yet (LS-10727). A D/ST football league has a required DST roster
 * slot, and no team-defense players exist until the ingest ships, so the
 * slot could never be filled. Only creation is gated: existing D/ST leagues
 * keep their format, and auto-pick already falls back to a bench pick when
 * no DST candidate exists.
 */
export function isDefensiveFormatAvailable(
  sport: SportKind,
  defensiveFormat: string | null | undefined,
  dstAvailable: boolean = FOOTBALL_DST_DATA_AVAILABLE,
): boolean {
  return sport !== 'football' || defensiveFormat !== 'dst' || dstAvailable;
}

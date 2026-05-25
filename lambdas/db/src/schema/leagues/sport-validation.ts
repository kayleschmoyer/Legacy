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
export { DEFAULT_ROSTER_SIZE_BY_SPORT } from '@legacy-sports/utils';

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
    'super_bowl',
    'west_coast',
    'salary_cap',
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

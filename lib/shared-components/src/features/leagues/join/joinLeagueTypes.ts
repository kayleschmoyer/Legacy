/**
 * Shared types for the two-tab Join League screen (LS-8812).
 *
 * Deliberately free of generated GraphQL types so both the mobile wrapper and
 * any future web consumer can map their own payloads onto these shapes.
 */

import type { Sport } from '../../../utils/colors';

export type { Sport };

/** Which tab of the Join screen is showing. */
export type JoinLeagueTab = 'invite' | 'browse';

/* ─── Invite code tab ─── */

/** The league behind a valid invite code — mirrors `InviteCodeInfo`. */
export interface InviteCodeLeague {
  leagueId?: number | null;
  leagueName?: string | null;
  totalSpots?: number | null;
  availableSpots?: number | null;
  isFull?: boolean | null;
  isAlreadyMember?: boolean | null;
}

/**
 * The five states the invite-code result card renders (AC4).
 *
 * `idle` is the sixth, card-less state: fewer than 8 characters entered, so
 * there is nothing to report yet.
 */
export type InviteCodeStatus =
  | 'idle'
  | 'checking'
  | 'valid'
  | 'invalid'
  | 'full'
  | 'alreadyMember';

export interface InviteCodeValidation {
  status: InviteCodeStatus;
  league: InviteCodeLeague | null;
}

/* ─── Browse tab ─── */

/** A public league row — mirrors `PublicLeagueInfo` (LS-8812 extended). */
export interface PublicLeagueRow {
  id?: number | null;
  name?: string | null;
  sport?: string | null;
  maxRosterSize?: number | null;
  draftStatus?: string | null;
  playerPool?: string | null;
  totalSpots?: number | null;
  numberOfTeams?: number | null;
  availableSpots?: number | null;
  isFull?: boolean | null;
  isAlreadyMember?: boolean | null;
  eraFilter?: string | null;
  selectionMethod?: string | null;
  draftOrder?: string | null;
  draftDate?: string | null;
}

/** Sort orders offered by the browse header control (AC10). */
export type BrowseSort = 'spotsLeft' | 'draftDate' | 'createdAt';

export const BROWSE_SORT_LABELS: Record<BrowseSort, string> = {
  spotsLeft: 'Spots left',
  draftDate: 'Draft date',
  createdAt: 'Newest',
};

/**
 * Roster-size buckets offered by the filter sheet. `max` is inclusive; a null
 * `max` means "no upper bound".
 */
export interface RosterSizeRange {
  id: string;
  label: string;
  min: number;
  max: number | null;
}

export const ROSTER_SIZE_RANGES: readonly RosterSizeRange[] = [
  { id: 'small', label: 'Up to 20', min: 0, max: 20 },
  { id: 'standard', label: '21–30', min: 21, max: 30 },
  { id: 'deep', label: '31+', min: 31, max: null },
] as const;

/**
 * The browse query the screen wants fulfilled. The app wrapper turns this into
 * GraphQL variables; the screen never talks to Apollo itself.
 */
export interface BrowseQuery {
  search?: string;
  sport?: string;
  eraFilter?: string;
  hasOpenSpots?: boolean;
  minRosterSize?: number;
  maxRosterSize?: number;
  sortBy: BrowseSort;
}

/** User-selected browse filters, before they are lowered into a `BrowseQuery`. */
export interface BrowseFilters {
  /**
   * Sport override. The screen defaults this to its entry sport (AC8) and the
   * filter sheet can widen it to "any".
   */
  sport: Sport | 'any';
  hasOpenSpots: boolean;
  eraFilter: string | null;
  rosterSizeId: string | null;
}

export function defaultBrowseFilters(sport: Sport): BrowseFilters {
  return {
    sport,
    hasOpenSpots: false,
    eraFilter: null,
    rosterSizeId: null,
  };
}

/** How many of the optional filters are currently narrowing the results. */
export function activeFilterCount(
  filters: BrowseFilters,
  entrySport: Sport,
): number {
  let count = 0;
  if (filters.sport !== entrySport) count += 1;
  if (filters.hasOpenSpots) count += 1;
  if (filters.eraFilter) count += 1;
  if (filters.rosterSizeId) count += 1;
  return count;
}

/** Lower the UI filter model into the query the wrapper executes. */
export function toBrowseQuery(
  filters: BrowseFilters,
  search: string,
  sortBy: BrowseSort,
): BrowseQuery {
  const range = ROSTER_SIZE_RANGES.find((r) => r.id === filters.rosterSizeId);
  return {
    search: search.trim() || undefined,
    sport: filters.sport === 'any' ? undefined : filters.sport,
    eraFilter: filters.eraFilter ?? undefined,
    hasOpenSpots: filters.hasOpenSpots || undefined,
    minRosterSize: range ? range.min : undefined,
    maxRosterSize: range?.max ?? undefined,
    sortBy,
  };
}

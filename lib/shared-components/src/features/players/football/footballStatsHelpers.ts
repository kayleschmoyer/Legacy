// Football player-stats helpers — pure functions and constants shared by the
// football controller + data grid. Relocated from the former apps/web
// `FootballPlayersPage` monolith during the sport-agnostic stats refactor
// (LS-8442) so both the toolbar controller and the grid draw the same
// key-stat, formatting, and filter logic from one place.

import type { FootballPlayerCardStats } from '../../football';
import { NFL_TEAMS } from '../../../constants/nflTeams';

/** Selectable football positions, in display order. */
export const FOOTBALL_POSITIONS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
  'DL',
  'LB',
  'DB',
] as const;

export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];

const VALID_POSITIONS = new Set<string>(FOOTBALL_POSITIONS);

/** Parse the comma-encoded `position` param into a validated list. */
export function parseFootballPositions(raw: string | null): FootballPosition[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is FootballPosition => s !== '' && VALID_POSITIONS.has(s));
}

/**
 * Premium advanced-search injury options (LS-6489 / FPL-008). `null` = "Any"
 * (no injury filter). Non-null values match the `injury_status` strings the
 * injury pipeline writes to the players table.
 */
export const INJURY_STATUS_OPTIONS: {
  label: string;
  value: string | null;
}[] = [
  { label: 'Any', value: null },
  { label: 'Questionable', value: 'Questionable' },
  { label: 'Doubtful', value: 'Doubtful' },
  { label: 'Out', value: 'Out' },
  { label: 'IR', value: 'IR' },
];

/** Team-filter option values that are not concrete NFL team abbreviations. */
export const TEAM_ALL = 'All';
export const TEAM_FREE_AGENT = 'FREE_AGENT';

/** Ordered team-filter options: conference/FA pseudo-teams, then every team. */
export const FOOTBALL_TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: TEAM_ALL, label: 'All Teams' },
  { value: TEAM_FREE_AGENT, label: 'Free Agents' },
  { value: 'AFC', label: 'AFC' },
  { value: 'NFC', label: 'NFC' },
  ...Object.values(NFL_TEAMS)
    .filter((t): t is NonNullable<typeof t> => t != null)
    .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
    .map((t) => ({
      value: t.abbreviation,
      label: `${t.abbreviation} — ${t.fullName}`,
    })),
];

/** Rows-per-page options for the football stats grid (drives `first`). */
export const FOOTBALL_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_FOOTBALL_PAGE_SIZE = 25;

/** Minimum characters before the search term is forwarded to the server. */
export const FOOTBALL_SEARCH_MIN_LENGTH = 2;
export const FOOTBALL_SEARCH_DEBOUNCE_MS = 300;

/** Sortable football grid fields, in display order. */
export const FOOTBALL_SORT_FIELDS = ['name', 'position', 'team'] as const;

export type FootballSortField = (typeof FOOTBALL_SORT_FIELDS)[number];

const VALID_SORT_FIELDS = new Set<string>(FOOTBALL_SORT_FIELDS);

/**
 * Type guard for a football sort field parsed from an untrusted source (e.g. a
 * URL query param). Mirrors `isValidBattingSortField` (LS-7115) so only fields
 * the grid actually supports ever reach the GraphQL variables.
 */
export function isFootballSortField(value: string): value is FootballSortField {
  return VALID_SORT_FIELDS.has(value);
}
export type FootballAvailability = 'all' | 'free_agents' | 'rostered';

/** The committed football filter surface (URL round-trip). */
export interface FootballStatsFilters {
  positions?: FootballPosition[];
  team?: string;
  searchTerm?: string;
  sortField?: FootballSortField;
  sortDir?: 'asc' | 'desc';
  injuryStatus?: string | null;
  minProjectedPoints?: number;
  maxAdpRank?: number;
  availabilityFilter?: FootballAvailability;
}

// ── Key-stat extraction (per position group) ───────────────────────────────

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

export function fmtFloat(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

export interface KeyStat {
  label: string;
  value: string;
}

/**
 * Derive the position-appropriate key stat (label + value) for a row. Migrated
 * verbatim from the football players monolith so the unified grid shows the
 * same per-position leaders (QB yds/td, RB yds/td, WR rec/yds, K FG, IDP tkl/sk,
 * DST sk/int).
 */
export function getFootballKeyStat(
  position: string | null | undefined,
  isDst: boolean,
  stats: FootballPlayerCardStats | null | undefined,
): KeyStat {
  if (!stats) return { label: '—', value: '' };
  const pos = position ?? '';

  if (isDst || pos === 'DST') {
    const d = stats.defense;
    if (!d) return { label: '—', value: '' };
    return { label: 'SK / INT', value: `${fmtFloat(d.sacks)} / ${fmt(d.int)}` };
  }
  if (pos === 'DL' || pos === 'LB' || pos === 'DB') {
    const idp = stats.idp;
    if (!idp) return { label: '—', value: '' };
    return {
      label: 'TKL / SK',
      value: `${fmt(idp.soloTkl)} / ${fmtFloat(idp.sacks)}`,
    };
  }
  if (pos === 'K') {
    const k = stats.kicking;
    if (!k) return { label: '—', value: '' };
    return { label: 'FG', value: `${fmt(k.fgm)}/${fmt(k.fga)}` };
  }
  if (pos === 'QB') {
    const p = stats.passing;
    if (!p) return { label: '—', value: '' };
    return { label: 'YDS / TD', value: `${fmt(p.yds)} / ${fmt(p.td)}` };
  }
  if (pos === 'RB') {
    const r = stats.rushing;
    if (!r) return { label: '—', value: '' };
    return { label: 'YDS / TD', value: `${fmt(r.yds)} / ${fmt(r.td)}` };
  }
  // WR / TE / flex
  const rec = stats.receiving;
  if (!rec) return { label: '—', value: '' };
  return { label: 'REC / YDS', value: `${fmt(rec.rec)} / ${fmt(rec.yds)}` };
}

// ── GraphQL variable derivation ─────────────────────────────────────────────

export interface FootballQueryVars {
  positions?: string[];
  nflTeam?: string;
  conference?: string;
  freeAgent?: boolean;
  search?: string;
  injuryStatus?: string;
  minProjectedPoints?: number;
  maxAdpRank?: number;
  sortBy?: string;
  sortDir?: string;
}

export interface FootballFilterState {
  positions: FootballPosition[];
  team: string;
  search: string;
  sortField?: FootballSortField;
  sortDir: 'asc' | 'desc';
  injuryStatus: string | null;
  minProjectedPoints?: number;
  maxAdpRank?: number;
}

/**
 * Map committed filter state into the `FootballPlayers` GraphQL variables,
 * mirroring the monolith's queryVars derivation: conference vs concrete team vs
 * free-agent are mutually exclusive; search is gated on a 2-char minimum; the
 * premium injury/projected/ADP args are already premium-gated by the caller.
 */
export function buildFootballQueryVars(
  state: FootballFilterState,
): FootballQueryVars {
  const isConference = state.team === 'AFC' || state.team === 'NFC';
  const search = state.search.trim();
  // Allow-list the sort field so an unvalidated value from a URL param can
  // never reach the GraphQL variables as an arbitrary orderBy string.
  const sortField =
    state.sortField && isFootballSortField(state.sortField)
      ? state.sortField
      : undefined;
  return {
    positions: state.positions.length > 0 ? [...state.positions] : undefined,
    nflTeam:
      state.team === TEAM_ALL || isConference || state.team === TEAM_FREE_AGENT
        ? undefined
        : state.team,
    conference: isConference ? state.team : undefined,
    freeAgent: state.team === TEAM_FREE_AGENT ? true : undefined,
    search: search.length >= FOOTBALL_SEARCH_MIN_LENGTH ? search : undefined,
    injuryStatus: state.injuryStatus ?? undefined,
    minProjectedPoints: state.minProjectedPoints,
    maxAdpRank: state.maxAdpRank,
    sortBy: sortField,
    sortDir: sortField ? state.sortDir : undefined,
  };
}

/**
 * Build the `/players/stats?sport=nfl&…` preview / share query string from the
 * current football filter state. Mirrors the params the apps/web route persists.
 */
export function buildFootballStatsQuery(state: {
  positions: FootballPosition[];
  team: string;
  search: string;
  pageSize: number;
  sortField?: FootballSortField;
  sortDir: 'asc' | 'desc';
  injuryStatus: string | null;
  minProjectedPoints?: number;
  maxAdpRank?: number;
}): string {
  const params: string[] = [`sport=nfl`, `pageSize=${state.pageSize}`];
  if (state.positions.length > 0) {
    params.push(`position=${encodeURIComponent(state.positions.join(','))}`);
  }
  if (state.team && state.team !== TEAM_ALL) {
    params.push(`team=${encodeURIComponent(state.team)}`);
  }
  const search = state.search.trim();
  if (search.length >= FOOTBALL_SEARCH_MIN_LENGTH) {
    params.push(`search=${encodeURIComponent(search)}`);
  }
  if (state.sortField) {
    params.push(`sortBy=${state.sortField}`);
    params.push(`sortDir=${state.sortDir}`);
  }
  if (state.injuryStatus) {
    params.push(`injuryStatus=${encodeURIComponent(state.injuryStatus)}`);
  }
  if (state.minProjectedPoints != null) {
    params.push(`minProjectedPoints=${state.minProjectedPoints}`);
  }
  if (state.maxAdpRank != null) {
    params.push(`maxAdpRank=${state.maxAdpRank}`);
  }
  return `/players/stats?${params.join('&')}`;
}

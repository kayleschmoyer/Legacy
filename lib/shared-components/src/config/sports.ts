import {
  DEFAULT_BASEBALL_ROSTER_POSITIONS,
  DEFAULT_FOOTBALL_ROSTER_POSITIONS,
  ERA_OPEN_END_YEAR,
  ERA_YEAR_RANGES_BY_SPORT,
} from '@legacy-sports/utils';
import type { SportKind } from '@legacy-sports/utils';
import { SportConfig } from '../types';

/**
 * Draft-surface sport kinds. Matches the ADR 0011 `sport_kind` enum and the
 * forthcoming `Sport` GraphQL enum. Restricted to the two sports the draft
 * surface supports; the broader `SPORT_CONFIGS` map keeps entries for
 * basketball and hockey for future reach, but `SportKind` is the type that
 * components accept as their `sport` prop.
 */
export type { SportKind } from '@legacy-sports/utils';

export const SPORT_CONFIGS: Record<string, SportConfig> = {
  baseball: {
    name: 'Baseball',
    colors: {
      accent: '#ff6b35',
      primary: '#1a1a1a',
      secondary: '#2d2d2d',
    },
    positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'P'],
    statLabels: ['AVG', 'HR', 'RBI', 'R', 'SB', 'ERA', 'W', 'K'],
    sortOptions: ['Rank', 'AVG', 'HR', 'RBI', 'ERA', 'WHIP', 'Ownership%'],
    stats: ['AVG', 'HR', 'RBI', 'R', 'SB', 'ERA', 'W', 'K', 'SV', 'OBP'],
  },
  football: {
    name: 'Football',
    colors: {
      accent: '#f97316',
      primary: '#7c2d12',
      secondary: '#ea580c',
    },
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    statLabels: ['PASS YDS', 'RUSH YDS', 'REC', 'TD', 'FG', 'INT'],
    sortOptions: [
      'Rank',
      'PassYds',
      'PassTDs',
      'RushYds',
      'RushTDs',
      'Receptions',
      'RecYds',
      'RecTDs',
      'Ownership%',
    ],
    stats: [
      'PassYds',
      'PassTDs',
      'RushYds',
      'RushTDs',
      'Rec',
      'RecYds',
      'RecTDs',
    ],
  },
  basketball: {
    name: 'Basketball',
    colors: {
      accent: '#ff8c00',
      primary: '#2d1b69',
      secondary: '#4a3c8c',
    },
    positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    statLabels: ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%'],
    sortOptions: ['Rank', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'Ownership%'],
    stats: ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%', '3P%', 'FT%'],
  },
  hockey: {
    name: 'Hockey',
    colors: {
      accent: '#1e90ff',
      primary: '#0f1419',
      secondary: '#2a2f3a',
    },
    positions: ['C', 'LW', 'RW', 'D', 'G'],
    statLabels: ['G', 'A', 'PTS', '+/-', 'PIM', 'SOG', 'SV%', 'GAA'],
    sortOptions: ['Rank', 'G', 'A', 'PTS', 'SOG', 'SV%', 'GAA', 'Ownership%'],
    stats: ['G', 'A', 'PTS', '+/-', 'PIM', 'SOG', 'SV%', 'GAA'],
  },
};

export const DEFAULT_COLORS = {
  primary: '#1E1E1E',
  secondary: '#2A2A2A',
  accent: '#3366FF',
  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  border: '#333',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
};

export const DROPDOWN_TEAM_COUNT_ITEMS = Object.freeze([
  { text: '6', value: '6' },
  { text: '8', value: '8' },
  { text: '10', value: '10' },
  { text: '12', value: '12' },
  { text: '14', value: '14' },
  { text: '16', value: '16' },
]);

export const DRAFT_MODES = Object.freeze([
  { label: 'Live Draft', value: 'live' },
  { label: 'Automated Draft', value: 'automated' },
]);

export const SELECTION_METHODS = Object.freeze([
  { label: 'Standard', value: 'standard' },
  { label: 'Auction', value: 'auction' },
  { label: 'Random', value: 'random' },
]);

export const DRAFT_ORDERS = Object.freeze([
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
]);

/**
 * Reverse Standings / previous-year-inverse draft order (LS-8929): worst
 * finisher from the prior season picks first. Keeper leagues only — a
 * redraft/dynasty league has no meaningful "prior season standings" concept
 * carried into the new draft, so this is appended separately rather than
 * folded into {@link DRAFT_ORDERS}; callers add it when `rosterContinuity
 * === 'keeper'`.
 */
export const KEEPER_ONLY_DRAFT_ORDERS = Object.freeze([
  { label: 'Reverse Standings', value: 'reverse_standings' },
]);

/** Seconds-per-pick options for the draft pick timer.
 * Includes slow-mode options (24h, 48h) for asynchronous email-pace drafts.
 */
export const PICK_TIME_OPTIONS = Object.freeze([
  { label: '30s', value: '30' },
  { label: '1 min', value: '60' },
  { label: '90s', value: '90' },
  { label: '2 min', value: '120' },
  { label: '3 min', value: '180' },
  { label: '5 min', value: '300' },
  { label: '10 min', value: '600' },
  { label: '1 hour', value: '3600' },
  { label: '12 hours', value: '43200' },
  { label: '24 hours', value: '86400' },
  { label: '48 hours', value: '172800' },
]);

export const DIVISION_COUNTS = Object.freeze([
  { label: '1 Division', value: '1' },
  { label: '2 Divisions', value: '2' },
  { label: '3 Divisions', value: '3' },
  { label: '4 Divisions', value: '4' },
]);

export const SCHEDULING_STRATEGIES = Object.freeze([
  { label: 'Divisional', value: 'divisional' },
  { label: 'Round Robin', value: 'round-robin' },
  { label: 'Random', value: 'random' },
]);

export const PLAYER_POOLS_BY_SPORT: Record<
  SportKind,
  ReadonlyArray<{ label: string; value: string }>
> = {
  baseball: Object.freeze([
    { label: 'All MLB', value: 'all' },
    { label: 'National League', value: 'nl' },
    { label: 'American League', value: 'al' },
  ]),
  football: Object.freeze([
    { label: 'All NFL', value: 'nfl' },
    { label: 'AFC', value: 'afc' },
    { label: 'NFC', value: 'nfc' },
  ]),
};

/** Backwards-compatible alias — returns baseball player pools. */
export const PLAYER_POOLS = PLAYER_POOLS_BY_SPORT.baseball;

/**
 * Formats a pre-defined era's inclusive year range from the canonical
 * `ERA_YEAR_RANGES_BY_SPORT` table, e.g. "1920 – 1960" or "2006 – Now".
 * Returns null for ids with no fixed range (`all`, `custom`, unknown).
 */
export function formatEraYearRange(
  sport: SportKind,
  eraId: string,
  separator = ' – ',
): string | null {
  const range = ERA_YEAR_RANGES_BY_SPORT[sport][eraId];
  if (!range) return null;
  const end = range.end === ERA_OPEN_END_YEAR ? 'Now' : String(range.end);
  return `${range.start}${separator}${end}`;
}

/** Commissioner-style `{ label: 'Golden Age (1920-1960)', value }` options. */
function eraFilterOptions(
  sport: SportKind,
): Array<{ label: string; value: string }> {
  return Object.entries(ERA_YEAR_RANGES_BY_SPORT[sport]).map(
    ([value, range]) => {
      const years =
        range.end === ERA_OPEN_END_YEAR
          ? `${range.start}+`
          : `${range.start}-${range.end}`;
      return { label: `${range.label} (${years})`, value };
    },
  );
}

/**
 * Era filter options per sport, for league creation and Commissioner Draft
 * Settings. Maps to the `era_filter` database enum. Labels are derived from
 * `ERA_YEAR_RANGES_BY_SPORT` (the ranges the backend enforces), bracketed by
 * `all` (no restriction, default) and — baseball only — `custom`
 * (commissioner-defined years).
 */
export const ERA_FILTERS_BY_SPORT: Record<
  SportKind,
  ReadonlyArray<{ label: string; value: string }>
> = {
  baseball: Object.freeze([
    { label: 'All Eras', value: 'all' },
    ...eraFilterOptions('baseball'),
    { label: 'Custom Era', value: 'custom' },
  ]),
  football: Object.freeze([
    { label: 'All Eras', value: 'all' },
    ...eraFilterOptions('football'),
  ]),
};

/** Backwards-compatible alias — returns baseball era filters. */
export const ERA_FILTERS = ERA_FILTERS_BY_SPORT.baseball;

/**
 * Year boundaries for pre-defined eras, keyed by sport. Re-exported from the
 * canonical `@legacy-sports/utils` table that the backend draft-pool filter
 * also reads, so every surface shows the years actually enforced (LS-10689).
 */
export { ERA_OPEN_END_YEAR, ERA_YEAR_RANGES_BY_SPORT };

/** Backwards-compatible alias — returns baseball era year ranges. */
export const ERA_YEAR_RANGES = ERA_YEAR_RANGES_BY_SPORT.baseball;

/**
 * Earliest historically valid year for a sport's custom era range (first
 * professional season). Mirrors `CUSTOM_ERA_MIN_YEAR_BY_SPORT` in
 * `lambdas/db/src/schema/leagues/sport-validation.ts`, which is the
 * server-side authority — this constant only drives the client-side UX hint.
 */
export const CUSTOM_ERA_MIN_YEAR_BY_SPORT: Record<SportKind, number> = {
  baseball: 1871,
  football: 1920,
};

/**
 * Derive the era name from a career midpoint year for the given sport.
 * Defaults to baseball when sport is not specified.
 */
export function getEraFromYear(
  midpointYear: number,
  sport: SportKind = 'baseball',
): string {
  const ranges = ERA_YEAR_RANGES_BY_SPORT[sport];
  for (const [, range] of Object.entries(ranges)) {
    if (midpointYear >= range.start && midpointYear <= range.end) {
      return range.label;
    }
  }
  return 'All Eras';
}

/**
 * Derive the era value (DB enum string) from a career midpoint year for the given sport.
 * Defaults to baseball when sport is not specified.
 */
export function getEraValueFromYear(
  midpointYear: number,
  sport: SportKind = 'baseball',
): string {
  const ranges = ERA_YEAR_RANGES_BY_SPORT[sport];
  for (const [key, range] of Object.entries(ranges)) {
    if (midpointYear >= range.start && midpointYear <= range.end) {
      return key;
    }
  }
  return 'all';
}

/**
 * Position filter options shown as quick-filter pills on the players list,
 * keyed by sport. 'All' is always first and means "no position filter applied".
 * Football positions cover skill, kicker, team defense, and IDP slots.
 * Baseball positions cover standard fantasy batting/pitching slots.
 */
export const PLAYER_FILTER_POSITIONS_BY_SPORT = {
  baseball: [
    'All',
    'SP',
    'RP',
    'C',
    '1B',
    '2B',
    '3B',
    'SS',
    'OF',
    'DH',
  ] as const,
  football: [
    'All',
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
  ] as const,
} as const;

export type BaseballFilterPosition =
  (typeof PLAYER_FILTER_POSITIONS_BY_SPORT.baseball)[number];
export type FootballFilterPosition =
  (typeof PLAYER_FILTER_POSITIONS_BY_SPORT.football)[number];

export const SORT_DIRECTIONS = ['ASC', 'DESC'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export { GAMES_PER_MATCHUP_BY_SPORT } from '@legacy-sports/utils';

// Alias for backward compatibility
export const sportsConfig = SPORT_CONFIGS;

/**
 * Describes a complete lineup/roster template for a league.
 * `starters` is an ordered list of position slots (repeats allowed, e.g. two 'RB' entries).
 * `bench` is the number of generic bench spots.
 */
export interface LineupTemplate {
  readonly starters: readonly string[];
  readonly bench: number;
}

/**
 * Default lineup templates per sport and defensive format.
 * Football has two variants — `dst` (team defense/special teams) and `idp`
 * (individual defensive players) — matching the league `defensiveFormat` field.
 * Baseball only has one format.
 *
 * Slot names match the `position_slot` Postgres enum (LS-245).
 * The league creation wizard (LS-256) pre-fills from these but lets the
 * commissioner adjust before the draft.
 */
export const DEFAULT_LINEUP_BY_SPORT = {
  baseball: {
    dst: {
      starters: DEFAULT_BASEBALL_ROSTER_POSITIONS,
      bench: 5,
    } satisfies LineupTemplate,
  },
  football: {
    dst: {
      starters: DEFAULT_FOOTBALL_ROSTER_POSITIONS,
      bench: 6,
    } satisfies LineupTemplate,
    idp: {
      starters: [
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
      ],
      bench: 6,
    } satisfies LineupTemplate,
  },
} as const;

/**
 * Default maximum roster size per sport applied when the commissioner does not
 * override during league creation.  Football's tighter cap (16) reflects the
 * standard 9-starter + 6-bench configuration with headroom; baseball's larger
 * pool (25) accommodates the deeper pitching staff.
 */
export { DEFAULT_ROSTER_SIZE_BY_SPORT } from '@legacy-sports/utils';

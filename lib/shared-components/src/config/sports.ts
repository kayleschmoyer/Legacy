import {
  DEFAULT_BASEBALL_ROSTER_POSITIONS,
  DEFAULT_FOOTBALL_ROSTER_POSITIONS,
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
 * Era filter options per sport, for league creation.
 * Maps to the `era_filter` database enum.
 *
 * Baseball year ranges:
 *   Dead Ball   : 1871-1919
 *   Golden Age  : 1920-1960
 *   Expansion   : 1961-1976
 *   Free Agency : 1977-1993
 *   Steroid Era : 1994-2005
 *   Modern      : 2006+
 *   Custom      : commissioner-defined
 *   All         : no restriction (default)
 *
 * Football year ranges:
 *   Pioneer         : 1920-1945
 *   Single-Platoon  : 1946-1959
 *   Super Bowl Era  : 1960-1977
 *   West Coast      : 1978-1993
 *   Salary Cap      : 1994-2010
 *   Spread Offense  : 2011+
 */
export const ERA_FILTERS_BY_SPORT: Record<
  SportKind,
  ReadonlyArray<{ label: string; value: string }>
> = {
  baseball: Object.freeze([
    { label: 'All Eras', value: 'all' },
    { label: 'Dead Ball Era (pre-1920)', value: 'dead_ball' },
    { label: 'Golden Age (1920-1960)', value: 'golden_age' },
    { label: 'Expansion Era (1961-1976)', value: 'expansion' },
    { label: 'Free Agency Era (1977-1993)', value: 'free_agency' },
    { label: 'Steroid Era (1994-2005)', value: 'steroid_era' },
    { label: 'Modern Era (2006+)', value: 'modern' },
    { label: 'Custom Era', value: 'custom' },
  ]),
  football: Object.freeze([
    { label: 'All Eras', value: 'all' },
    { label: 'Pioneer Era (1920-1945)', value: 'pioneer' },
    { label: 'Single-Platoon Era (1946-1959)', value: 'single_platoon' },
    { label: 'Super Bowl Era (1960-1977)', value: 'super_bowl_era' },
    { label: 'West Coast Era (1978-1993)', value: 'west_coast' },
    { label: 'Salary Cap Era (1994-2010)', value: 'salary_cap_era' },
    { label: 'Spread Offense Era (2011+)', value: 'spread_offense' },
  ]),
};

/** Backwards-compatible alias — returns baseball era filters. */
export const ERA_FILTERS = ERA_FILTERS_BY_SPORT.baseball;

/** Year boundaries for pre-defined eras, keyed by sport. */
export const ERA_YEAR_RANGES_BY_SPORT: Record<
  SportKind,
  Record<string, { start: number; end: number; label: string }>
> = {
  baseball: {
    dead_ball: { start: 1871, end: 1919, label: 'Dead Ball Era' },
    golden_age: { start: 1920, end: 1960, label: 'Golden Age' },
    expansion: { start: 1961, end: 1976, label: 'Expansion Era' },
    free_agency: { start: 1977, end: 1993, label: 'Free Agency Era' },
    steroid_era: { start: 1994, end: 2005, label: 'Steroid Era' },
    modern: { start: 2006, end: 9999, label: 'Modern Era' },
  },
  football: {
    pioneer: { start: 1920, end: 1945, label: 'Pioneer Era' },
    single_platoon: { start: 1946, end: 1959, label: 'Single-Platoon Era' },
    super_bowl_era: { start: 1960, end: 1977, label: 'Super Bowl Era' },
    west_coast: { start: 1978, end: 1993, label: 'West Coast Era' },
    salary_cap_era: { start: 1994, end: 2010, label: 'Salary Cap Era' },
    spread_offense: { start: 2011, end: 9999, label: 'Spread Offense Era' },
  },
};

/** Backwards-compatible alias — returns baseball era year ranges. */
export const ERA_YEAR_RANGES = ERA_YEAR_RANGES_BY_SPORT.baseball;

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

export const SORT_DIRECTIONS = ['ASC', 'DESC'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

// Alias for backward compatibility
export const sportsConfig = SPORT_CONFIGS;

/**
 * Describes a complete lineup/roster template for a league.
 * `starters` is an ordered list of position slots (repeats allowed, e.g. two 'RB' entries).
 * `bench` is the number of generic bench spots.
 * `ir` is the number of injured-reserve spots.
 */
export interface LineupTemplate {
  readonly starters: readonly string[];
  readonly bench: number;
  readonly ir: number;
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
      ir: 0,
    } satisfies LineupTemplate,
  },
  football: {
    dst: {
      starters: DEFAULT_FOOTBALL_ROSTER_POSITIONS,
      bench: 6,
      ir: 1,
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
        'DP',
      ],
      bench: 6,
      ir: 1,
    } satisfies LineupTemplate,
  },
} as const;

/**
 * Default maximum roster size per sport applied when the commissioner does not
 * override during league creation.  Football's tighter cap (16) reflects the
 * standard 9-starter + 6-bench + 1-IR configuration; baseball's larger pool (25)
 * accommodates the deeper pitching staff.
 */
export { DEFAULT_ROSTER_SIZE_BY_SPORT } from '@legacy-sports/utils';

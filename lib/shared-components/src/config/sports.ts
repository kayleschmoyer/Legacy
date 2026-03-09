import { SportConfig } from '../types';

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

export const PLAYER_POOLS = Object.freeze([
  { label: 'All MLB', value: 'all' },
  { label: 'National League', value: 'nl' },
  { label: 'American League', value: 'al' },
]);

/**
 * Era filter options for league creation.
 * Maps to the `era_filter` database enum.
 *
 * Year ranges:
 *   Dead Ball   : 1871-1919
 *   Golden Age  : 1920-1960
 *   Expansion   : 1961-1976
 *   Free Agency : 1977-1993
 *   Steroid Era : 1994-2005
 *   Modern      : 2006+
 *   Custom      : commissioner-defined
 *   All         : no restriction (default)
 */
export const ERA_FILTERS = Object.freeze([
  { label: 'All Eras', value: 'all' },
  { label: 'Dead Ball Era (pre-1920)', value: 'dead_ball' },
  { label: 'Golden Age (1920-1960)', value: 'golden_age' },
  { label: 'Expansion Era (1961-1976)', value: 'expansion' },
  { label: 'Free Agency Era (1977-1993)', value: 'free_agency' },
  { label: 'Steroid Era (1994-2005)', value: 'steroid_era' },
  { label: 'Modern Era (2006+)', value: 'modern' },
  { label: 'Custom Era', value: 'custom' },
]);

/** Year boundaries for each pre-defined era */
export const ERA_YEAR_RANGES: Record<
  string,
  { start: number; end: number; label: string }
> = {
  dead_ball: { start: 1871, end: 1919, label: 'Dead Ball Era' },
  golden_age: { start: 1920, end: 1960, label: 'Golden Age' },
  expansion: { start: 1961, end: 1976, label: 'Expansion Era' },
  free_agency: { start: 1977, end: 1993, label: 'Free Agency Era' },
  steroid_era: { start: 1994, end: 2005, label: 'Steroid Era' },
  modern: { start: 2006, end: 9999, label: 'Modern Era' },
};

/**
 * Derive the primary baseball era name from a career midpoint year.
 *
 * @param midpointYear - The year at the midpoint of a player's career
 *   (or any representative year, e.g. peak year)
 * @returns Human-readable era label, e.g. "Golden Age"
 */
export function getEraFromYear(midpointYear: number): string {
  for (const [, range] of Object.entries(ERA_YEAR_RANGES)) {
    if (midpointYear >= range.start && midpointYear <= range.end) {
      return range.label;
    }
  }
  return 'All Eras';
}

/**
 * Derive the primary era value (DB enum string) from a career midpoint year.
 */
export function getEraValueFromYear(midpointYear: number): string {
  for (const [key, range] of Object.entries(ERA_YEAR_RANGES)) {
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

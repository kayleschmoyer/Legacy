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

export const DRAFT_TYPES = Object.freeze([
  { label: 'Standard Draft', value: 'NORMAL' },
  { label: 'Blind Draft', value: 'BLIND' },
]);

export const SORT_DIRECTIONS = ['ASC', 'DESC'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

// Alias for backward compatibility
export const sportsConfig = SPORT_CONFIGS;

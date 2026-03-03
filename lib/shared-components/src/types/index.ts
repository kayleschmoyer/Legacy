// Common types for the fantasy sports application

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  team: string;
  adp: number;
  rank: number;
  stats?: Record<string, unknown>;
  player: string;
  pos: string;
  hr: number;
  avg: number;
  rbi: number;
  legacy: string;
  fantasyPoints: number;
  projectedPoints: number;
  gamesPlayed: number;
  runs: number;
  hits: number;
  strikeouts: number;
  walks: number;
  obp: number;
  trending?: 'up' | 'down' | 'stable';
}

export interface Filter {
  position?: string;
  availability?: string;
  trending?: string;
}

export interface TeamType {
  id: number;
  name: string;
}

export interface Pick {
  id: string;
  player: Player;
  pickNumber: number;
  timestamp: string;
  teamId: string;
}

export interface DraftTeam {
  id: string;
  name: string;
  owner: string;
  picks: Pick[];
}

export interface DraftState {
  id: string;
  name: string;
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  status: 'waiting' | 'active' | 'paused' | 'completed';
  currentPick: number;
  timeRemaining: number;
  teams: DraftTeam[];
  picks: Pick[];
}

export interface SportConfig {
  name: string;
  colors: {
    accent: string;
    primary: string;
    secondary: string;
  };
  positions: string[];
  statLabels: string[];
  sortOptions?: string[];
  stats?: string[];
}

export interface League {
  id: string;
  name: string;
  sport: string;
  numberOfTeams: number;
  draftDate: Date;
  playerPool: PlayerPool;
  /** Era-based player pool filter */
  eraFilter?: EraFilter | string;
  /** When true, only Hall of Fame inductees are in the draft pool */
  hofOnly?: boolean;
  /** Custom commissioner-defined era start year */
  customEraStartYear?: number | null;
  /** Custom commissioner-defined era end year */
  customEraEndYear?: number | null;
  ownerId: string;
  teams?: TeamType[];
}

export enum DraftMode {
  LIVE = 'live',
  AUTOMATED = 'automated',
}

export enum SelectionMethod {
  STANDARD = 'standard',
  AUCTION = 'auction',
  RANDOM = 'random',
}

export enum DraftOrder {
  SNAKE = 'snake',
  LINEAR = 'linear',
}

export enum PlayerPool {
  ALL = 'all',
  NL = 'nl',
  AL = 'al',
}

/**
 * Era filter enum — matches the `era_filter` PostgreSQL enum.
 * Controls which historical baseball era the player pool is restricted to.
 */
export enum EraFilter {
  ALL = 'all',
  DEAD_BALL = 'dead_ball',
  GOLDEN_AGE = 'golden_age',
  EXPANSION = 'expansion',
  FREE_AGENCY = 'free_agency',
  STEROID_ERA = 'steroid_era',
  MODERN = 'modern',
  CUSTOM = 'custom',
}

export interface DropdownItem {
  text: string;
  value: string;
}

// Auth related types
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: string;
}

// Stats table types
export interface StatsTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  type?: 'string' | 'number';
}

export interface StatsTableRow {
  [key: string]: string | number | undefined;
}

// Navigation types
export interface Route {
  name: string;
  path: string;
  component: React.ComponentType;
  icon?: string;
  requiresAuth?: boolean;
}

export interface NavigationConfig {
  routes: Route[];
  initialRoute: string;
  authRoute: string;
}

// Common types for the fantasy sports application

/**
 * Position codes across all supported sports.
 *
 * Baseball: C, 1B, 2B, 3B, SS, LF, CF, RF, OF, IF, DH, P, SP, RP
 * Football: QB, RB, WR, TE, K, DEF
 * Basketball: PG, SG, SF, PF, C
 * Hockey: C, LW, RW, D, G
 *
 * Note: 'C' is shared by baseball (Catcher), basketball (Center), and hockey (Center).
 */
export type SportPosition =
  // Baseball
  | 'SP'
  | 'RP'
  | 'C'
  | '1B'
  | '2B'
  | '3B'
  | 'SS'
  | 'RF'
  | 'LF'
  | 'CF'
  | 'DH'
  | 'P'
  | 'IF'
  | 'OF'
  // Football
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'K'
  | 'DEF'
  // Basketball
  | 'PG'
  | 'SG'
  | 'SF'
  | 'PF'
  // Hockey
  | 'LW'
  | 'RW'
  | 'D'
  | 'G';

/** Trending direction for a player's value movement. */
export type TrendingDirection = 'up' | 'down' | 'stable';

/** Structured trending info with optional magnitude. */
export interface TrendingInfo {
  direction: TrendingDirection;
  changePercent?: number;
}

/** Typed stats bucket — narrows the previous `Record<string, unknown>`. */
export type PlayerStats = Record<string, number | string>;

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: SportPosition;
  team: string;
  adp: number;
  rank: number;
  stats?: PlayerStats;
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
  trending?: TrendingInfo;
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
  positions: SportPosition[];
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
  baseballHofOnly?: boolean;
  /** Custom commissioner-defined era start year (only used when eraFilter = 'custom') */
  customEraStartYear?: number | null;
  /** Custom commissioner-defined era end year (only used when eraFilter = 'custom') */
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

/**
 * Player pool — restricts the draft pool to players from a specific league or
 * conference. Values are shared across sports; use `PLAYER_POOLS_BY_SPORT` from
 * `config/sports.ts` to get the appropriate subset for a given sport.
 *
 * ⚠️ This enum is intentionally extensible: new sports will add new members.
 * Any `switch` statement over `PlayerPool` **must** include a `default` case to
 * remain correct as the enum grows.
 */
export enum PlayerPool {
  // Baseball
  ALL = 'all',
  NL = 'nl',
  AL = 'al',
  // Football (LS-4760)
  NFL = 'nfl',
  AFC = 'afc',
  NFC = 'nfc',
}

/**
 * Era filter enum — matches the `era_filter` PostgreSQL enum.
 * Baseball and football eras are both represented here; use
 * `ERA_FILTERS_BY_SPORT` from `config/sports.ts` to get the appropriate
 * subset for a given sport.
 *
 * ⚠️ This enum is intentionally extensible: new sports will add new era
 * members. Any `switch` statement over `EraFilter` **must** include a
 * `default` case to remain correct as the enum grows.
 */
export enum EraFilter {
  ALL = 'all',
  // Baseball
  DEAD_BALL = 'dead_ball',
  GOLDEN_AGE = 'golden_age',
  EXPANSION = 'expansion',
  FREE_AGENCY = 'free_agency',
  STEROID_ERA = 'steroid_era',
  MODERN = 'modern',
  CUSTOM = 'custom',
  // Football (LS-4760)
  PIONEER = 'pioneer',
  SINGLE_PLATOON = 'single_platoon',
  SUPER_BOWL_ERA = 'super_bowl_era',
  WEST_COAST = 'west_coast',
  SALARY_CAP_ERA = 'salary_cap_era',
  SPREAD_OFFENSE = 'spread_offense',
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
  id: string | number;
  [key: string]: string | number | undefined;
}

// Navigation types
export interface Route {
  name: string;
  path: string;
  component: React.ComponentType;
  title?: string;
  icon?: string;
  requiresAuth?: boolean;
}

export interface NavigationConfig {
  routes: Route[];
  initialRoute: string;
  authRoute: string;
}

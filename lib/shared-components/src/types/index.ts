// Common types for the fantasy sports application

export interface Player {
  id: string;
  name: string;
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
  draftType: DraftType;
  ownerId: string;
  teams?: TeamType[];
}

export enum DraftType {
  NORMAL = 'NORMAL',
  BLIND = 'BLIND',
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
  component: React.ComponentType<any>;
  icon?: string;
  requiresAuth?: boolean;
}

export interface NavigationConfig {
  routes: Route[];
  initialRoute: string;
  authRoute: string;
}

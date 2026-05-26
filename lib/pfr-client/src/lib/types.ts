// Type definitions for football stats.

export interface PfrPlayer {
  id: number;
  pfrId: string;
}

export interface PfrPlayerSummary {
  pfrId: string;
  name: string;
  rawPosition: string;
  lastTeam: string | null;
}

export interface PfrPlayerInfo {
  pfrId: string;
  name: string;
  rawPosition: string;
  currentTeam: string | null;
  dateOfBirth: string | null;
}

// Normalized IDP position values mapped from PFR raw positions.
export type IdpPosition =
  | 'DL'
  | 'LB'
  | 'DB'
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'K'
  | null;

// --- Per-game offensive / kicking types (mirrors LS-248 table columns) ---

export interface GameFootballPassing {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  cmp: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  int: number | null;
  sacked: number | null;
  sackYds: number | null;
  rating: number | null;
}

export interface GameFootballRushing {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  att: number | null;
  yds: number | null;
  td: number | null;
  lng: number | null;
  fumbles: number | null;
}

export interface GameFootballReceiving {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  rec: number | null;
  tgt: number | null;
  yds: number | null;
  td: number | null;
  lng: number | null;
  fumbles: number | null;
}

export interface GameFootballKicking {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  fgm: number | null;
  fga: number | null;
  fg019m: number | null;
  fg019a: number | null;
  fg2029m: number | null;
  fg2029a: number | null;
  fg3039m: number | null;
  fg3039a: number | null;
  fg4049m: number | null;
  fg4049a: number | null;
  fg50m: number | null;
  fg50a: number | null;
  xpm: number | null;
  xpa: number | null;
  lng: number | null;
}

// DST per-game (mirrors LS-248 game_football_defense columns)
export interface GameFootballDefense {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  sacks: number | null;
  int: number | null;
  fumRec: number | null;
  defTd: number | null;
  safeties: number | null;
  ptsAllowed: number | null;
  ydsAllowed: number | null;
  passYdsAllowed: number | null;
  rushYdsAllowed: number | null;
}

// IDP per-game (mirrors LS-4155 game_football_defense_idp columns)
export interface GameFootballDefenseIdp {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  soloTkl: number | null;
  astTkl: number | null;
  sacks: number | null; // DECIMAL — supports 0.5 half-sacks
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
}

// --- Season aggregate types ---

export interface FootballSeasonPassing {
  playerId: number;
  season: number;
  team: string;
  pfrRowId: string;
  g: number | null;
  cmp: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  int: number | null;
  rating: number | null;
}

export interface FootballSeasonRushing {
  playerId: number;
  season: number;
  team: string;
  pfrRowId: string;
  g: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  fumbles: number | null;
}

export interface FootballSeasonReceiving {
  playerId: number;
  season: number;
  team: string;
  pfrRowId: string;
  g: number | null;
  rec: number | null;
  tgt: number | null;
  yds: number | null;
  td: number | null;
  fumbles: number | null;
}

export interface FootballSeasonKicking {
  playerId: number;
  season: number;
  team: string;
  pfrRowId: string;
  g: number | null;
  fgm: number | null;
  fga: number | null;
  xpm: number | null;
  xpa: number | null;
}

export interface FootballSeasonDefense {
  playerId: number;
  season: number;
  team: string;
  pfrRowId: string;
  g: number | null;
  sacks: number | null;
  int: number | null;
  fumRec: number | null;
  defTd: number | null;
  safeties: number | null;
}

// IDP season (mirrors LS-4155 football_season_defense_idp columns)
export interface FootballSeasonDefenseIdp {
  playerId: number;
  season: number;
  team: string;
  g: number | null;
  gs: number | null;
  soloTkl: number | null;
  astTkl: number | null;
  totalTkl: number | null;
  sacks: number | null; // DECIMAL — supports half-sacks
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
  pfrRowId: string;
}

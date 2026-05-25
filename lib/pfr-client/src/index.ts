// Stub for @legacy-sports/pfr-client — real implementation in LS-252 (PR #4253).
// This file provides type definitions so dependents typecheck before that PR merges.

export interface PfrPlayer {
  id: number;
  pfrId: string;
}

// --- Per-game types ---

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

export interface GameFootballDefenseIdp {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  soloTkl: number | null;
  astTkl: number | null;
  sacks: number | null;
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
}

// --- Season aggregate types ---

export interface FootballSeasonDefenseIdp {
  playerId: number;
  season: number;
  team: string;
  g: number | null;
  gs: number | null;
  soloTkl: number | null;
  astTkl: number | null;
  totalTkl: number | null;
  sacks: number | null;
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
  pfrRowId: string;
}

// --- CareerStats namespace (offensive/kicking) ---

export namespace CareerStats {
  export interface GameLog {
    passing: GameFootballPassing[];
    rushing: GameFootballRushing[];
    receiving: GameFootballReceiving[];
    kicking: GameFootballKicking[];
  }

  export async function getGameLog(
    _player: PfrPlayer,
    _season: number,
  ): Promise<GameLog> {
    throw new Error('pfr-client stub — not implemented (LS-252)');
  }
}

// --- TeamDefense namespace (DST) ---

export namespace TeamDefense {
  export async function getGameLog(
    _player: PfrPlayer,
    _nflTeam: string,
    _season: number,
  ): Promise<GameFootballDefense[]> {
    throw new Error('pfr-client stub — not implemented (LS-252)');
  }
}

// --- IDPStats namespace ---

export namespace IDPStats {
  export async function getGameLog(
    _player: PfrPlayer,
    _season: number,
  ): Promise<GameFootballDefenseIdp[]> {
    throw new Error('pfr-client stub — not implemented (LS-252)');
  }

  export async function getSeasonTotals(
    _player: PfrPlayer,
    _season: number,
  ): Promise<FootballSeasonDefenseIdp | null> {
    throw new Error('pfr-client stub — not implemented (LS-252)');
  }
}

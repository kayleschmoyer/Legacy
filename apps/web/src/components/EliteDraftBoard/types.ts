// ---------------------------------------------------------------------------
// Shared types for EliteDraftBoard
// ---------------------------------------------------------------------------

export interface DraftPlayer {
  id: number;
  name: string;
  position: string;
  avg: number;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
  games: number;
  hits: number;
  obp: number;
  slg: number;
  // Pitcher-specific stats (populated when position is P, SP, or RP)
  era?: string | null;
  wins?: number;
  losses?: number;
  saves?: number;
  strikeouts?: number;
  gamesStarted?: number;
}

export interface AvailableDraftPlayer {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
}

/** Stats lookup entry built from careerBattingStats connection */
export interface PlayerStatsEntry {
  playerId: number;
  firstName: string;
  lastName: string;
  position: string;
  games: number;
  hits: number;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
  avg: number;
  obp: number;
  slg: number;
  war: number;
}

/** Pitcher stats lookup entry built from careerPitchingStats */
export interface PitcherStatsEntry {
  playerId: number;
  era: string | null;
  wins: number;
  losses: number;
  saves: number;
  strikeouts: number;
  games: number;
  gamesStarted: number;
}

export interface CurrentDraftPickInfo {
  draftId: number;
  teamId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
}

export interface DraftPickRecord {
  id: string;
  draftId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: string;
  teamId: number;
  playerId: number;
  /** Player name fields returned directly from getDraftPicks (LS-431). Used
   * to display names for picks that are absent from the careerBattingStats
   * map (e.g. pure pitchers). */
  player?: { id: number; firstName: string; lastName: string } | null;
}

export interface LeagueTeam {
  id: string;
  name: string;
  leagueId: number;
}

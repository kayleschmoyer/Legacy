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
}

export interface LeagueTeam {
  id: string;
  name: string;
  leagueId: number;
}

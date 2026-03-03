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
  // Pitcher-specific stats (populated only for P/SP/RP)
  isPitcher?: boolean;
  wins?: number;
  losses?: number;
  era?: number;
  strikeouts?: number;
  saves?: number;
  whip?: number;
  winPct?: number;
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
  /** Player name fields returned directly from getDraftPicks. Used to display
   * names for picks that are absent from the careerBattingStats map (e.g. pure
   * pitchers). */
  player?: { id: number; firstName: string; lastName: string } | null;
}

export interface LeagueTeam {
  id: string;
  name: string;
  leagueId: number;
  isCpu?: boolean;
}

export interface IntelligenceRecommendation {
  player: DraftPlayer;
  score: number;
  topStats: Array<{ label: string; value: string }>;
  reason: string;
}

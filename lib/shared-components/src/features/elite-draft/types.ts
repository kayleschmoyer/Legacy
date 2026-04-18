// ---------------------------------------------------------------------------
// Shared types for EliteDraftBoard
// ---------------------------------------------------------------------------

export interface DraftPlayer {
  id: number;
  name: string;
  position: string;
  /** All positions this player is eligible to play, sorted by games played (most → least) */
  eligiblePositions?: string[];
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
  /** Career average points per game (hitter PPG for batters, pitching PPG for pitchers) */
  ppg?: number | null;
}

export interface AvailableDraftPlayer {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  /** All positions this player is eligible to play (from playerEligiblePositions table) */
  eligiblePositions?: string[] | null;
  hitterAvgPointsPerGame?: number | null;
  pitchingAvgPointsPerGame?: number | null;
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
   * pitchers). eligiblePositions is used to fix position display for drafted
   * players who are no longer in the availablePlayers list (LS-3647). */
  player?: {
    id: number;
    firstName: string;
    lastName: string;
    eligiblePositions?: string[] | null;
  } | null;
}

export interface LeagueTeam {
  id: string;
  name: string;
  leagueId: number;
  isCpu?: boolean;
  /** userId of the primary manager for this team (from leagueMembers). */
  managerId?: number | null;
}

export interface IntelligenceRecommendation {
  player: DraftPlayer;
  score: number;
  topStats: Array<{ label: string; value: string }>;
  reason: string;
}

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
  /** Projected fantasy points per matchup (hitter_avg_ppg * gamesPerMatchup + pitching_avg_ppg * pitcherStartsPerMatchup) */
  ppg?: number | null;
  /** First MLB season (4-digit year). When paired with careerEndYear, drives the career-span sub-line. */
  careerStartYear?: number | null;
  /** Final MLB season (4-digit year). */
  careerEndYear?: number | null;
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
  projectedMatchupPoints?: number | null;
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
    /** MLB Stats API id — keys the spectator splash headshot (img.mlbstatic.com). */
    mlbPlayerId?: number | null;
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

/**
 * A player's cached most-notable Statcast play, rendered as the animated
 * stat graphic during the spectator pick splash (LS-9095). Metric fields are
 * null when the source feed carried no Statcast tracking for the play.
 */
export interface NotablePlaySummary {
  mlbPlayerId: number;
  playerRole: 'batter' | 'pitcher';
  /** Official game date (YYYY-MM-DD). */
  gameDate: string;
  /** MLB event type code, e.g. 'home_run', 'strikeout'. */
  eventType: string;
  /** Human-readable play description from the game feed. */
  description: string;
  exitVelocity: number | null;
  launchAngle: number | null;
  hitDistance: number | null;
  pitchSpeed: number | null;
  pitchType: string | null;
  /** User-initiated MLB Film Room link-out — never an embedded video. */
  filmRoomUrl: string | null;
}

export interface IntelligenceRecommendation {
  player: DraftPlayer;
  score: number;
  topStats: Array<{ label: string; value: string }>;
  reason: string;
}

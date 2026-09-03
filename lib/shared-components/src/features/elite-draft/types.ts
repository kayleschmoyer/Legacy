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
  /** Career WAR (offensive for hitters, pitching for pitchers). Not currently
   * populated by usePlayerData — the BASEBALL_COLUMNS WAR column renders an
   * em-dash until a source is wired up. Declared here (rather than via a
   * permissive widening cast in statColumns.ts) so the compiler enforces the
   * field on the same type BASEBALL_COLUMNS reads (LS-9478). */
  war?: number;
  /** Projected fantasy points per matchup (hitter_avg_ppg * gamesPerMatchup + pitching_avg_ppg * pitcherStartsPerMatchup) */
  ppg?: number | null;
  /** First MLB season (4-digit year). When paired with careerEndYear, drives the career-span sub-line. */
  careerStartYear?: number | null;
  /** Final MLB season (4-digit year). */
  careerEndYear?: number | null;
  /** Stack-rank ADP fallback — see AvailableDraftPlayer.adp. Stable across the draft (not the player's index in the remaining/undrafted list). */
  adp?: number | null;
  /** Franchise the player is most associated with (e.g. 'NYY', 'BRO'),
   * derived server-side from season rows (most games played, tie-broken by
   * latest season). Career club, not present-day — defunct and relocated
   * franchises are represented. Null when no seasons are on file, which the
   * board renders as an em-dash rather than a fabricated code (LS-9832). */
  club?: string | null;
  // Football stat fields (LS-9478), sourced from getDraftFootballPlayerStats.
  // Undefined — never 0 — when the player has no career row in that stat
  // category, so STAT_COLUMNS_BY_SPORT renders an em-dash rather than a
  // fabricated measurement (the LS-9473 postmortem this ticket exists to
  // avoid repeating).
  /** career_football_passing.yds */
  passYds?: number;
  /** career_football_passing.td */
  passTd?: number;
  /** career_football_rushing.yds */
  rushYds?: number;
  /** career_football_rushing.td */
  rushTd?: number;
  /** career_football_receiving.rec */
  rec?: number;
  /** career_football_receiving.td */
  recTd?: number;
  /**
   * Board's generic TD column = rushTd + recTd. Passing TDs are intentionally
   * excluded (they're already implied by passYds for QBs); undefined only
   * when the player has neither a rushing nor a receiving row, not when both
   * are a measured 0.
   */
  td?: number;
  /** career_football_kicking.fgm */
  fg?: number;
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
  /**
   * Stack-rank fallback for Average Draft Position: the player's 1-based rank
   * across the league's entire draftable pool by projected value, using the
   * league's customized scoring settings when it has ever edited them
   * (falling back to default scoring otherwise). Stable for the life of the
   * draft — does not renumber as other players are drafted, searched for, or
   * filtered out of the current page. Real historical ADP data isn't
   * collected yet.
   */
  adp?: number | null;
  /** Franchise the player is most associated with (e.g. 'NYY', 'BRO'),
   * derived server-side from season rows (most games played, tie-broken by
   * latest season). Career club, not present-day — defunct and relocated
   * franchises are represented. Null when no seasons are on file, which the
   * board renders as an em-dash rather than a fabricated code (LS-9832). */
  club?: string | null;
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

/**
 * Stats lookup entry built from the getDraftFootballPlayerStats query
 * (LS-9478). Fields are undefined — never 0 — when the player has no row in
 * that career_football_* table.
 */
export interface PlayerFootballStatsEntry {
  playerId: number;
  passYds?: number;
  passTd?: number;
  rushYds?: number;
  rushTd?: number;
  rec?: number;
  recTd?: number;
  fg?: number;
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
    /** Career franchise abbreviation — see DraftPlayer.club (LS-9832). */
    club?: string | null;
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

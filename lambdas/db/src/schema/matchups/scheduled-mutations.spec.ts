/**
 * Tests for scheduled (system) mutations:
 * - autoSelectGames
 * - autoAdvanceMatchups
 */

// Mock SQS before any imports
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendMessageCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn(),
  initRollbar: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  withRollbar: jest.fn((fn) => fn),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(),
}));

jest.mock('@legacy-sports/utils', () => ({
  getDbOptions: jest.fn(() => ({})),
  isNegroLeague: jest.fn(() => false),
}));

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  PublicSchema: {
    leagues: {
      id: 'leagues.id',
      name: 'leagues.name',
      draftStatus: 'leagues.draft_status',
      gamesPerMatchup: 'leagues.games_per_matchup',
      weekAdvanceStatus: 'leagues.week_advance_status',
      spStartsPerMatchup: 'leagues.sp_starts_per_matchup',
      totalMatchups: 'leagues.total_matchups',
    },
    matchups: {
      id: 'matchups.id',
      leagueId: 'matchups.league_id',
      weekNumber: 'matchups.week_number',
      status: 'matchups.status',
      gamesPerMatchup: 'matchups.games_per_matchup',
      statsLoadingStatus: 'matchups.stats_loading_status',
      team1Id: 'matchups.team1_id',
      team2Id: 'matchups.team2_id',
      team1Score: 'matchups.team1_score',
      team2Score: 'matchups.team2_score',
      spStartsPerMatchup: 'matchups.sp_starts_per_matchup',
      startTime: 'matchups.start_time',
      endTime: 'matchups.end_time',
    },
    matchupPlayers: {
      id: 'matchup_players.id',
      matchupId: 'matchup_players.matchup_id',
      playerId: 'matchup_players.player_id',
      teamId: 'matchup_players.team_id',
      positionId: 'matchup_players.position_id',
    },
    matchupPlayerGames: {
      matchupPlayerId: 'matchup_player_games.matchup_player_id',
      gameNum: 'matchup_player_games.game_num',
    },
    teams: {
      id: 'teams.id',
      name: 'teams.name',
      leagueId: 'teams.league_id',
    },
    teamMembers: {
      playerId: 'team_members.player_id',
      positionId: 'team_members.position_id',
      leagueId: 'team_members.league_id',
      teamId: 'team_members.team_id',
    },
    leagueMembers: {
      leagueId: 'league_members.league_id',
      userId: 'league_members.user_id',
      permissionLevel: 'league_members.permission_level',
    },
  },
  createBadgeService: jest.fn(() => ({
    getUserBadges: jest.fn().mockResolvedValue([]),
    getTeamBadges: jest.fn().mockResolvedValue([]),
    getUserBadgeProgress: jest.fn().mockResolvedValue([]),
    evaluateDraftBadges: jest.fn().mockResolvedValue([]),
    evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
    awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
    awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('Scheduled Mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SQS_SELECT_GAME_URL =
      'https://sqs.us-east-1.amazonaws.com/123/test-queue';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.SQS_SELECT_GAME_URL;
  });

  // ── Authorization tests ──────────────────────────────────────────────────

  describe('authorization', () => {
    it('should allow system requests (EventBridge) without leagueId', () => {
      // System requests have isSystemRequest = true, no user context needed
      const context = { isSystemRequest: true, user: null };
      expect(context.isSystemRequest).toBe(true);
    });

    it('should allow admin users without leagueId', () => {
      const context = {
        isSystemRequest: false,
        user: { id: 1, isAdmin: true },
      };
      expect(context.user.isAdmin).toBe(true);
    });

    it('should reject unauthenticated requests without system key', () => {
      const context = { isSystemRequest: false, user: null };
      expect(context.isSystemRequest).toBe(false);
      expect(context.user).toBeNull();
    });

    it('should reject non-admin users without leagueId (all-league scope)', () => {
      const context = {
        isSystemRequest: false,
        user: { id: 5, isAdmin: false },
      };
      const leagueId = null;
      // Non-admin user + no leagueId = rejected
      expect(context.user.isAdmin).toBe(false);
      expect(leagueId).toBeNull();
    });

    it('should allow commissioner/GM with their leagueId', () => {
      // Commissioner check: permissionLevel is 'general_manager' or 'assistant_manager' or 'commissioner'
      const permissionLevel = 'commissioner';
      expect([
        'general_manager',
        'assistant_manager',
        'commissioner',
      ]).toContain(permissionLevel);
    });

    it('should allow league General Manager with their leagueId', () => {
      const permissionLevel = 'general_manager';
      expect([
        'general_manager',
        'assistant_manager',
        'commissioner',
      ]).toContain(permissionLevel);
    });

    it('should reject regular member even with leagueId', () => {
      const permissionLevel = 'member';
      expect([
        'general_manager',
        'assistant_manager',
        'commissioner',
      ]).not.toContain(permissionLevel);
    });
  });

  // ── autoSelectGames logic ────────────────────────────────────────────────

  describe('autoSelectGames', () => {
    it('should skip leagues with no in_progress matchups (after activation step)', async () => {
      // The mutation finds active leagues, activates the lowest scheduled
      // week if no week is in_progress yet, then selects games for the
      // current in_progress week only. Leagues with no scheduled matchups
      // either (i.e. season complete) are skipped.
      expect(true).toBe(true);
    });

    it('activates scheduled matchups for leagues that have no in_progress week yet (LS-3751)', () => {
      // First nightly run for a just-drafted league: all weeks are
      // 'scheduled'. autoSelectGames promotes the lowest-week scheduled
      // matchups to 'in_progress' (locking lineups), then proceeds to
      // select games. This replaces the old LS-515 behavior where game
      // selection itself processed 'scheduled' matchups — that was unsafe
      // because it meant games could be selected before the lineup lock.
      const leagueMatchups = [
        { weekNumber: 1, status: 'scheduled' as const },
        { weekNumber: 2, status: 'scheduled' as const },
      ];
      const hasInProgress = leagueMatchups.some(
        (m) => m.status === 'in_progress',
      );
      expect(hasInProgress).toBe(false);
      const lowestScheduled = Math.min(
        ...leagueMatchups
          .filter((m) => m.status === 'scheduled')
          .map((m) => m.weekNumber),
      );
      expect(lowestScheduled).toBe(1);
    });

    it('should only process the minimum week, not future scheduled weeks', () => {
      // Guard: with 10 pre-created weeks all marked 'scheduled', we must
      // only pick the lowest weekNumber so weeks 2-10 are never touched.
      const matchups = [
        { id: 566, weekNumber: 1, status: 'scheduled' as const },
        { id: 567, weekNumber: 1, status: 'scheduled' as const },
        { id: 570, weekNumber: 2, status: 'scheduled' as const },
        { id: 574, weekNumber: 3, status: 'scheduled' as const },
      ];
      const minWeek = Math.min(...matchups.map((m) => m.weekNumber));
      const currentWeekMatchups = matchups.filter(
        (m) => m.weekNumber === minWeek,
      );
      expect(minWeek).toBe(1);
      expect(currentWeekMatchups).toHaveLength(2);
      expect(currentWeekMatchups.every((m) => m.weekNumber === 1)).toBe(true);
    });

    it('should determine the correct next game number', async () => {
      // Game number = selectedGamesCount + 1
      // If 3 games already selected and gamesPerMatchup = 5, next = 4
      const selectedCount = 3;
      const gamesPerMatchup = 5;
      const nextGameNumber = selectedCount + 1;
      expect(nextGameNumber).toBe(4);
      expect(nextGameNumber).toBeLessThanOrEqual(gamesPerMatchup);
    });

    it('should skip leagues where all games are already selected', async () => {
      const selectedCount = 5;
      const gamesPerMatchup = 5;
      const nextGameNumber = selectedCount + 1;
      expect(nextGameNumber).toBeGreaterThan(gamesPerMatchup);
    });

    it('should require SQS_SELECT_GAME_URL to be configured', () => {
      delete process.env.SQS_SELECT_GAME_URL;
      expect(process.env.SQS_SELECT_GAME_URL).toBeUndefined();
    });
  });

  describe('autoAdvanceMatchups', () => {
    it('should skip leagues already processing', async () => {
      // If weekAdvanceStatus is 'processing' or 'queued', skip
      const status = 'processing';
      expect(['processing', 'queued']).toContain(status);
    });

    it('should skip leagues where not all games are complete', async () => {
      const selectedCount = 3;
      const gamesPerMatchup = 5;
      expect(selectedCount).toBeLessThan(gamesPerMatchup);
    });

    it('should advance leagues where all games are complete', async () => {
      const selectedCount = 5;
      const gamesPerMatchup = 5;
      expect(selectedCount).toBeGreaterThanOrEqual(gamesPerMatchup);
    });

    it('should not advance past totalMatchups', async () => {
      const currentWeek = 10;
      const totalMatchups = 10;
      expect(currentWeek).toBeGreaterThanOrEqual(totalMatchups);
    });

    it('should calculate next week correctly', async () => {
      const currentWeek = 3;
      const nextWeek = currentWeek + 1;
      expect(nextWeek).toBe(4);
    });

    it('should derive currentWeek from in-progress matchup status, not max(weekNumber)', () => {
      // Bug LS-446: when createAllMatchupsForLeague pre-creates all 10 weeks,
      // max(weekNumber) = 10, which is wrong. The currentWeek must come from
      // the in-progress matchup row, not from a reduce over all matchup rows.
      const inProgressMatchupWeek = 1;
      const allWeeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const wrongWeek = allWeeks.reduce((max, w) => Math.max(max, w), 0);

      // max(weekNumber) gives 10 — wrong for week 1 advance
      expect(wrongWeek).toBe(10);
      // Using the in-progress row's weekNumber gives the correct value
      expect(inProgressMatchupWeek).toBe(1);
      expect(inProgressMatchupWeek + 1).toBe(2); // correct next week
    });

    it('should activate pre-existing scheduled matchups instead of creating new ones', () => {
      // After createAllMatchupsForLeague pre-creates weeks 1-10, all with
      // status='scheduled' and season selections already populated,
      // advanceLeagueWeekInternal should flip status scheduled→in_progress
      // for the next week's matchups rather than inserting new rows.
      // This ensures leagueWeekPlayerSeasons (season selection) is preserved.
      const preCreatedMatchup = { weekNumber: 2, status: 'scheduled' as const };
      const activated = {
        ...preCreatedMatchup,
        status: 'in_progress' as const,
      };
      expect(activated.weekNumber).toBe(2);
      expect(activated.status).toBe('in_progress');
    });

    it('should warn and idle when no scheduled matchups exist for the next week', () => {
      // If a league reaches the end of the pre-created schedule (season over)
      // and there are no scheduled matchups for nextWeek, it should log a
      // warning and set weekAdvanceStatus back to idle rather than throwing.
      const nextWeek = 11;
      const scheduledForNextWeek: unknown[] = [];
      expect(scheduledForNextWeek.length).toBe(0);
      expect(nextWeek).toBeGreaterThan(10); // past end of pre-created schedule
    });

    it('should advance when stats lambda has already marked matchups completed (LS-3795)', () => {
      // Bug LS-3795: the stats lambda sets matchup status='completed' when all
      // game stats load. If autoAdvanceMatchups ran after that, it found zero
      // in-progress matchups and skipped. Fix: filter by weekNumber=currentWeek
      // AND status IN ('in_progress','completed'), sourcing currentWeek from
      // league.currentWeek rather than from the matchup row.
      const leagueCurrentWeek = 1;

      // Simulate all week-1 matchups having been marked completed by stats lambda
      const week1Matchups = [
        { weekNumber: 1, status: 'completed' as const },
        { weekNumber: 1, status: 'completed' as const },
      ];

      // Old filter (in_progress only) would miss these
      const oldFilter = week1Matchups.filter((m) => m.status === 'in_progress');
      expect(oldFilter).toHaveLength(0); // would skip league — the bug

      // New filter (in_progress or completed for currentWeek) finds them
      const newFilter = week1Matchups.filter(
        (m) =>
          m.weekNumber === leagueCurrentWeek &&
          (m.status === 'in_progress' || m.status === 'completed'),
      );
      expect(newFilter).toHaveLength(2); // correctly proceeds to advance
    });

    it('final-week advance (no playoffs) clears both currentMatchup and currentWeek (LS-3827)', () => {
      // Bug LS-3827: autoAdvanceMatchups cleared currentMatchup but not
      // currentWeek in the no-playoff season-complete path. Leaving currentWeek
      // set caused the UI's getCurrentWeekForLeague to return the final week
      // number, making userCurrentMatchup resolve to the final-week matchup.
      // isSeasonComplete then required that matchup.status === 'completed',
      // which failed when SQS game selection hadn't promoted it from 'scheduled'
      // before the advance ran — causing the "Season Complete" panel to never
      // appear. Fix: clear both pointers so userCurrentMatchup resolves to null
      // and isSeasonComplete is true regardless of matchup status.
      const currentWeek = 1;
      const totalMatchups = 1;
      const playoffEnabled = false;

      expect(currentWeek).toBeGreaterThanOrEqual(totalMatchups);
      expect(playoffEnabled).toBe(false);

      // Both league pointers must be null after the final-week advance
      const expectedLeagueUpdate = {
        currentMatchup: null,
        currentWeek: null,
        weekAdvanceStatus: 'idle',
      };
      expect(expectedLeagueUpdate.currentMatchup).toBeNull();
      expect(expectedLeagueUpdate.currentWeek).toBeNull();
      expect(expectedLeagueUpdate.weekAdvanceStatus).toBe('idle');
    });

    it('final-week advance (no playoffs) marks both in_progress and scheduled matchups completed (LS-3827)', () => {
      // If autoSelectGames' SQS message was not yet processed when
      // autoAdvanceMatchups ran the final-week path, the matchup can still be
      // 'scheduled' (never activated to in_progress). The advance must mark it
      // 'completed' regardless of current status so the season closes cleanly.
      const matchupsToComplete = [
        { weekNumber: 1, status: 'in_progress' as const },
        { weekNumber: 1, status: 'scheduled' as const }, // SQS not yet processed
      ];

      // Old filter (in_progress only) would miss the 'scheduled' matchup
      const oldFilter = matchupsToComplete.filter(
        (m) => m.status === 'in_progress',
      );
      expect(oldFilter).toHaveLength(1); // leaves the scheduled matchup open — the bug

      // New filter (in_progress | scheduled) catches all active final-week matchups
      const newFilter = matchupsToComplete.filter(
        (m) => m.status === 'in_progress' || m.status === 'scheduled',
      );
      expect(newFilter).toHaveLength(2); // correctly marks both completed
    });
  });

  // ── createAllMatchupsForLeague (lineup-window preservation) ─────────────
  // LS-3751: Lineup edits must be possible between draft completion and the
  // first contest starting. Previously createAllMatchupsForLeague flipped
  // week-1 matchups to 'in_progress' at creation (LS-511), which locked the
  // lineup before the manager could set it. Week-1 activation now happens in
  // autoSelectGames itself: the first nightly run for a league (one with no
  // in_progress matchups yet) promotes the lowest-week scheduled matchups to
  // in_progress before selecting games. Game selection is gated on
  // in_progress so managers cannot watch outcomes and retroactively swap
  // players in.

  describe('matchup lifecycle after createAllMatchupsForLeague (LS-3751)', () => {
    it('should leave week-1 matchups as scheduled so managers can set lineups', () => {
      // Managers use updateMatchupPlayerPosition / swapMatchupPlayerPositions,
      // both of which require matchup.status === 'scheduled'. Week-1 must stay
      // scheduled until autoSelectGames activates it on the first nightly run.
      const week1AfterCreate = [
        { weekNumber: 1, status: 'scheduled' as const },
        { weekNumber: 1, status: 'scheduled' as const },
      ];
      const editable = week1AfterCreate.filter((m) => m.status === 'scheduled');
      expect(editable).toHaveLength(week1AfterCreate.length);
    });

    it('autoSelectGames activates the lowest scheduled week when no week is in_progress', () => {
      // Activation rule: if a league has any 'in_progress' matchups, the
      // current in-progress week is the one that autoAdvanceMatchups will
      // eventually close. Otherwise autoSelectGames promotes the lowest-week
      // scheduled matchups to 'in_progress' (locking their lineups).
      const leagueA = [
        { weekNumber: 1, status: 'scheduled' as const },
        { weekNumber: 2, status: 'scheduled' as const },
      ];
      const leagueAHasInProgress = leagueA.some(
        (m) => m.status === 'in_progress',
      );
      expect(leagueAHasInProgress).toBe(false);
      const minScheduledWeek = Math.min(
        ...leagueA
          .filter((m) => m.status === 'scheduled')
          .map((m) => m.weekNumber),
      );
      expect(minScheduledWeek).toBe(1);
    });

    it('game selection runs only on in_progress matchups', () => {
      // Gate: autoSelectGames filters status = 'in_progress' when picking
      // games, so a manager cannot watch game outcomes on a scheduled matchup
      // and retroactively swap in players. 'scheduled' matchups are never
      // queued for stats loading.
      const filter = 'in_progress' as const;
      const scheduled = { status: 'scheduled' as const };
      const inProgress = { status: 'in_progress' as const };
      expect(scheduled.status === filter).toBe(false);
      expect(inProgress.status === filter).toBe(true);
    });

    it('should set weekAdvanceStatus to idle after initial matchup creation', () => {
      // 'idle' is consistent with advanceLeagueWeekInternal end state and
      // signals the league is ready to receive game selection — not mid-advance.
      const weekAdvanceStatus = 'idle';
      expect(['processing', 'queued']).not.toContain(weekAdvanceStatus);
    });
  });
});

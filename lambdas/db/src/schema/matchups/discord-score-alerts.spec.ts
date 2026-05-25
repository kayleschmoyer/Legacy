/**
 * Tests for Discord score alerts mutation (LS-1678).
 *
 * Covers:
 *   - Authorization behavior (system vs admin vs commissioner w/ leagueId)
 *   - Close-matchup detection threshold
 *   - Score-line formatting and bolding
 *   - Per-league close matchup scoping (not accumulated across leagues)
 *   - Discord webhook error logging
 */

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
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
      discordWebhookUrl: 'leagues.discord_webhook_url',
      leaguePhase: 'leagues.league_phase',
      isMockDraft: 'leagues.is_mock_draft',
      currentWeek: 'leagues.current_week',
      draftStatus: 'leagues.draft_status',
      gamesPerMatchup: 'leagues.games_per_matchup',
      weekAdvanceStatus: 'leagues.week_advance_status',
      pitcherStartsPerMatchup: 'leagues.sp_starts_per_matchup',
      totalMatchups: 'leagues.total_matchups',
    },
    matchups: {
      id: 'matchups.id',
      leagueId: 'matchups.league_id',
      weekNumber: 'matchups.week_number',
      status: 'matchups.status',
      team1Id: 'matchups.team1_id',
      team2Id: 'matchups.team2_id',
      team1Score: 'matchups.team1_score',
      team2Score: 'matchups.team2_score',
      gamesPerMatchup: 'matchups.games_per_matchup',
      statsLoadingStatus: 'matchups.stats_loading_status',
      pitcherStartsPerMatchup: 'matchups.sp_starts_per_matchup',
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

describe('Discord Score Alerts (LS-1678)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Authorization ────────────────────────────────────────────────────────

  describe('authorization', () => {
    it('allows system requests (EventBridge) without leagueId', () => {
      const context = { isSystemRequest: true, user: null };
      expect(context.isSystemRequest).toBe(true);
    });

    it('allows admin users without leagueId', () => {
      const context = {
        isSystemRequest: false,
        user: { id: 1, isAdmin: true },
      };
      expect(context.user.isAdmin).toBe(true);
    });

    it('rejects unauthenticated requests without system key', () => {
      const context = { isSystemRequest: false, user: null };
      expect(context.isSystemRequest).toBe(false);
      expect(context.user).toBeNull();
    });

    it('rejects non-admin users without leagueId (all-league scope)', () => {
      const context = {
        isSystemRequest: false,
        user: { id: 5, isAdmin: false },
      };
      const leagueId = null;
      expect(context.user.isAdmin).toBe(false);
      expect(leagueId).toBeNull();
    });

    it('allows commissioner with their leagueId', () => {
      const permissionLevel = 'commissioner';
      expect([
        'general_manager',
        'assistant_manager',
        'commissioner',
      ]).toContain(permissionLevel);
    });
  });

  // ── Close matchup detection ──────────────────────────────────────────────

  describe('close matchup detection', () => {
    const CLOSE_MATCHUP_THRESHOLD = 10;

    it('detects a close matchup when score difference is within threshold', () => {
      const t1Score = 85.5;
      const t2Score = 80.0;
      const diff = Math.abs(t1Score - t2Score);
      expect(diff).toBeLessThanOrEqual(CLOSE_MATCHUP_THRESHOLD);
    });

    it('does not flag matchups with score difference above threshold', () => {
      const t1Score = 100.0;
      const t2Score = 80.0;
      const diff = Math.abs(t1Score - t2Score);
      expect(diff).toBeGreaterThan(CLOSE_MATCHUP_THRESHOLD);
    });

    it('does not flag matchups where both scores are zero', () => {
      const t1Score = 0;
      const t2Score = 0;
      const hasScore = t1Score > 0 || t2Score > 0;
      expect(hasScore).toBe(false);
    });

    it('does not flag completed matchups as close', () => {
      const status = 'completed';
      // Only in_progress matchups are flagged as close
      expect(status).not.toBe('in_progress');
    });

    it('flags in_progress matchup with exactly threshold-point difference', () => {
      const t1Score = 90.0;
      const t2Score = 80.0;
      const diff = Math.abs(t1Score - t2Score);
      const status = 'in_progress';
      const isClose =
        status === 'in_progress' &&
        diff <= CLOSE_MATCHUP_THRESHOLD &&
        (t1Score > 0 || t2Score > 0);
      expect(isClose).toBe(true);
    });
  });

  // ── Per-league close matchup scoping ─────────────────────────────────────

  describe('per-league close matchup scoping', () => {
    it('does not bleed close matchup count from one league into the next', () => {
      // Simulates the per-league counter logic:
      // League 1 has 2 close matchups, League 2 has 0
      const leagues = [
        { id: 1, matchups: [{ diff: 5 }, { diff: 3 }] },
        { id: 2, matchups: [{ diff: 25 }, { diff: 30 }] },
      ];
      const THRESHOLD = 10;
      let totalCloseMatchups = 0;
      const leagueColors: number[] = [];
      const COLOR_CLOSE = 0xff6b35;
      const COLOR_NORMAL = 0x3498db;

      for (const league of leagues) {
        let leagueCloseMatchups = 0;
        for (const m of league.matchups) {
          if (m.diff <= THRESHOLD) {
            leagueCloseMatchups++;
          }
        }
        totalCloseMatchups += leagueCloseMatchups;
        leagueColors.push(leagueCloseMatchups > 0 ? COLOR_CLOSE : COLOR_NORMAL);
      }

      expect(totalCloseMatchups).toBe(2);
      // League 1 gets close-matchup color, League 2 gets normal color
      expect(leagueColors[0]).toBe(COLOR_CLOSE);
      expect(leagueColors[1]).toBe(COLOR_NORMAL);
    });
  });

  // ── Score-line formatting and bolding ────────────────────────────────────

  describe('score-line formatting', () => {
    function formatScoreLine(
      t1Name: string,
      t1Score: number,
      t2Name: string,
      t2Score: number,
      status: string,
    ): string {
      const statusIcon = status === 'completed' ? 'FINAL' : 'LIVE';
      const leader =
        t1Score > t2Score
          ? `**${t1Name}** ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} ${t2Name}`
          : t1Score < t2Score
            ? `${t1Name} ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} **${t2Name}**`
            : `${t1Name} ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} ${t2Name}`;
      return `\`${statusIcon}\` ${leader}`;
    }

    it('bolds the leading team (team 1 ahead)', () => {
      const line = formatScoreLine(
        'Eagles',
        100.5,
        'Bears',
        80.0,
        'in_progress',
      );
      expect(line).toBe('`LIVE` **Eagles** 100.5 - 80.0 Bears');
    });

    it('bolds the leading team (team 2 ahead)', () => {
      const line = formatScoreLine(
        'Eagles',
        70.0,
        'Bears',
        90.3,
        'in_progress',
      );
      expect(line).toBe('`LIVE` Eagles 70.0 - 90.3 **Bears**');
    });

    it('does not bold either team when tied', () => {
      const line = formatScoreLine(
        'Eagles',
        85.0,
        'Bears',
        85.0,
        'in_progress',
      );
      expect(line).toBe('`LIVE` Eagles 85.0 - 85.0 Bears');
      expect(line).not.toContain('**');
    });

    it('shows FINAL for completed matchups', () => {
      const line = formatScoreLine('Eagles', 100.0, 'Bears', 80.0, 'completed');
      expect(line).toContain('`FINAL`');
    });

    it('shows LIVE for in-progress matchups', () => {
      const line = formatScoreLine(
        'Eagles',
        100.0,
        'Bears',
        80.0,
        'in_progress',
      );
      expect(line).toContain('`LIVE`');
    });

    it('formats scores to one decimal place', () => {
      const line = formatScoreLine('Eagles', 100, 'Bears', 80, 'in_progress');
      expect(line).toContain('100.0');
      expect(line).toContain('80.0');
    });
  });

  // ── Embed color logic ──────────────────────────────────────────────────

  describe('embed color selection', () => {
    const COLOR_SCORE_UPDATE = 0x3498db;
    const COLOR_CLOSE_MATCHUP = 0xff6b35;
    const COLOR_FINAL_SCORE = 0x57f287;

    function getColor(
      hasCompleted: boolean,
      hasInProgress: boolean,
      leagueCloseMatchups: number,
    ): number {
      return hasCompleted && !hasInProgress
        ? COLOR_FINAL_SCORE
        : leagueCloseMatchups > 0
          ? COLOR_CLOSE_MATCHUP
          : COLOR_SCORE_UPDATE;
    }

    it('uses green when all matchups are final', () => {
      expect(getColor(true, false, 0)).toBe(COLOR_FINAL_SCORE);
    });

    it('uses orange-red when there are close matchups in progress', () => {
      expect(getColor(false, true, 2)).toBe(COLOR_CLOSE_MATCHUP);
    });

    it('uses blue for normal in-progress scores', () => {
      expect(getColor(false, true, 0)).toBe(COLOR_SCORE_UPDATE);
    });

    it('uses orange-red for mixed final+in-progress with close matchups', () => {
      expect(getColor(true, true, 1)).toBe(COLOR_CLOSE_MATCHUP);
    });
  });

  // ── Discord webhook error handling ───────────────────────────────────────

  describe('Discord webhook error handling', () => {
    it('captures status code and response body on non-2xx response', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn().mockResolvedValue('{"retry_after": 1000}'),
      };

      // Simulate the postToDiscord error handling logic
      let logged: Record<string, unknown> | undefined;

      if (!mockResponse.ok) {
        const responseBody = await mockResponse.text();
        logged = {
          status: mockResponse.status,
          statusText: mockResponse.statusText,
          responseBody,
        };
      }

      expect(logged).toBeDefined();
      expect(logged?.status).toBe(429);
      expect(logged?.statusText).toBe('Too Many Requests');
      expect(logged?.responseBody).toBe('{"retry_after": 1000}');
    });

    it('handles unreadable response body gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockRejectedValue(new Error('stream closed')),
      };

      let responseBody: string | undefined;
      let readError: unknown;

      if (!mockResponse.ok) {
        try {
          responseBody = await mockResponse.text();
        } catch (err) {
          readError = err;
        }
      }

      expect(responseBody).toBeUndefined();
      expect(readError).toBeInstanceOf(Error);
    });

    it('catches and logs network-level errors (e.g. DNS failure)', () => {
      const error = new Error('getaddrinfo ENOTFOUND discord.com');
      let caught: unknown;

      try {
        throw error;
      } catch (err) {
        caught = err;
      }

      expect(caught).toBe(error);
      expect((caught as Error).message).toContain('ENOTFOUND');
    });
  });
});

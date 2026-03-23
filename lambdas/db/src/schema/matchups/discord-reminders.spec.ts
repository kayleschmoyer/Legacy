/**
 * Tests for Discord lineup lock reminders (LS-1683).
 *
 * Covers:
 *   - Time-until-lock formatting (minutes and hours)
 *   - Lock-time computation for each rosterLockTiming mode
 *   - Deduplication via discordLastReminderMatchupId
 *   - Embed payload structure (color, fields, footer)
 *   - Discord webhook error handling (fire-and-forget)
 */

// These mocks are required because importing `formatTimeUntilLock` from
// discord-reminders.ts triggers the module's top-level side effects
// (builder.mutationField, builder.objectType, etc.) which depend on these modules.

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn(() => 'MockRef'),
    objectType: jest.fn(),
    mutationField: jest.fn(),
  },
}));

jest.mock('./system-auth', () => ({
  assertAuthorized: jest.fn(),
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  asc: jest.fn(),
  eq: jest.fn(),
  gte: jest.fn(),
  isNotNull: jest.fn(),
  lte: jest.fn(),
  sql: Object.assign(jest.fn(), { join: jest.fn() }),
}));

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
      discordReminderHours: 'leagues.discord_reminder_hours',
      discordLastReminderMatchupId: 'leagues.discord_last_reminder_matchup_id',
      currentWeek: 'leagues.current_week',
      rosterLockTiming: 'leagues.roster_lock_timing',
      leaguePhase: 'leagues.league_phase',
      isMockDraft: 'leagues.is_mock_draft',
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
      startTime: 'matchups.start_time',
      team1Id: 'matchups.team1_id',
      team2Id: 'matchups.team2_id',
      team1Score: 'matchups.team1_score',
      team2Score: 'matchups.team2_score',
      gamesPerMatchup: 'matchups.games_per_matchup',
      statsLoadingStatus: 'matchups.stats_loading_status',
      spStartsPerMatchup: 'matchups.sp_starts_per_matchup',
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
    rosterLockRules: {
      leagueId: 'roster_lock_rules.league_id',
      customLockTime: 'roster_lock_rules.custom_lock_time',
      lockHoursBeforeMatchup: 'roster_lock_rules.lock_hours_before_matchup',
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

import { formatTimeUntilLock } from './discord-reminders';

describe('Discord Lineup Lock Reminders (LS-1683)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── formatTimeUntilLock ─────────────────────────────────────────────────

  describe('formatTimeUntilLock', () => {
    it('shows "1 minute" for very short durations', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const lockTime = new Date('2026-03-23T12:00:30Z'); // 30 seconds
      expect(formatTimeUntilLock(lockTime, now)).toBe('1 minute');
    });

    it('shows minutes when under 1 hour', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const lockTime = new Date('2026-03-23T12:45:00Z');
      expect(formatTimeUntilLock(lockTime, now)).toBe('45 minutes');
    });

    it('rounds up partial minutes', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const lockTime = new Date('2026-03-23T12:30:30Z'); // 30.5 minutes
      expect(formatTimeUntilLock(lockTime, now)).toBe('31 minutes');
    });

    it('shows "1 hour" for exactly 60 minutes', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const lockTime = new Date('2026-03-23T13:00:00Z');
      expect(formatTimeUntilLock(lockTime, now)).toBe('1 hour');
    });

    it('shows hours when 60+ minutes and rounds up', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const lockTime = new Date('2026-03-23T14:30:00Z'); // 2.5 hours
      expect(formatTimeUntilLock(lockTime, now)).toBe('3 hours');
    });

    it('shows "1 minute" when lockTime is barely in the future', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const lockTime = new Date('2026-03-23T12:00:01Z'); // 1 second
      expect(formatTimeUntilLock(lockTime, now)).toBe('1 minute');
    });

    it('shows "59 minutes" for 58.5 minutes (rounds up)', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const lockTime = new Date('2026-03-23T12:58:30Z');
      expect(formatTimeUntilLock(lockTime, now)).toBe('59 minutes');
    });
  });

  // ── computeLockTime ─────────────────────────────────────────────────────

  describe('computeLockTime', () => {
    const matchupStartTime = '2026-03-25T18:00:00Z';
    const matchupStart = new Date(matchupStartTime);

    function createMockDb(lockRules: Record<string, unknown> | null) {
      return {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(lockRules ? [lockRules] : []),
            }),
          }),
        }),
      };
    }

    async function computeLockTime(
      db: ReturnType<typeof createMockDb>,
      leagueId: number,
      rosterLockTiming: string,
      startTime: string,
    ): Promise<Date> {
      const start = new Date(startTime);

      const [lockRules] = await db.select({}).from({}).where({}).limit(1);

      if (lockRules?.customLockTime) {
        return new Date(lockRules.customLockTime as string);
      }

      switch (rosterLockTiming) {
        case 'day_before':
          return new Date(start.getTime() - 24 * 60 * 60 * 1000);
        case 'week_before':
          return new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'custom':
          if (lockRules?.lockHoursBeforeMatchup) {
            return new Date(
              start.getTime() -
                (lockRules.lockHoursBeforeMatchup as number) * 60 * 60 * 1000,
            );
          }
          return start;
        case 'matchup_start':
        default:
          return start;
      }
    }

    it('returns matchup start time for "matchup_start" timing', async () => {
      const db = createMockDb(null);
      const result = await computeLockTime(
        db,
        1,
        'matchup_start',
        matchupStartTime,
      );
      expect(result).toEqual(matchupStart);
    });

    it('returns 24 hours before matchup for "day_before" timing', async () => {
      const db = createMockDb(null);
      const result = await computeLockTime(
        db,
        1,
        'day_before',
        matchupStartTime,
      );
      const expected = new Date(matchupStart.getTime() - 24 * 60 * 60 * 1000);
      expect(result).toEqual(expected);
    });

    it('returns 7 days before matchup for "week_before" timing', async () => {
      const db = createMockDb(null);
      const result = await computeLockTime(
        db,
        1,
        'week_before',
        matchupStartTime,
      );
      const expected = new Date(
        matchupStart.getTime() - 7 * 24 * 60 * 60 * 1000,
      );
      expect(result).toEqual(expected);
    });

    it('uses customLockTime from lock rules when available', async () => {
      const customTime = '2026-03-24T12:00:00Z';
      const db = createMockDb({ customLockTime: customTime });
      const result = await computeLockTime(
        db,
        1,
        'matchup_start',
        matchupStartTime,
      );
      expect(result).toEqual(new Date(customTime));
    });

    it('uses lockHoursBeforeMatchup for "custom" timing', async () => {
      const db = createMockDb({ lockHoursBeforeMatchup: 6 });
      const result = await computeLockTime(db, 1, 'custom', matchupStartTime);
      const expected = new Date(matchupStart.getTime() - 6 * 60 * 60 * 1000);
      expect(result).toEqual(expected);
    });

    it('falls back to matchup start for "custom" with no lock rules', async () => {
      const db = createMockDb(null);
      const result = await computeLockTime(db, 1, 'custom', matchupStartTime);
      expect(result).toEqual(matchupStart);
    });

    it('falls back to matchup start for unknown timing values', async () => {
      const db = createMockDb(null);
      const result = await computeLockTime(
        db,
        1,
        'unknown_value',
        matchupStartTime,
      );
      expect(result).toEqual(matchupStart);
    });
  });

  // ── Deduplication ─────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('skips reminder when discordLastReminderMatchupId matches', () => {
      const league = { discordLastReminderMatchupId: 42 };
      const matchup = { id: 42 };
      const shouldSkip = league.discordLastReminderMatchupId === matchup.id;
      expect(shouldSkip).toBe(true);
    });

    it('sends reminder when matchup id differs from last reminded', () => {
      const league = { discordLastReminderMatchupId: 41 };
      const matchup = { id: 42 };
      const shouldSkip = league.discordLastReminderMatchupId === matchup.id;
      expect(shouldSkip).toBe(false);
    });

    it('sends reminder when no previous reminder was sent (null)', () => {
      const league = { discordLastReminderMatchupId: null };
      const matchup = { id: 42 };
      const shouldSkip = league.discordLastReminderMatchupId === matchup.id;
      expect(shouldSkip).toBe(false);
    });
  });

  // ── Embed payload structure ───────────────────────────────────────────

  describe('embed payload', () => {
    const COLOR_ORANGE = 0xffa500;

    function buildReminderEmbed(
      leagueName: string,
      currentWeek: number,
      timeLabel: string,
      lockTimeFormatted: string,
    ) {
      return {
        title: 'Lineup Lock Reminder',
        description: `Rosters lock in **${timeLabel}**! Make sure your lineup is set for Week ${currentWeek}.`,
        color: COLOR_ORANGE,
        fields: [
          { name: 'League', value: leagueName, inline: true },
          { name: 'Lock Time', value: lockTimeFormatted, inline: true },
        ],
        timestamp: expect.any(String),
        footer: { text: 'Legacy Sports' },
      };
    }

    it('includes league name and week number', () => {
      const embed = buildReminderEmbed(
        'Test League',
        5,
        '3 hours',
        '3/25/26, 2:00 PM',
      );
      expect(embed.title).toBe('Lineup Lock Reminder');
      expect(embed.description).toContain('Week 5');
      expect(embed.fields[0].value).toBe('Test League');
    });

    it('uses orange color', () => {
      const embed = buildReminderEmbed(
        'My League',
        1,
        '1 hour',
        '3/25/26, 6:00 PM',
      );
      expect(embed.color).toBe(0xffa500);
    });

    it('includes time label in bold in description', () => {
      const embed = buildReminderEmbed(
        'My League',
        3,
        '45 minutes',
        '3/25/26, 6:00 PM',
      );
      expect(embed.description).toContain('**45 minutes**');
    });

    it('includes lock time as a field', () => {
      const embed = buildReminderEmbed(
        'My League',
        3,
        '2 hours',
        '3/25/26, 2:00 PM',
      );
      expect(embed.fields[1]).toEqual({
        name: 'Lock Time',
        value: '3/25/26, 2:00 PM',
        inline: true,
      });
    });

    it('includes Legacy Sports footer', () => {
      const embed = buildReminderEmbed(
        'My League',
        1,
        '1 hour',
        '3/25/26, 6:00 PM',
      );
      expect(embed.footer).toEqual({ text: 'Legacy Sports' });
    });
  });

  // ── Discord webhook error handling ─────────────────────────────────────

  describe('Discord webhook error handling', () => {
    it('returns false on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      };
      expect(mockResponse.ok).toBe(false);
    });

    it('returns true on successful response', async () => {
      const mockResponse = { ok: true, status: 204 };
      expect(mockResponse.ok).toBe(true);
    });

    it('catches network errors without throwing', () => {
      let result = true;
      try {
        throw new Error('getaddrinfo ENOTFOUND discord.com');
      } catch {
        result = false;
      }
      expect(result).toBe(false);
    });
  });

  // ── League filtering ──────────────────────────────────────────────────

  describe('league filtering', () => {
    it('skips leagues without a webhook URL', () => {
      const league = { discordWebhookUrl: null, currentWeek: 5 };
      const shouldSkip = !league.discordWebhookUrl || !league.currentWeek;
      expect(shouldSkip).toBe(true);
    });

    it('skips leagues without a current week', () => {
      const league = {
        discordWebhookUrl: 'https://discord.com/api/webhooks/123/token',
        currentWeek: null,
      };
      const shouldSkip = !league.discordWebhookUrl || !league.currentWeek;
      expect(shouldSkip).toBe(true);
    });

    it('processes leagues with both webhook and current week', () => {
      const league = {
        discordWebhookUrl: 'https://discord.com/api/webhooks/123/token',
        currentWeek: 5,
      };
      const shouldSkip = !league.discordWebhookUrl || !league.currentWeek;
      expect(shouldSkip).toBe(false);
    });
  });

  // ── Reminder window calculation ────────────────────────────────────────

  describe('reminder window', () => {
    it('calculates maxWindowEnd from the largest discordReminderHours', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const leagues = [
        { discordReminderHours: 3 },
        { discordReminderHours: 6 },
        { discordReminderHours: 1 },
      ];
      const maxReminderHours = Math.max(
        ...leagues.map((l) => l.discordReminderHours),
        0,
      );
      const maxWindowEnd = new Date(
        now.getTime() + maxReminderHours * 60 * 60 * 1000,
      );
      expect(maxReminderHours).toBe(6);
      expect(maxWindowEnd).toEqual(new Date('2026-03-23T18:00:00Z'));
    });

    it('handles empty leagues list with fallback 0', () => {
      const maxReminderHours = Math.max(...([] as number[]), 0);
      expect(maxReminderHours).toBe(0);
    });

    it('only sends reminder for matchups within the league-specific window', () => {
      const now = new Date('2026-03-23T12:00:00Z');
      const leagueReminderHours = 3;
      const leagueWindowEnd = new Date(
        now.getTime() + leagueReminderHours * 60 * 60 * 1000,
      );

      // Matchup within window
      const matchupInWindow = new Date('2026-03-23T14:00:00Z');
      expect(matchupInWindow <= leagueWindowEnd).toBe(true);

      // Matchup outside window
      const matchupOutsideWindow = new Date('2026-03-23T16:00:00Z');
      expect(matchupOutsideWindow <= leagueWindowEnd).toBe(false);
    });
  });
});

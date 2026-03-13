/**
 * Unit tests for the notifications GraphQL resolver (LS-738).
 *
 * Covers:
 *   - getUserNotificationPreferences: UNAUTHENTICATED, null prefs, returns prefs
 *   - getNotificationHistory: UNAUTHENTICATED, returns mapped history
 *   - getUnreadNotificationCount: UNAUTHENTICATED, returns count
 *   - getUserDeviceTokens: UNAUTHENTICATED, returns mapped tokens
 *   - updateNotificationPreferences: UNAUTHENTICATED, returns updated prefs
 *   - registerDeviceToken: UNAUTHENTICATED, success
 *   - disableDeviceToken: UNAUTHENTICATED, returns true
 *   - markNotificationAsRead: UNAUTHENTICATED, returns true
 *   - markAllNotificationsAsRead: UNAUTHENTICATED, returns true
 */

import type { GraphQLSchema } from 'graphql';

describe('notifications resolver', () => {
  let schema: GraphQLSchema;
  let mockNotificationsService: {
    getUserNotificationPreferences: jest.Mock;
    getNotificationHistory: jest.Mock;
    getUnreadNotificationCount: jest.Mock;
    getUserDeviceTokens: jest.Mock;
    updateNotificationPreferences: jest.Mock;
    registerDeviceToken: jest.Mock;
    disableDeviceToken: jest.Mock;
    markNotificationAsRead: jest.Mock;
    markAllNotificationsAsRead: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: unknown;
  };

  const NOW = new Date('2025-01-01T00:00:00.000Z');

  const MOCK_PREFS_RAW = {
    id: 1,
    userId: 10,
    matchupStartedEnabled: true,
    matchupEndedEnabled: true,
    matchupCloseGameEnabled: false,
    matchupReminderEnabled: true,
    pushEnabled: true,
    emailEnabled: false,
    closeGameThreshold: 5,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const MOCK_NOTIFICATION_RAW = {
    id: 100,
    userId: 10,
    notificationType: 'matchup_started',
    title: 'Game On!',
    body: 'Your matchup has started.',
    data: { matchupId: 42, leagueId: 7 },
    isRead: false,
    sentAt: NOW,
    readAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const MOCK_TOKEN_RAW = {
    id: 5,
    userId: 10,
    deviceToken: 'abc123',
    platform: 'ios',
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  beforeEach(() => {
    jest.resetModules();

    mockNotificationsService = {
      getUserNotificationPreferences: jest.fn().mockResolvedValue(null),
      getNotificationHistory: jest.fn().mockResolvedValue([]),
      getUnreadNotificationCount: jest.fn().mockResolvedValue(0),
      getUserDeviceTokens: jest.fn().mockResolvedValue([]),
      updateNotificationPreferences: jest
        .fn()
        .mockResolvedValue(MOCK_PREFS_RAW),
      registerDeviceToken: jest.fn().mockResolvedValue(MOCK_TOKEN_RAW),
      disableDeviceToken: jest.fn().mockResolvedValue(undefined),
      markNotificationAsRead: jest.fn().mockResolvedValue(undefined),
      markAllNotificationsAsRead: jest.fn().mockResolvedValue(undefined),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    // TODO: mocking the entire db-client module is brittle — it tests the mock shape,
    // not the real code. Consider importing the real module and mocking only its
    // external dependencies (database, push service, etc.).
    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        notifications: mockNotificationsService,
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      BADGE_DEFINITIONS: [],
      createBadgeService: jest.fn(() => ({})),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'currentWeek',
          currentMatchup: 'currentMatchup',
          minCareerGames: 'minCareerGames',
          minCareerSeasons: 'minCareerSeasons',
          eraFilter: 'eraFilter',
          hofOnly: 'hofOnly',
          customEraStartYear: 'customEraStartYear',
          customEraEndYear: 'customEraEndYear',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
        },
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
          status: 'status',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'matchupId',
          playerId: 'playerId',
          teamId: 'teamId',
        },
        matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
        leagueWeekPlayerSeasons: {
          playerId: 'playerId',
          season: 'season',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'leagueId',
          season: 'season',
          playerId: 'playerId',
          awardType: 'awardType',
          notes: 'notes',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'leagueId',
          eventType: 'eventType',
          occurredAt: 'occurredAt',
        },
        leagueActivityEventType: { enumValues: [] },
        leagueAchievementRestrictions: {
          id: 'id',
          leagueId: 'leagueId',
          achievementType: 'achievementType',
          isRepeatable: 'isRepeatable',
          playerMinCount: 'playerMinCount',
          rosterMin: 'rosterMin',
          rosterMax: 'rosterMax',
          repeatableRosterMax: 'repeatableRosterMax',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
      PublicDb: {},
    }));

    jest.doMock('../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: jest.fn(),
        getMatchupStats: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 10, isAdmin: false },
      db: {},
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  function getQueryResolver(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} query resolver not found`);
    return field.resolve.bind(field);
  }

  function getMutationResolver(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} mutation resolver not found`);
    return field.resolve.bind(field);
  }

  // ── getUserNotificationPreferences ────────────────────────────────────────

  it('getUserNotificationPreferences: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('getUserNotificationPreferences')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('getUserNotificationPreferences: returns null when no prefs exist', async () => {
    mockNotificationsService.getUserNotificationPreferences.mockResolvedValueOnce(
      null,
    );
    const result = await getQueryResolver('getUserNotificationPreferences')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toBeNull();
    expect(
      mockNotificationsService.getUserNotificationPreferences,
    ).toHaveBeenCalledWith(10);
  });

  it('getUserNotificationPreferences: returns mapped prefs when found', async () => {
    mockNotificationsService.getUserNotificationPreferences.mockResolvedValueOnce(
      MOCK_PREFS_RAW,
    );
    const result = await getQueryResolver('getUserNotificationPreferences')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({
      id: 1,
      userId: 10,
      pushEnabled: true,
      emailEnabled: false,
    });
  });

  // ── getNotificationHistory ────────────────────────────────────────────────

  it('getNotificationHistory: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('getNotificationHistory')(
        {},
        { limit: null, offset: null },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('getNotificationHistory: returns mapped notification history', async () => {
    mockNotificationsService.getNotificationHistory.mockResolvedValueOnce([
      MOCK_NOTIFICATION_RAW,
    ]);
    const result = (await getQueryResolver('getNotificationHistory')(
      {},
      { limit: null, offset: null },
      mockContext,
      undefined as never,
    )) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 100,
      userId: 10,
      notificationType: 'matchup_started',
      title: 'Game On!',
    });
    expect(
      mockNotificationsService.getNotificationHistory,
    ).toHaveBeenCalledWith(10, 50, 0);
  });

  // ── getUnreadNotificationCount ────────────────────────────────────────────

  it('getUnreadNotificationCount: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('getUnreadNotificationCount')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('getUnreadNotificationCount: returns count', async () => {
    mockNotificationsService.getUnreadNotificationCount.mockResolvedValueOnce(
      7,
    );
    const result = await getQueryResolver('getUnreadNotificationCount')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toBe(7);
    expect(
      mockNotificationsService.getUnreadNotificationCount,
    ).toHaveBeenCalledWith(10);
  });

  // ── getUserDeviceTokens ───────────────────────────────────────────────────

  it('getUserDeviceTokens: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('getUserDeviceTokens')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('getUserDeviceTokens: returns mapped device tokens', async () => {
    mockNotificationsService.getUserDeviceTokens.mockResolvedValueOnce([
      MOCK_TOKEN_RAW,
    ]);
    const result = (await getQueryResolver('getUserDeviceTokens')(
      {},
      {},
      mockContext,
      undefined as never,
    )) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 5,
      userId: 10,
      deviceToken: 'abc123',
      platform: 'ios',
      isActive: true,
    });
  });

  // ── updateNotificationPreferences ─────────────────────────────────────────

  it('updateNotificationPreferences: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('updateNotificationPreferences')(
        {},
        { input: { pushEnabled: true } },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('updateNotificationPreferences: updates and returns prefs', async () => {
    const result = await getMutationResolver('updateNotificationPreferences')(
      {},
      { input: { pushEnabled: false, emailEnabled: true } },
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({ id: 1, userId: 10 });
    expect(
      mockNotificationsService.updateNotificationPreferences,
    ).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ pushEnabled: false, emailEnabled: true }),
    );
  });

  // ── registerDeviceToken ───────────────────────────────────────────────────

  it('registerDeviceToken: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('registerDeviceToken')(
        {},
        { input: { deviceToken: 'abc123', platform: 'ios' } },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('registerDeviceToken: registers token and returns DeviceToken', async () => {
    const result = await getMutationResolver('registerDeviceToken')(
      {},
      { input: { deviceToken: 'abc123', platform: 'ios' } },
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({ id: 5, deviceToken: 'abc123' });
    expect(mockNotificationsService.registerDeviceToken).toHaveBeenCalledWith(
      10,
      'abc123',
      'ios',
    );
  });

  // ── disableDeviceToken ────────────────────────────────────────────────────

  it('disableDeviceToken: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('disableDeviceToken')(
        {},
        { deviceToken: 'abc123' },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('disableDeviceToken: returns true after disabling', async () => {
    const result = await getMutationResolver('disableDeviceToken')(
      {},
      { deviceToken: 'abc123' },
      mockContext,
      undefined as never,
    );
    expect(result).toBe(true);
    expect(mockNotificationsService.disableDeviceToken).toHaveBeenCalledWith(
      10,
      'abc123',
    );
  });

  // ── markNotificationAsRead ────────────────────────────────────────────────

  it('markNotificationAsRead: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('markNotificationAsRead')(
        {},
        { notificationId: 100 },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('markNotificationAsRead: returns true', async () => {
    const result = await getMutationResolver('markNotificationAsRead')(
      {},
      { notificationId: 100 },
      mockContext,
      undefined as never,
    );
    expect(result).toBe(true);
    expect(
      mockNotificationsService.markNotificationAsRead,
    ).toHaveBeenCalledWith(10, 100);
  });

  // ── markAllNotificationsAsRead ────────────────────────────────────────────

  it('markAllNotificationsAsRead: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('markAllNotificationsAsRead')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('markAllNotificationsAsRead: returns true', async () => {
    const result = await getMutationResolver('markAllNotificationsAsRead')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toBe(true);
    expect(
      mockNotificationsService.markAllNotificationsAsRead,
    ).toHaveBeenCalledWith(10);
  });
});

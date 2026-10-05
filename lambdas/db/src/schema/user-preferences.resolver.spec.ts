/**
 * Unit tests for the user-preferences GraphQL resolver (LS-7138).
 *
 * Covers:
 *   - getUserPreferences: UNAUTHENTICATED, null prefs, returns mapped prefs
 *   - updateUserPreferences: UNAUTHENTICATED, returns mapped prefs, drops
 *     invalid statsFormat values before they reach the service
 *   - onboardingCompletedAt (LS-10378): default null, set, idempotent re-set,
 *     unauthenticated rejection, caller-scoped (never another user's row)
 */

import type { GraphQLSchema } from 'graphql';

describe('user-preferences resolver', () => {
  let schema: GraphQLSchema;
  let mockUserPreferencesService: {
    getUserPreferences: jest.Mock;
    updateUserPreferences: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: unknown;
  };

  const NOW = new Date('2026-06-20T00:00:00.000Z');

  const MOCK_PREFS_RAW = {
    id: 2,
    userId: 10,
    statsFormat: 'expanded',
    audioEnabled: false,
    onboardingCompletedAt: null as Date | null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  beforeEach(() => {
    jest.resetModules();

    mockUserPreferencesService = {
      getUserPreferences: jest.fn().mockResolvedValue(null),
      updateUserPreferences: jest.fn().mockResolvedValue(MOCK_PREFS_RAW),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    // TODO: mocking the entire db-client module is brittle — it tests the mock
    // shape, not the real code. Mirrors notifications.resolver.spec.ts; consider
    // importing the real module and mocking only its external dependencies.
    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
        createDatabaseService: jest.fn(() => ({
          userPreferences: mockUserPreferencesService,
          notifications: {
            getUserNotificationPreferences: jest.fn(),
            getNotificationHistory: jest.fn(),
            getUnreadNotificationCount: jest.fn(),
            getUserDeviceTokens: jest.fn(),
            updateNotificationPreferences: jest.fn(),
            registerDeviceToken: jest.fn(),
            disableDeviceToken: jest.fn(),
            markNotificationAsRead: jest.fn(),
            markAllNotificationsAsRead: jest.fn(),
          },
          statistics: {
            getOnThisDay: jest.fn(),
            getOnThisDayEvents: jest.fn(),
          },
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
            baseballHofOnly: 'baseballHofOnly',
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
      }),
    );

    jest.doMock('../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: jest.fn(),
        getMatchupStats: jest.fn(),
      },
    }));

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

  // ── getUserPreferences ──────────────────────────────────────────────────────

  it('getUserPreferences: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('getUserPreferences')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
    expect(
      mockUserPreferencesService.getUserPreferences,
    ).not.toHaveBeenCalled();
  });

  it('getUserPreferences: returns null when no prefs exist', async () => {
    mockUserPreferencesService.getUserPreferences.mockResolvedValueOnce(null);
    const result = await getQueryResolver('getUserPreferences')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toBeNull();
    // userId is derived from the authenticated context, never from args.
    expect(mockUserPreferencesService.getUserPreferences).toHaveBeenCalledWith(
      10,
    );
  });

  it('getUserPreferences: returns mapped prefs when found', async () => {
    mockUserPreferencesService.getUserPreferences.mockResolvedValueOnce(
      MOCK_PREFS_RAW,
    );
    const result = await getQueryResolver('getUserPreferences')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({
      id: 2,
      userId: 10,
      statsFormat: 'expanded',
    });
  });

  // ── updateUserPreferences ─────────────────────────────────────────────────

  it('updateUserPreferences: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('updateUserPreferences')(
        {},
        { input: { statsFormat: 'expanded' } },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
    expect(
      mockUserPreferencesService.updateUserPreferences,
    ).not.toHaveBeenCalled();
  });

  it('updateUserPreferences: updates and returns mapped prefs', async () => {
    const result = await getMutationResolver('updateUserPreferences')(
      {},
      { input: { statsFormat: 'expanded' } },
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({
      id: 2,
      userId: 10,
      statsFormat: 'expanded',
    });
    expect(
      mockUserPreferencesService.updateUserPreferences,
    ).toHaveBeenCalledWith(10, { statsFormat: 'expanded' });
  });

  it('updateUserPreferences: drops an invalid statsFormat before persisting', async () => {
    await getMutationResolver('updateUserPreferences')(
      {},
      { input: { statsFormat: 'not-a-format' } },
      mockContext,
      undefined as never,
    );
    // Unknown values are coerced to undefined so the service can apply the
    // column default rather than persist garbage.
    expect(
      mockUserPreferencesService.updateUserPreferences,
    ).toHaveBeenCalledWith(10, { statsFormat: undefined });
  });

  // ── onboardingCompletedAt (LS-10378) ──────────────────────────────────────

  const ONBOARDED_AT = new Date('2026-10-01T12:00:00.000Z');

  it('getUserPreferences: onboardingCompletedAt defaults to null', async () => {
    mockUserPreferencesService.getUserPreferences.mockResolvedValueOnce(
      MOCK_PREFS_RAW,
    );
    const result = (await getQueryResolver('getUserPreferences')(
      {},
      {},
      mockContext,
      undefined as never,
    )) as { onboardingCompletedAt: Date | null };
    expect(result.onboardingCompletedAt).toBeNull();
  });

  it('getUserPreferences: surfaces a stored onboardingCompletedAt', async () => {
    mockUserPreferencesService.getUserPreferences.mockResolvedValueOnce({
      ...MOCK_PREFS_RAW,
      onboardingCompletedAt: ONBOARDED_AT,
    });
    const result = (await getQueryResolver('getUserPreferences')(
      {},
      {},
      mockContext,
      undefined as never,
    )) as { onboardingCompletedAt: Date | null };
    expect(result.onboardingCompletedAt).toEqual(ONBOARDED_AT);
  });

  it('updateUserPreferences: markOnboardingComplete sets the timestamp', async () => {
    mockUserPreferencesService.updateUserPreferences.mockResolvedValueOnce({
      ...MOCK_PREFS_RAW,
      onboardingCompletedAt: ONBOARDED_AT,
    });
    const result = await getMutationResolver('updateUserPreferences')(
      {},
      { input: { markOnboardingComplete: true } },
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({ onboardingCompletedAt: ONBOARDED_AT });
    expect(
      mockUserPreferencesService.updateUserPreferences,
    ).toHaveBeenCalledWith(10, { markOnboardingComplete: true });
  });

  it('updateUserPreferences: re-marking is idempotent and returns the original timestamp', async () => {
    // The service enforces set-once (COALESCE); the resolver must forward the
    // flag each time and surface whatever timestamp the service returns.
    mockUserPreferencesService.updateUserPreferences.mockResolvedValue({
      ...MOCK_PREFS_RAW,
      onboardingCompletedAt: ONBOARDED_AT,
    });
    const run = () =>
      getMutationResolver('updateUserPreferences')(
        {},
        { input: { markOnboardingComplete: true } },
        mockContext,
        undefined as never,
      ) as Promise<{ onboardingCompletedAt: Date }>;
    const first = await run();
    const second = await run();
    expect(second.onboardingCompletedAt).toEqual(first.onboardingCompletedAt);
    expect(second.onboardingCompletedAt).toEqual(ONBOARDED_AT);
  });

  it('updateUserPreferences: markOnboardingComplete false/omitted never reaches the service as a write', async () => {
    await getMutationResolver('updateUserPreferences')(
      {},
      { input: { statsFormat: 'expanded', markOnboardingComplete: false } },
      mockContext,
      undefined as never,
    );
    const [, updates] =
      mockUserPreferencesService.updateUserPreferences.mock.calls[0];
    expect(updates.markOnboardingComplete).toBeUndefined();
  });

  it('updateUserPreferences: rejects an unauthenticated mark-complete', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('updateUserPreferences')(
        {},
        { input: { markOnboardingComplete: true } },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
    expect(
      mockUserPreferencesService.updateUserPreferences,
    ).not.toHaveBeenCalled();
  });

  it('updateUserPreferences: only ever targets the caller, never another user', async () => {
    // The input has no userId; the target is derived from the auth context, so
    // a smuggled userId cannot redirect the write to another user's row.
    await getMutationResolver('updateUserPreferences')(
      {},
      { input: { markOnboardingComplete: true, userId: 999 } },
      mockContext,
      undefined as never,
    );
    expect(
      mockUserPreferencesService.updateUserPreferences,
    ).toHaveBeenCalledWith(10, { markOnboardingComplete: true });
    expect(
      mockUserPreferencesService.updateUserPreferences,
    ).not.toHaveBeenCalledWith(999, expect.anything());
  });
});

/**
 * Unit tests for the GDPR GraphQL resolver (LS-733).
 *
 * Covers:
 *   - myConsents: UNAUTHENTICATED, returns consents
 *   - myDataRequests: UNAUTHENTICATED, returns requests
 *   - privacyPolicyStatus: UNAUTHENTICATED, accepted=true, accepted=false
 *   - recordConsent: UNAUTHENTICATED, success
 *   - revokeConsent: UNAUTHENTICATED, returns null
 *   - acceptPrivacyPolicy: UNAUTHENTICATED, returns accepted status
 *   - requestDataExport: UNAUTHENTICATED, success
 *   - requestDataDeletion: UNAUTHENTICATED, success
 *   - exportMyData: UNAUTHENTICATED, returns formatted export
 */

import type { GraphQLSchema } from 'graphql';

describe('gdpr resolver', () => {
  let schema: GraphQLSchema;
  let mockGdprService: {
    getUserConsents: jest.Mock;
    getUserDataRequests: jest.Mock;
    hasAcceptedPrivacyPolicy: jest.Mock;
    recordConsent: jest.Mock;
    revokeConsent: jest.Mock;
    acceptPrivacyPolicy: jest.Mock;
    requestDataExport: jest.Mock;
    requestDataDeletion: jest.Mock;
    collectUserData: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: unknown;
  };

  const NOW = new Date('2025-01-01T00:00:00.000Z');

  const MOCK_CONSENT = {
    id: 1,
    userId: 10,
    consentType: 'data_processing',
    status: 'granted',
    ipAddress: '127.0.0.1',
    userAgent: 'TestBrowser/1.0',
    grantedAt: NOW,
    revokedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const MOCK_DATA_REQUEST = {
    id: 2,
    userId: 10,
    requestType: 'export',
    status: 'pending',
    requestedAt: NOW,
    processedAt: null,
    completedAt: null,
    exportUrl: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  beforeEach(() => {
    jest.resetModules();

    mockGdprService = {
      getUserConsents: jest.fn().mockResolvedValue([]),
      getUserDataRequests: jest.fn().mockResolvedValue([]),
      hasAcceptedPrivacyPolicy: jest.fn().mockResolvedValue(false),
      recordConsent: jest.fn().mockResolvedValue(MOCK_CONSENT),
      revokeConsent: jest.fn().mockResolvedValue(null),
      acceptPrivacyPolicy: jest.fn().mockResolvedValue(undefined),
      requestDataExport: jest.fn().mockResolvedValue(MOCK_DATA_REQUEST),
      requestDataDeletion: jest.fn().mockResolvedValue(MOCK_DATA_REQUEST),
      collectUserData: jest.fn().mockResolvedValue({
        user: {
          id: 10,
          email: 'user@example.com',
          username: 'testuser',
          createdAt: NOW,
          privacyPolicyAcceptedAt: null,
        },
        consents: [],
        leagues: [],
        teams: [],
        dataRequests: [],
      }),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        gdpr: mockGdprService,
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

  // ── myConsents ────────────────────────────────────────────────────────────

  it('myConsents: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('myConsents')({}, {}, mockContext, undefined as never),
    ).rejects.toThrow('Authentication required');
  });

  it('myConsents: returns user consents', async () => {
    mockGdprService.getUserConsents.mockResolvedValueOnce([MOCK_CONSENT]);
    const result = await getQueryResolver('myConsents')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toEqual([MOCK_CONSENT]);
    expect(mockGdprService.getUserConsents).toHaveBeenCalledWith(10);
  });

  // ── myDataRequests ────────────────────────────────────────────────────────

  it('myDataRequests: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('myDataRequests')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('myDataRequests: returns data requests', async () => {
    mockGdprService.getUserDataRequests.mockResolvedValueOnce([
      MOCK_DATA_REQUEST,
    ]);
    const result = await getQueryResolver('myDataRequests')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toEqual([MOCK_DATA_REQUEST]);
    expect(mockGdprService.getUserDataRequests).toHaveBeenCalledWith(10);
  });

  // ── privacyPolicyStatus ───────────────────────────────────────────────────

  it('privacyPolicyStatus: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('privacyPolicyStatus')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('privacyPolicyStatus: returns accepted=true when user has accepted', async () => {
    mockGdprService.hasAcceptedPrivacyPolicy.mockResolvedValueOnce(true);
    const result = (await getQueryResolver('privacyPolicyStatus')(
      {},
      {},
      mockContext,
      undefined as never,
    )) as { accepted: boolean; acceptedAt: string | null };
    expect(result).toMatchObject({ accepted: true });
    expect(result.acceptedAt).not.toBeNull();
  });

  it('privacyPolicyStatus: returns accepted=false when user has not accepted', async () => {
    mockGdprService.hasAcceptedPrivacyPolicy.mockResolvedValueOnce(false);
    const result = await getQueryResolver('privacyPolicyStatus')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toEqual({ accepted: false, acceptedAt: null });
  });

  // ── recordConsent ─────────────────────────────────────────────────────────

  it('recordConsent: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('recordConsent')(
        {},
        {
          input: {
            consentType: 'data_processing',
            ipAddress: null,
            userAgent: null,
          },
        },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('recordConsent: records consent and returns UserConsent', async () => {
    const result = await getMutationResolver('recordConsent')(
      {},
      {
        input: {
          consentType: 'data_processing',
          ipAddress: '127.0.0.1',
          userAgent: null,
        },
      },
      mockContext,
      undefined as never,
    );
    expect(result).toEqual(MOCK_CONSENT);
    expect(mockGdprService.recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, consentType: 'data_processing' }),
    );
  });

  // ── revokeConsent ─────────────────────────────────────────────────────────

  it('revokeConsent: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('revokeConsent')(
        {},
        { consentType: 'analytics' },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('revokeConsent: revokes consent and returns null when not found', async () => {
    const result = await getMutationResolver('revokeConsent')(
      {},
      { consentType: 'analytics' },
      mockContext,
      undefined as never,
    );
    expect(result).toBeNull();
    expect(mockGdprService.revokeConsent).toHaveBeenCalledWith(10, 'analytics');
  });

  // ── acceptPrivacyPolicy ───────────────────────────────────────────────────

  it('acceptPrivacyPolicy: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('acceptPrivacyPolicy')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('acceptPrivacyPolicy: returns accepted=true', async () => {
    const result = await getMutationResolver('acceptPrivacyPolicy')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({ accepted: true });
    expect(mockGdprService.acceptPrivacyPolicy).toHaveBeenCalledWith(10);
  });

  // ── requestDataExport ─────────────────────────────────────────────────────

  it('requestDataExport: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('requestDataExport')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('requestDataExport: returns DataRequest', async () => {
    const result = await getMutationResolver('requestDataExport')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toEqual(MOCK_DATA_REQUEST);
    expect(mockGdprService.requestDataExport).toHaveBeenCalledWith(10);
  });

  // ── requestDataDeletion ───────────────────────────────────────────────────

  it('requestDataDeletion: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getMutationResolver('requestDataDeletion')(
        {},
        {},
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required');
  });

  it('requestDataDeletion: returns DataRequest', async () => {
    const result = await getMutationResolver('requestDataDeletion')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toEqual(MOCK_DATA_REQUEST);
    expect(mockGdprService.requestDataDeletion).toHaveBeenCalledWith(10);
  });

  // ── exportMyData ──────────────────────────────────────────────────────────

  it('exportMyData: throws UNAUTHENTICATED when not logged in', async () => {
    mockContext.user = null;
    await expect(
      getQueryResolver('exportMyData')({}, {}, mockContext, undefined as never),
    ).rejects.toThrow('Authentication required');
  });

  it('exportMyData: returns formatted data export', async () => {
    const result = await getQueryResolver('exportMyData')(
      {},
      {},
      mockContext,
      undefined as never,
    );
    expect(result).toMatchObject({
      user: expect.objectContaining({ email: 'user@example.com' }),
      consentsJson: '[]',
      leaguesJson: '[]',
      teamsJson: '[]',
      dataRequestsJson: '[]',
    });
    expect(mockGdprService.collectUserData).toHaveBeenCalledWith(10);
  });
});

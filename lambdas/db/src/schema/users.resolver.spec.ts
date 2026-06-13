/**
 * Unit tests for the impersonateUser GraphQL mutation (LS-782).
 *
 * Covers:
 *   - impersonateUser mutation: admin auth, target not found, admin-to-admin blocked,
 *     successful token issuance with TTL, audit log at error level
 */

import type { GraphQLSchema } from 'graphql';

describe('impersonateUser mutation', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };
  let mockContext: {
    user: {
      id: number;
      email: string;
      username: string;
      isAdmin: boolean;
    } | null;
    db: typeof mockDb;
  };
  let mockGetUserById: jest.Mock;
  let mockSign: jest.Mock;
  let mockLogger: {
    info: jest.Mock;
    debug: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    mockGetUserById = jest.fn();
    mockSign = jest.fn().mockReturnValue('mock-jwt-token');
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: mockLogger,
    }));

    jest.doMock('jsonwebtoken', () => ({
      sign: mockSign,
      verify: jest.fn(),
      decode: jest.fn(),
    }));

    jest.doMock('../server/context', () => ({
      getJwtSecret: jest.fn().mockResolvedValue('test-jwt-secret'),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        users: {
          getUserById: mockGetUserById,
        },
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'currentWeek',
          currentMatchup: 'currentMatchup',
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
          positionId: 'positionId',
        },
        players: {
          id: 'id',
          firstName: 'firstName',
          lastName: 'lastName',
          brefId: 'brefId',
        },
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
      user: {
        id: 1,
        email: 'admin@example.com',
        username: 'admin',
        isAdmin: true,
      },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields().impersonateUser;
    if (!field?.resolve) {
      throw new Error('impersonateUser resolver not found');
    }
    return field.resolve;
  }

  it('should reject non-admin users', async () => {
    const resolve = getResolver();
    const nonAdminContext = {
      user: {
        id: 2,
        email: 'user@example.com',
        username: 'user',
        isAdmin: false,
      },
      db: mockDb,
    };

    await expect(
      resolve({}, { userId: 10 }, nonAdminContext, undefined as never),
    ).rejects.toThrow('Forbidden');
  });

  it('should reject unauthenticated requests', async () => {
    const resolve = getResolver();
    const unauthContext = { user: null, db: mockDb };

    await expect(
      resolve({}, { userId: 10 }, unauthContext, undefined as never),
    ).rejects.toThrow();
  });

  it('should throw when target user does not exist', async () => {
    mockGetUserById.mockResolvedValue(null);
    const resolve = getResolver();

    await expect(
      resolve({}, { userId: 999 }, mockContext, undefined as never),
    ).rejects.toThrow('User 999 not found');
  });

  it('should reject impersonation of another admin', async () => {
    mockGetUserById.mockResolvedValue({
      id: 5,
      canonicalEmail: 'other-admin@example.com',
      username: 'otheradmin',
      accessLevel: 'admin',
    });
    const resolve = getResolver();

    await expect(
      resolve({}, { userId: 5 }, mockContext, undefined as never),
    ).rejects.toThrow('cannot impersonate another admin');
  });

  it('should issue a token with the IMPERSONATION_TTL and log an audit event at error level', async () => {
    mockGetUserById.mockResolvedValue({
      id: 10,
      canonicalEmail: 'target@example.com',
      username: 'targetuser',
      accessLevel: 'user',
    });
    const resolve = getResolver();

    const result = await resolve(
      {},
      { userId: 10 },
      mockContext,
      undefined as never,
    );

    // Token returned
    expect(result).toEqual({ token: 'mock-jwt-token' });

    // sign() called with correct TTL and pinned HS256 algorithm
    expect(mockSign).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        impersonatedBy: expect.objectContaining({ id: 1 }),
      }),
      'test-jwt-secret',
      expect.objectContaining({
        algorithm: 'HS256',
        expiresIn: '2h',
        issuer: 'legacy-sports-oauth-proxy',
        audience: 'legacy-sports',
        jwtid: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
    );

    // Audit log at error level with only IDs (no PII)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Admin impersonation token issued',
      expect.objectContaining({
        audit: true,
        actor: { id: 1 },
        target: { id: 10 },
        expiresIn: '2h',
      }),
    );

    // Verify no email or username in the audit log payload
    const auditPayload = mockLogger.error.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(auditPayload.actor).not.toHaveProperty('email');
    expect(auditPayload.actor).not.toHaveProperty('username');
    expect(auditPayload.target).not.toHaveProperty('email');
    expect(auditPayload.target).not.toHaveProperty('username');
  });
});

describe('cleanupLeakedTestUsers mutation', () => {
  let schema: GraphQLSchema;
  let mockContext: {
    user: {
      id: number;
      email: string;
      username: string;
      isAdmin: boolean;
    } | null;
  };
  let mockDeleteLeakedTestUsers: jest.Mock;
  let mockLogger: {
    info: jest.Mock;
    debug: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDeleteLeakedTestUsers = jest.fn();
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: mockLogger,
    }));

    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    }));

    jest.doMock('../server/context', () => ({
      getJwtSecret: jest.fn().mockResolvedValue('test-jwt-secret'),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        users: {
          getUserById: jest.fn(),
          deleteLeakedTestUsers: mockDeleteLeakedTestUsers,
        },
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'cw',
          currentMatchup: 'cm',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'l',
          userId: 'u',
          teamId: 't',
          permissionLevel: 'p',
        },
        teamMembers: {
          id: 'id',
          teamId: 't',
          leagueId: 'l',
          playerId: 'p',
          positionId: 'pos',
        },
        players: { id: 'id', firstName: 'fn', lastName: 'ln', brefId: 'b' },
        matchups: {
          id: 'id',
          leagueId: 'l',
          weekNumber: 'w',
          status: 's',
          team1Id: 't1',
          team2Id: 't2',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'm',
          playerId: 'p',
          teamId: 't',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'p',
          season: 's',
          leagueId: 'l',
          weekNumber: 'w',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'l',
          season: 's',
          playerId: 'p',
          awardType: 'a',
          notes: 'n',
          createdAt: 'c',
          updatedAt: 'u',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'l',
          eventType: 'e',
          occurredAt: 'o',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: { id: 'id', subscriptionTier: 's' },
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
      user: {
        id: 1,
        email: 'admin@example.com',
        username: 'admin',
        isAdmin: true,
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields().cleanupLeakedTestUsers;
    if (!field?.resolve) {
      throw new Error('cleanupLeakedTestUsers resolver not found');
    }
    return field.resolve;
  }

  it('rejects non-admin users', async () => {
    const resolve = getResolver();
    await expect(
      resolve(
        {},
        { dryRun: true },
        { user: { id: 2, email: 'u@e.com', username: 'u', isAdmin: false } },
        undefined as never,
      ),
    ).rejects.toThrow('Admin access required');
  });

  it('rejects minAgeDays below 1', async () => {
    const resolve = getResolver();
    await expect(
      resolve(
        {},
        { dryRun: true, minAgeDays: 0 },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('minAgeDays must be >= 1');
  });

  it('uses the hardcoded LIKE pattern and default 7-day age guard', async () => {
    mockDeleteLeakedTestUsers.mockResolvedValue({
      matched: [],
      deleted: 0,
      errors: [],
    });
    const resolve = getResolver();

    await resolve({}, { dryRun: true }, mockContext, undefined as never);

    expect(mockDeleteLeakedTestUsers).toHaveBeenCalledWith({
      emailLikePattern: 'int-%@test.legacysports.dev',
      minAgeMs: 7 * 24 * 60 * 60 * 1000,
      dryRun: true,
    });
  });

  it('respects a caller-supplied minAgeDays', async () => {
    mockDeleteLeakedTestUsers.mockResolvedValue({
      matched: [],
      deleted: 0,
      errors: [],
    });
    const resolve = getResolver();

    await resolve(
      {},
      { dryRun: false, minAgeDays: 30 },
      mockContext,
      undefined as never,
    );

    expect(mockDeleteLeakedTestUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        minAgeMs: 30 * 24 * 60 * 60 * 1000,
        dryRun: false,
      }),
    );
  });

  it('returns matched/deleted counts and truncates sample emails to 10', async () => {
    const matched = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      canonicalEmail: `int-commissioner-x${i}@test.legacysports.dev`,
      createdAt: new Date(),
    }));
    mockDeleteLeakedTestUsers.mockResolvedValue({
      matched,
      deleted: 14,
      errors: [
        {
          id: 99,
          canonicalEmail: 'int-commissioner-bad@test.legacysports.dev',
          message: 'fk fail',
        },
      ],
    });
    const resolve = getResolver();

    const result = (await resolve(
      {},
      { dryRun: false },
      mockContext,
      undefined as never,
    )) as {
      matched: number;
      deleted: number;
      dryRun: boolean;
      minAgeDays: number;
      sampleEmails: string[];
      errors: string[];
    };

    expect(result.matched).toBe(15);
    expect(result.deleted).toBe(14);
    expect(result.sampleEmails).toHaveLength(10);
    expect(result.sampleEmails[0]).toBe(
      'int-commissioner-x0@test.legacysports.dev',
    );
    expect(result.errors).toEqual([
      'user 99 (int-commissioner-bad@test.legacysports.dev): fk fail',
    ]);
  });

  it('emits an audit log without PII', async () => {
    mockDeleteLeakedTestUsers.mockResolvedValue({
      matched: [
        {
          id: 1,
          canonicalEmail: 'int-x@test.legacysports.dev',
          createdAt: new Date(),
        },
      ],
      deleted: 1,
      errors: [],
    });
    const resolve = getResolver();

    await resolve({}, { dryRun: false }, mockContext, undefined as never);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Leaked test-user cleanup sweep',
      expect.objectContaining({
        audit: true,
        actor: { id: 1 },
        dryRun: false,
        minAgeDays: 7,
        matched: 1,
        deleted: 1,
        errorCount: 0,
      }),
    );
    const payload = mockLogger.error.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.actor).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('sampleEmails');
  });
});

describe('updateUserTheme mutation', () => {
  let schema: GraphQLSchema;
  let mockContext: {
    user: {
      id: number;
      email: string;
      username: string;
      isAdmin: boolean;
    } | null;
  };
  let mockUpdateUserTheme: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockUpdateUserTheme = jest.fn();

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }));

    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    }));

    jest.doMock('../server/context', () => ({
      getJwtSecret: jest.fn().mockResolvedValue('test-jwt-secret'),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        users: {
          getUserById: jest.fn(),
          updateUserTheme: mockUpdateUserTheme,
        },
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'cw',
          currentMatchup: 'cm',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'l',
          userId: 'u',
          teamId: 't',
          permissionLevel: 'p',
        },
        teamMembers: {
          id: 'id',
          teamId: 't',
          leagueId: 'l',
          playerId: 'p',
          positionId: 'pos',
        },
        players: { id: 'id', firstName: 'fn', lastName: 'ln', brefId: 'b' },
        matchups: {
          id: 'id',
          leagueId: 'l',
          weekNumber: 'w',
          status: 's',
          team1Id: 't1',
          team2Id: 't2',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'm',
          playerId: 'p',
          teamId: 't',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'p',
          season: 's',
          leagueId: 'l',
          weekNumber: 'w',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'l',
          season: 's',
          playerId: 'p',
          awardType: 'a',
          notes: 'n',
          createdAt: 'c',
          updatedAt: 'u',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'l',
          eventType: 'e',
          occurredAt: 'o',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: { id: 'id', subscriptionTier: 's' },
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
      user: {
        id: 42,
        email: 'user@example.com',
        username: 'user42',
        isAdmin: false,
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields().updateUserTheme;
    if (!field?.resolve) {
      throw new Error('updateUserTheme resolver not found');
    }
    return field.resolve;
  }

  it('rejects unauthenticated requests', async () => {
    const resolve = getResolver();
    await expect(
      resolve(
        {},
        { themePreference: 'dark' },
        { user: null },
        undefined as never,
      ),
    ).rejects.toThrow(/Authentication required|UNAUTHENTICATED/i);
    expect(mockUpdateUserTheme).not.toHaveBeenCalled();
  });

  it.each(['system', 'light', 'dark'] as const)(
    'updates and returns the user for valid theme %s',
    async (theme) => {
      mockUpdateUserTheme.mockResolvedValue({
        id: 42,
        canonicalEmail: 'user@example.com',
        username: 'user42',
        accessLevel: 'none',
        avatarUrl: null,
        themePreference: theme,
      });
      const resolve = getResolver();

      const result = (await resolve(
        {},
        { themePreference: theme },
        mockContext,
        undefined as never,
      )) as { id: number; themePreference: string };

      expect(mockUpdateUserTheme).toHaveBeenCalledWith(42, theme);
      expect(result).toMatchObject({ id: 42, themePreference: theme });
    },
  );

  it('rejects invalid theme values', async () => {
    const resolve = getResolver();
    await expect(
      resolve(
        {},
        { themePreference: 'sepia' },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow(/themePreference must be one of/i);
    expect(mockUpdateUserTheme).not.toHaveBeenCalled();
  });

  it('returns null when the underlying user lookup fails', async () => {
    mockUpdateUserTheme.mockResolvedValue(null);
    const resolve = getResolver();

    const result = await resolve(
      {},
      { themePreference: 'dark' },
      mockContext,
      undefined as never,
    );

    expect(result).toBeNull();
  });
});

describe('myIdentities query', () => {
  let schema: GraphQLSchema;
  let mockContext: {
    user: {
      id: number;
      email: string;
      username: string;
      isAdmin: boolean;
    } | null;
  };
  let mockGetUserIdentities: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockGetUserIdentities = jest.fn();

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }));

    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    }));

    jest.doMock('../server/context', () => ({
      getJwtSecret: jest.fn().mockResolvedValue('test-jwt-secret'),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        users: {
          getUserById: jest.fn(),
          getUserIdentities: mockGetUserIdentities,
        },
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'cw',
          currentMatchup: 'cm',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'l',
          userId: 'u',
          teamId: 't',
          permissionLevel: 'p',
        },
        teamMembers: {
          id: 'id',
          teamId: 't',
          leagueId: 'l',
          playerId: 'p',
          positionId: 'pos',
        },
        players: { id: 'id', firstName: 'fn', lastName: 'ln', brefId: 'b' },
        matchups: {
          id: 'id',
          leagueId: 'l',
          weekNumber: 'w',
          status: 's',
          team1Id: 't1',
          team2Id: 't2',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'm',
          playerId: 'p',
          teamId: 't',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'p',
          season: 's',
          leagueId: 'l',
          weekNumber: 'w',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'l',
          season: 's',
          playerId: 'p',
          awardType: 'a',
          notes: 'n',
          createdAt: 'c',
          updatedAt: 'u',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'l',
          eventType: 'e',
          occurredAt: 'o',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: { id: 'id', subscriptionTier: 's' },
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
      user: {
        id: 42,
        email: 'user@example.com',
        username: 'user42',
        isAdmin: false,
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().myIdentities;
    if (!field?.resolve) {
      throw new Error('myIdentities resolver not found');
    }
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when not logged in', async () => {
    const resolve = getResolver();
    await expect(
      resolve({}, {}, { user: null }, undefined as never),
    ).rejects.toThrow(/Authentication required|UNAUTHENTICATED/i);
    expect(mockGetUserIdentities).not.toHaveBeenCalled();
  });

  it('returns the caller-scoped identities and never exposes providerAccountId', async () => {
    const linkedAt = new Date('2025-01-02T03:04:05.000Z');
    mockGetUserIdentities.mockResolvedValue([
      {
        id: 7,
        userId: 42,
        provider: 'discord',
        providerEmail: 'gamer@discord.example',
        providerEmailVerified: true,
        providerUsername: 'gamer#1234',
        providerAvatar: 'https://cdn.example/avatar.png',
        linkedAt,
        lastLoginAt: null,
      },
    ]);
    const resolve = getResolver();

    const result = (await resolve(
      {},
      {},
      mockContext,
      undefined as never,
    )) as Array<Record<string, unknown>>;

    // Scoped to the authenticated user only.
    expect(mockGetUserIdentities).toHaveBeenCalledWith(42);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 7,
      userId: 42,
      provider: 'discord',
      providerEmail: 'gamer@discord.example',
      providerEmailVerified: true,
      providerUsername: 'gamer#1234',
      linkedAt: '2025-01-02T03:04:05.000Z',
      lastLoginAt: null,
    });
    // The provider's raw account id must never leak to the client.
    expect(result[0]).not.toHaveProperty('providerAccountId');
  });

  it('returns an empty list when the user has no linked identities', async () => {
    mockGetUserIdentities.mockResolvedValue([]);
    const resolve = getResolver();

    const result = await resolve({}, {}, mockContext, undefined as never);

    expect(result).toEqual([]);
  });
});

describe('setCanonicalEmail mutation', () => {
  let schema: GraphQLSchema;
  let mockContext: {
    user: {
      id: number;
      email: string;
      username: string;
      isAdmin: boolean;
    } | null;
  };
  let mockSetCanonicalEmail: jest.Mock;
  let mockLogger: {
    error: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(() => {
    jest.resetModules();

    mockSetCanonicalEmail = jest.fn();
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/logging', () => ({ LOGGER: mockLogger }));

    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    }));

    jest.doMock('../server/context', () => ({
      getJwtSecret: jest.fn().mockResolvedValue('test-jwt-secret'),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        users: {
          getUserById: jest.fn(),
          getUserIdentities: jest.fn(),
          setCanonicalEmail: mockSetCanonicalEmail,
        },
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'cw',
          currentMatchup: 'cm',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'l',
          userId: 'u',
          teamId: 't',
          permissionLevel: 'p',
        },
        teamMembers: {
          id: 'id',
          teamId: 't',
          leagueId: 'l',
          playerId: 'p',
          positionId: 'pos',
        },
        players: { id: 'id', firstName: 'fn', lastName: 'ln', brefId: 'b' },
        matchups: {
          id: 'id',
          leagueId: 'l',
          weekNumber: 'w',
          status: 's',
          team1Id: 't1',
          team2Id: 't2',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'm',
          playerId: 'p',
          teamId: 't',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'p',
          season: 's',
          leagueId: 'l',
          weekNumber: 'w',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'l',
          season: 's',
          playerId: 'p',
          awardType: 'a',
          notes: 'n',
          createdAt: 'c',
          updatedAt: 'u',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'l',
          eventType: 'e',
          occurredAt: 'o',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: { id: 'id', subscriptionTier: 's' },
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
      user: {
        id: 42,
        email: 'user@example.com',
        username: 'user42',
        isAdmin: false,
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields().setCanonicalEmail;
    if (!field?.resolve) {
      throw new Error('setCanonicalEmail resolver not found');
    }
    return field.resolve.bind(field);
  }

  it('throws UNAUTHENTICATED when not logged in', async () => {
    const resolve = getResolver();
    await expect(
      resolve({}, { identityId: 1 }, { user: null }, undefined as never),
    ).rejects.toThrow(/Authentication required|UNAUTHENTICATED/i);
    expect(mockSetCanonicalEmail).not.toHaveBeenCalled();
  });

  it('returns { user, changed: true } on a successful canonical email change', async () => {
    const updatedUser = {
      id: 42,
      canonicalEmail: 'new@google.example',
      username: 'user42',
      accessLevel: 'user',
      avatarUrl: null,
      themePreference: null,
    };
    mockSetCanonicalEmail.mockResolvedValue({
      user: updatedUser,
      changed: true,
    });
    const resolve = getResolver();

    const result = (await resolve(
      {},
      { identityId: 7 },
      mockContext,
      undefined as never,
    )) as { user: Record<string, unknown>; changed: boolean };

    expect(mockSetCanonicalEmail).toHaveBeenCalledWith(42, 7);
    expect(result.changed).toBe(true);
    expect(result.user.email).toBe('new@google.example');
    expect(result.user.id).toBe(42);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Canonical email updated',
      expect.objectContaining({
        audit: true,
        actor: { id: 42 },
        changed: true,
      }),
    );
  });

  it('returns { user, changed: false } when email was already canonical (no-op)', async () => {
    const currentUser = {
      id: 42,
      canonicalEmail: 'already@example.com',
      username: 'user42',
      accessLevel: 'user',
      avatarUrl: null,
      themePreference: null,
    };
    mockSetCanonicalEmail.mockResolvedValue({
      user: currentUser,
      changed: false,
    });
    const resolve = getResolver();

    const result = (await resolve(
      {},
      { identityId: 5 },
      mockContext,
      undefined as never,
    )) as { user: Record<string, unknown>; changed: boolean };

    expect(result.changed).toBe(false);
    expect(result.user.email).toBe('already@example.com');
  });

  it('surfaces a UserInputError when the identity does not belong to the caller', async () => {
    const err = Object.assign(
      new Error('Identity not found or does not belong to this user'),
      {
        userInput: true,
      },
    );
    mockSetCanonicalEmail.mockRejectedValue(err);
    const resolve = getResolver();

    await expect(
      resolve({}, { identityId: 999 }, mockContext, undefined as never),
    ).rejects.toThrow('Identity not found');
  });

  it('surfaces a UserInputError when the provider email is unverified', async () => {
    const err = Object.assign(
      new Error('Only verified provider emails can be set as canonical'),
      { userInput: true },
    );
    mockSetCanonicalEmail.mockRejectedValue(err);
    const resolve = getResolver();

    await expect(
      resolve({}, { identityId: 3 }, mockContext, undefined as never),
    ).rejects.toThrow('Only verified provider emails');
  });

  it('re-throws unknown errors without modification', async () => {
    const internalErr = new Error('DB connection lost');
    mockSetCanonicalEmail.mockRejectedValue(internalErr);
    const resolve = getResolver();

    await expect(
      resolve({}, { identityId: 1 }, mockContext, undefined as never),
    ).rejects.toThrow('DB connection lost');
  });
});

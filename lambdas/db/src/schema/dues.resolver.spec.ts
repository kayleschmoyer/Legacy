import { GraphQLError, type GraphQLSchema } from 'graphql';

describe('Dues Resolver — Commissioner/GM Permission Guards', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;

  beforeEach(async () => {
    jest.resetModules();

    // Fluent Drizzle mock
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/utils', () => ({
      ...jest.requireActual('@legacy-sports/utils'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
        createDatabaseService: jest.fn(),
        runWithPublicClient: jest.fn(
          async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
        ),
        createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
        createDraftForLeague: jest.fn(),
        DraftService: jest.fn().mockImplementation(() => ({
          startDraft: jest.fn(),
          getDraftStatus: jest.fn(),
        })),
        BADGE_DEFINITIONS: [],
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
          leagueDuesSettings: {
            id: 'id',
            leagueId: 'leagueId',
            enabled: 'enabled',
            amountCents: 'amountCents',
            reminderEnabled: 'reminderEnabled',
            reminderDayOfWeek: 'reminderDayOfWeek',
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
          },
          leagueMemberPaymentStatus: {
            id: 'id',
            leagueId: 'leagueId',
            userId: 'userId',
            paid: 'paid',
            paidAt: 'paidAt',
            markedBy: 'markedBy',
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
          },
          users: {
            id: 'id',
            username: 'username',
          },
          leagueMembers: {
            leagueId: 'leagueId',
            userId: 'userId',
            teamId: 'teamId',
            permissionLevel: 'permissionLevel',
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
          },
          commissionerAuditLog: {
            id: 'id',
            leagueId: 'leagueId',
            userId: 'userId',
            action: 'action',
            targetType: 'targetType',
            targetId: 'targetId',
            details: 'details',
            reason: 'reason',
            createdAt: 'createdAt',
          },
          teamMembers: {
            id: 'id',
            teamId: 'teamId',
            leagueId: 'leagueId',
            playerId: 'playerId',
            positionId: 'positionId',
            acquisitionType: 'acquisitionType',
          },
          matchups: {
            id: 'id',
            leagueId: 'leagueId',
            team1Id: 'team1Id',
            team2Id: 'team2Id',
            team1Score: 'team1Score',
            team2Score: 'team2Score',
            weekNumber: 'weekNumber',
            updatedAt: 'updatedAt',
            status: 'status',
          },
          leagues: {
            id: 'id',
            name: 'name',
            lmNotes: 'lmNotes',
            updatedAt: 'updatedAt',
            isTeamLocked: 'isTeamLocked',
          },
          teams: {
            id: 'id',
            name: 'name',
            leagueId: 'leagueId',
            isLocked: 'isLocked',
            updatedAt: 'updatedAt',
          },
          players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
          matchupPlayers: { id: 'id', matchupId: 'matchupId' },
          matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
          leagueWeekPlayerSeasons: {
            playerId: 'playerId',
            leagueId: 'leagueId',
          },
          leagueAchievementRestrictions: { id: 'id', leagueId: 'leagueId' },
          leagueSeasonAwards: { id: 'id', leagueId: 'leagueId' },
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
      }),
    );

    jest.doMock('./authorization', () => ({
      ...jest.requireActual('./authorization'),
      verifyCommissionerAccess: jest
        .fn()
        .mockResolvedValue({ permissionLevel: 'commissioner' }),
      verifyLeagueMembership: jest
        .fn()
        .mockResolvedValue({ permissionLevel: 'member' }),
    }));

    jest.doMock('../services/roster-service', () => ({
      addPlayerToRoster: jest.fn().mockResolvedValue(undefined),
      checkRosterCapacity: jest.fn().mockResolvedValue({ isFull: false }),
      isPlayerOnRoster: jest.fn().mockResolvedValue(false),
    }));

    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getMutation(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  function getQuery(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  const unauthCtx = { user: null, db: null };

  const now = new Date();
  const duesSettingsRow = {
    id: 1,
    leagueId: 10,
    enabled: true,
    amountCents: 5000,
    reminderEnabled: false,
    reminderDayOfWeek: null,
    createdAt: now,
    updatedAt: now,
  };

  const paymentStatusRow = {
    id: 1,
    leagueId: 10,
    userId: 2,
    paid: true,
    paidAt: now,
    markedBy: 1,
    createdAt: now,
    updatedAt: now,
  };

  // ── updateDuesSettings ────────────────────────────────────────────────────

  describe('updateDuesSettings mutation', () => {
    const validInput = {
      leagueId: 10,
      enabled: true,
      amountCents: 5000,
      reminderEnabled: false,
      reminderDayOfWeek: null,
    };

    it('throws when unauthenticated', async () => {
      const resolver = getMutation('updateDuesSettings');
      await expect(
        resolver({}, { input: validInput }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('calls verifyCommissionerAccess with correct args', async () => {
      mockDb.returning.mockResolvedValueOnce([duesSettingsRow]);

      const resolver = getMutation('updateDuesSettings');
      await resolver(
        {},
        { input: validInput },
        mockContext,
        undefined as never,
      );

      const { verifyCommissionerAccess } = require('./authorization') as {
        verifyCommissionerAccess: jest.Mock;
      };
      expect(verifyCommissionerAccess).toHaveBeenCalledWith(
        mockDb,
        10,
        mockContext.user.id,
      );
    });

    it('rejects non-commissioner users', async () => {
      const { verifyCommissionerAccess } = require('./authorization') as {
        verifyCommissionerAccess: jest.Mock;
      };
      verifyCommissionerAccess.mockRejectedValueOnce(
        new GraphQLError('Not authorized — commissioner access required', {
          extensions: { code: 'FORBIDDEN' },
        }),
      );

      const resolver = getMutation('updateDuesSettings');
      await expect(
        resolver({}, { input: validInput }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('rejects negative dues amount', async () => {
      const resolver = getMutation('updateDuesSettings');
      await expect(
        resolver(
          {},
          { input: { ...validInput, amountCents: -100 } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Dues amount cannot be negative');
    });

    it('rejects invalid reminderDayOfWeek', async () => {
      const resolver = getMutation('updateDuesSettings');
      await expect(
        resolver(
          {},
          {
            input: {
              ...validInput,
              reminderEnabled: true,
              reminderDayOfWeek: 7,
            },
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('reminderDayOfWeek must be between 0');
    });

    it('rejects reminders enabled without day of week', async () => {
      const resolver = getMutation('updateDuesSettings');
      await expect(
        resolver(
          {},
          {
            input: {
              ...validInput,
              reminderEnabled: true,
              reminderDayOfWeek: null,
            },
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('reminderDayOfWeek is required');
    });

    it('creates/updates settings successfully for commissioner', async () => {
      mockDb.returning.mockResolvedValueOnce([duesSettingsRow]);

      const resolver = getMutation('updateDuesSettings');
      const result = (await resolver(
        {},
        { input: validInput },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.leagueId).toBe(10);
      expect(result.enabled).toBe(true);
      expect(result.amountCents).toBe(5000);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('writes a commissioner audit row (LS-10736)', async () => {
      mockDb.returning.mockResolvedValueOnce([duesSettingsRow]);

      const resolver = getMutation('updateDuesSettings');
      await resolver(
        {},
        { input: validInput },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith({
        leagueId: 10,
        userId: 1,
        action: 'update_dues_settings',
        targetType: 'league',
        targetId: 10,
        details: {
          enabled: true,
          amountCents: 5000,
          reminderEnabled: false,
          reminderDayOfWeek: null,
        },
        reason: null,
      });
    });
  });

  // ── markMemberPaid ──────────────────────────────────────────────────────

  describe('markMemberPaid mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('markMemberPaid');
      await expect(
        resolver(
          {},
          { leagueId: 10, userId: 2 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('calls verifyCommissionerAccess with correct args', async () => {
      mockDb.returning.mockResolvedValueOnce([paymentStatusRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberPaid');
      await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      );

      const { verifyCommissionerAccess } = require('./authorization') as {
        verifyCommissionerAccess: jest.Mock;
      };
      expect(verifyCommissionerAccess).toHaveBeenCalledWith(
        mockDb,
        10,
        mockContext.user.id,
      );
    });

    it('verifies target user is a league member', async () => {
      mockDb.returning.mockResolvedValueOnce([paymentStatusRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberPaid');
      await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      );

      const { verifyLeagueMembership } = require('./authorization') as {
        verifyLeagueMembership: jest.Mock;
      };
      expect(verifyLeagueMembership).toHaveBeenCalledWith(mockDb, 10, 2);
    });

    it('rejects non-commissioner users', async () => {
      const { verifyCommissionerAccess } = require('./authorization') as {
        verifyCommissionerAccess: jest.Mock;
      };
      verifyCommissionerAccess.mockRejectedValueOnce(
        new GraphQLError('Not authorized — commissioner access required', {
          extensions: { code: 'FORBIDDEN' },
        }),
      );

      const resolver = getMutation('markMemberPaid');
      await expect(
        resolver(
          {},
          { leagueId: 10, userId: 2 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('marks member as paid successfully', async () => {
      mockDb.returning.mockResolvedValueOnce([paymentStatusRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberPaid');
      const result = (await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.paid).toBe(true);
      expect(result.username).toBe('testuser');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('writes a commissioner audit row targeting the member (LS-10736)', async () => {
      mockDb.returning.mockResolvedValueOnce([paymentStatusRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberPaid');
      await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith({
        leagueId: 10,
        userId: 1,
        action: 'mark_member_paid',
        targetType: 'user',
        targetId: 2,
        details: { username: 'testuser' },
        reason: null,
      });
    });

    it('rejects commissioner marking themselves as paid (LS-4029)', async () => {
      const resolver = getMutation('markMemberPaid');
      await expect(
        resolver(
          {},
          { leagueId: 10, userId: mockContext.user.id },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('cannot mark their own dues as paid'),
        extensions: { code: 'FORBIDDEN' },
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ── markMemberUnpaid ────────────────────────────────────────────────────

  describe('markMemberUnpaid mutation', () => {
    const unpaidRow = { ...paymentStatusRow, paid: false, paidAt: null };

    it('throws when unauthenticated', async () => {
      const resolver = getMutation('markMemberUnpaid');
      await expect(
        resolver(
          {},
          { leagueId: 10, userId: 2 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('calls verifyCommissionerAccess with correct args', async () => {
      mockDb.returning.mockResolvedValueOnce([unpaidRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberUnpaid');
      await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      );

      const { verifyCommissionerAccess } = require('./authorization') as {
        verifyCommissionerAccess: jest.Mock;
      };
      expect(verifyCommissionerAccess).toHaveBeenCalledWith(
        mockDb,
        10,
        mockContext.user.id,
      );
    });

    it('verifies target user is a league member', async () => {
      mockDb.returning.mockResolvedValueOnce([unpaidRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberUnpaid');
      await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      );

      const { verifyLeagueMembership } = require('./authorization') as {
        verifyLeagueMembership: jest.Mock;
      };
      expect(verifyLeagueMembership).toHaveBeenCalledWith(mockDb, 10, 2);
    });

    it('rejects non-commissioner users', async () => {
      const { verifyCommissionerAccess } = require('./authorization') as {
        verifyCommissionerAccess: jest.Mock;
      };
      verifyCommissionerAccess.mockRejectedValueOnce(
        new GraphQLError('Not authorized — commissioner access required', {
          extensions: { code: 'FORBIDDEN' },
        }),
      );

      const resolver = getMutation('markMemberUnpaid');
      await expect(
        resolver(
          {},
          { leagueId: 10, userId: 2 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('marks member as unpaid successfully', async () => {
      mockDb.returning.mockResolvedValueOnce([unpaidRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberUnpaid');
      const result = (await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.paid).toBe(false);
      expect(result.paidAt).toBeNull();
      expect(result.username).toBe('testuser');
    });

    it('writes a commissioner audit row targeting the member (LS-10736)', async () => {
      mockDb.returning.mockResolvedValueOnce([unpaidRow]);
      mockDb.limit.mockResolvedValueOnce([{ username: 'testuser' }]);

      const resolver = getMutation('markMemberUnpaid');
      await resolver(
        {},
        { leagueId: 10, userId: 2 },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith({
        leagueId: 10,
        userId: 1,
        action: 'mark_member_unpaid',
        targetType: 'user',
        targetId: 2,
        details: { username: 'testuser' },
        reason: null,
      });
    });

    it('rejects commissioner marking themselves as unpaid (LS-4029)', async () => {
      const resolver = getMutation('markMemberUnpaid');
      await expect(
        resolver(
          {},
          { leagueId: 10, userId: mockContext.user.id },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          'cannot mark their own dues as unpaid',
        ),
        extensions: { code: 'FORBIDDEN' },
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ── Query permission guards (membership-only, not commissioner) ─────────

  describe('leagueDuesSettings query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('leagueDuesSettings');
      await expect(
        resolver({}, { leagueId: 10 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('verifies league membership (not commissioner)', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getQuery('leagueDuesSettings');
      await resolver({}, { leagueId: 10 }, mockContext, undefined as never);

      const auth = require('./authorization') as {
        verifyLeagueMembership: jest.Mock;
        verifyCommissionerAccess: jest.Mock;
      };
      expect(auth.verifyLeagueMembership).toHaveBeenCalledWith(mockDb, 10, 1);
      expect(auth.verifyCommissionerAccess).not.toHaveBeenCalled();
    });

    it('returns null when no settings exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getQuery('leagueDuesSettings');
      const result = await resolver(
        {},
        { leagueId: 10 },
        mockContext,
        undefined as never,
      );

      expect(result).toBeNull();
    });
  });

  describe('leagueDuesStatus query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('leagueDuesStatus');
      await expect(
        resolver({}, { leagueId: 10 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('verifies league membership (not commissioner)', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const resolver = getQuery('leagueDuesStatus');
      await resolver({}, { leagueId: 10 }, mockContext, undefined as never);

      const auth = require('./authorization') as {
        verifyLeagueMembership: jest.Mock;
        verifyCommissionerAccess: jest.Mock;
      };
      expect(auth.verifyLeagueMembership).toHaveBeenCalledWith(mockDb, 10, 1);
      expect(auth.verifyCommissionerAccess).not.toHaveBeenCalled();
    });

    // LS-10740: the list is built from league membership, so owners who
    // were never marked still appear (as unpaid).
    const memberRow = (
      userId: number,
      permissionLevel: string,
      payment: Partial<typeof paymentStatusRow> | null = null,
    ) => ({
      id: payment?.id ?? null,
      userId,
      permissionLevel,
      username: `owner${userId}`,
      paid: payment?.paid ?? null,
      paidAt: payment?.paidAt ?? null,
      markedBy: payment?.markedBy ?? null,
      createdAt: payment?.createdAt ?? null,
      updatedAt: payment?.updatedAt ?? null,
      memberCreatedAt: now,
      memberUpdatedAt: now,
    });

    it('selects from league_members and left-joins payment status (LS-10740)', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const resolver = getQuery('leagueDuesStatus');
      await resolver({}, { leagueId: 10 }, mockContext, undefined as never);

      const { PublicSchema } = require('@legacy-sports/db-client');
      expect(mockDb.from).toHaveBeenCalledWith(PublicSchema.leagueMembers);
      expect(mockDb.leftJoin).toHaveBeenCalledWith(
        PublicSchema.leagueMemberPaymentStatus,
        expect.anything(),
      );
    });

    it('returns every owner as unpaid when no payment rows exist (LS-10740)', async () => {
      mockDb.where.mockResolvedValueOnce([
        memberRow(1, 'commissioner'),
        memberRow(2, 'general_manager'),
        memberRow(3, 'general_manager'),
      ]);

      const resolver = getQuery('leagueDuesStatus');
      const result = await resolver(
        {},
        { leagueId: 10 },
        mockContext,
        undefined as never,
      );

      expect(result).toHaveLength(3);
      expect(result).toEqual(
        [1, 2, 3].map((userId) =>
          expect.objectContaining({
            id: null,
            leagueId: 10,
            userId,
            username: `owner${userId}`,
            paid: false,
            paidAt: null,
            markedBy: null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
    });

    it('merges existing payment rows with unmarked members (LS-10740)', async () => {
      mockDb.where.mockResolvedValueOnce([
        memberRow(1, 'commissioner'),
        memberRow(2, 'general_manager', paymentStatusRow),
      ]);

      const resolver = getQuery('leagueDuesStatus');
      const result = await resolver(
        {},
        { leagueId: 10 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([
        expect.objectContaining({ userId: 1, id: null, paid: false }),
        expect.objectContaining({
          userId: 2,
          id: 1,
          paid: true,
          paidAt: now,
          markedBy: 1,
        }),
      ]);
    });

    it('omits unmarked assistant managers but keeps marked ones (LS-10740)', async () => {
      mockDb.where.mockResolvedValueOnce([
        memberRow(2, 'general_manager'),
        memberRow(4, 'assistant_manager'),
        memberRow(5, 'assistant_manager', { ...paymentStatusRow, id: 7 }),
      ]);

      const resolver = getQuery('leagueDuesStatus');
      const result = (await resolver(
        {},
        { leagueId: 10 },
        mockContext,
        undefined as never,
      )) as Array<{ userId: number }>;

      expect(result.map((r) => r.userId)).toEqual([2, 5]);
    });
  });
});

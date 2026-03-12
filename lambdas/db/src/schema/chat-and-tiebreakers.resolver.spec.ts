import type { GraphQLSchema } from 'graphql';

describe('Chat and Tiebreakers Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;

  const makeMessage = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    matchupId: 1,
    leagueId: 1,
    senderId: 1,
    messageType: 'text',
    message: 'Hi',
    gifUrl: null,
    metadata: {},
    containsProfanity: false,
    isFlagged: false,
    replyToMessageId: null,
    createdAt: new Date(),
    ...overrides,
  });

  const makeLeagueMsg = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    leagueId: 1,
    userId: 1,
    messageText: 'Hello league',
    timestamp: new Date(),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    ...overrides,
  });

  const makeDirectMsg = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    fromUserId: 1,
    toUserId: 2,
    leagueId: null,
    messageText: 'hey',
    readAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetModules();

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
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('../services/activity-log', () => ({
      insertActivityLog: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
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
        matchupMessages: {
          id: 'id',
          matchupId: 'matchupId',
          leagueId: 'leagueId',
          senderId: 'senderId',
          messageType: 'messageType',
          message: 'message',
          gifUrl: 'gifUrl',
          metadata: 'metadata',
          containsProfanity: 'containsProfanity',
          isFlagged: 'isFlagged',
          replyToMessageId: 'replyToMessageId',
          createdAt: 'createdAt',
        },
        tiebreakerRules: {
          id: 'id',
          leagueId: 'leagueId',
          primaryMethod: 'primaryMethod',
          secondaryMethod: 'secondaryMethod',
          tertiaryMethod: 'tertiaryMethod',
          allowCommissionerOverride: 'allowCommissionerOverride',
          config: 'config',
        },
        tiebreakerHistory: {
          id: 'id',
          matchupId: 'matchupId',
          leagueId: 'leagueId',
          resolvedAt: 'resolvedAt',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        leagueMessages: {
          id: 'id',
          leagueId: 'leagueId',
          userId: 'userId',
          messageText: 'messageText',
          timestamp: 'timestamp',
          messageType: 'messageType',
          gifUrl: 'gifUrl',
          metadata: 'metadata',
        },
        directMessages: {
          id: 'id',
          fromUserId: 'fromUserId',
          toUserId: 'toUserId',
          leagueId: 'leagueId',
          messageText: 'messageText',
          readAt: 'readAt',
          deletedAt: 'deletedAt',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
        },
        leagues: { id: 'id', name: 'name', owner: 'owner' },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
        },
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
        matchupPlayers: { id: 'id', matchupId: 'matchupId' },
        matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
        leagueWeekPlayerSeasons: { playerId: 'playerId', leagueId: 'leagueId' },
        leagueAchievementRestrictions: { id: 'id', leagueId: 'leagueId' },
        leagueSeasonAwards: { id: 'id', leagueId: 'leagueId' },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'leagueId',
          eventType: 'eventType',
          occurredAt: 'occurredAt',
        },
        commissionerAuditLog: { id: 'id', leagueId: 'leagueId' },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1 },
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

  // ── getMatchupMessages ───────────────────────────────────────────────────

  describe('getMatchupMessages query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('getMatchupMessages');
      await expect(
        resolver({}, { matchupId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns messages with limit', async () => {
      const messages = [makeMessage()];
      mockDb.limit.mockResolvedValueOnce(messages);

      const resolver = getQuery('getMatchupMessages');
      const result = (await resolver(
        {},
        { matchupId: 1, limit: 10 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ matchupId: 1 });
    });
  });

  // ── getTiebreakerRules ────────────────────────────────────────────────────

  describe('getTiebreakerRules query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('getTiebreakerRules');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns null when no rules', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getQuery('getTiebreakerRules');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toBeNull();
    });

    it('returns tiebreaker rules', async () => {
      const rule = {
        id: 1,
        leagueId: 1,
        primaryMethod: 'total_fpts',
        config: null,
      };
      mockDb.limit.mockResolvedValueOnce([rule]);

      const resolver = getQuery('getTiebreakerRules');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ primaryMethod: 'total_fpts' });
    });
  });

  // ── getTiebreakerHistory ─────────────────────────────────────────────────

  describe('getTiebreakerHistory query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('getTiebreakerHistory');
      await expect(
        resolver({}, { matchupId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when neither matchupId nor leagueId provided', async () => {
      const resolver = getQuery('getTiebreakerHistory');
      await expect(
        resolver({}, {}, mockContext, undefined as never),
      ).rejects.toThrow('Either matchupId or leagueId must be provided');
    });

    it('returns history by matchupId', async () => {
      const historyRows = [
        {
          id: 1,
          matchupId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockDb.orderBy.mockResolvedValueOnce(historyRows);

      const resolver = getQuery('getTiebreakerHistory');
      const result = (await resolver(
        {},
        { matchupId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(typeof result[0].createdAt).toBe('string'); // ISO converted
    });

    it('returns empty array when league has no matchups', async () => {
      mockDb.where.mockResolvedValueOnce([]); // no matchups for league

      const resolver = getQuery('getTiebreakerHistory');
      const result = await resolver(
        {},
        { leagueId: 5 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });
  });

  // ── getLeagueMessages ─────────────────────────────────────────────────────

  describe('getLeagueMessages query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('getLeagueMessages');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when not a league member', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no membership

      const resolver = getQuery('getLeagueMessages');
      await expect(
        resolver({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Not a member of this league');
    });

    it('returns messages with limit', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ id: 1 }]) // membership
        .mockResolvedValueOnce([makeLeagueMsg()]); // messages

      const resolver = getQuery('getLeagueMessages');
      const result = (await resolver(
        {},
        { leagueId: 1, limit: 20 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ leagueId: 1 });
    });
  });

  // ── getDirectMessages ─────────────────────────────────────────────────────

  describe('getDirectMessages query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('getDirectMessages');
      await expect(
        resolver({}, { otherUserId: 2 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns messages with limit', async () => {
      const dms = [makeDirectMsg()];
      mockDb.limit.mockResolvedValueOnce(dms);

      const resolver = getQuery('getDirectMessages');
      const result = (await resolver(
        {},
        { otherUserId: 2, limit: 10 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ fromUserId: 1, toUserId: 2 });
    });
  });

  // ── getLeagueAnnouncements ────────────────────────────────────────────────

  describe('getLeagueAnnouncements query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('getLeagueAnnouncements');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when not a league member', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no membership

      const resolver = getQuery('getLeagueAnnouncements');
      await expect(
        resolver({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Not a member of this league');
    });

    it('returns announcements for league members', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership
      mockDb.orderBy.mockResolvedValueOnce([
        makeLeagueMsg({ messageType: 'announcement' }),
      ]);

      const resolver = getQuery('getLeagueAnnouncements');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0].messageType).toBe('announcement');
    });
  });

  // ── sendMatchupMessage ────────────────────────────────────────────────────

  describe('sendMatchupMessage mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('sendMatchupMessage');
      await expect(
        resolver(
          {},
          { matchupId: 1, message: 'hi' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when matchup not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no matchup

      const resolver = getMutation('sendMatchupMessage');
      await expect(
        resolver(
          {},
          { matchupId: 999, message: 'hi' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Matchup not found');
    });

    it('sends message and returns it', async () => {
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]); // matchup found
      mockDb.returning.mockResolvedValueOnce([makeMessage()]);

      const resolver = getMutation('sendMatchupMessage');
      const result = (await resolver(
        {},
        { matchupId: 1, message: 'Nice play!' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ matchupId: 1 });
    });
  });

  // ── createTiebreakerRules ──────────────────────────────────────────────────

  describe('createTiebreakerRules mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('createTiebreakerRules');
      await expect(
        resolver(
          {},
          { leagueId: 1, primaryMethod: 'total_fpts' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('creates tiebreaker rules', async () => {
      const rule = {
        id: 1,
        leagueId: 1,
        primaryMethod: 'total_fpts',
        config: null,
      };
      mockDb.returning.mockResolvedValueOnce([rule]);

      const resolver = getMutation('createTiebreakerRules');
      const result = (await resolver(
        {},
        { leagueId: 1, primaryMethod: 'total_fpts' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ primaryMethod: 'total_fpts' });
    });
  });

  // ── sendLeagueMessage ──────────────────────────────────────────────────────

  describe('sendLeagueMessage mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('sendLeagueMessage');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: 'hi' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when message is empty', async () => {
      const resolver = getMutation('sendLeagueMessage');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: '   ' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Message cannot be empty');
    });

    it('throws when not a league member', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no membership

      const resolver = getMutation('sendLeagueMessage');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: 'Hi all' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Not a member of this league');
    });

    it('sends league message successfully', async () => {
      const msg = makeLeagueMsg();
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([msg]);

      const resolver = getMutation('sendLeagueMessage');
      const result = (await resolver(
        {},
        { leagueId: 1, messageText: 'Hello everyone' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ leagueId: 1, userId: 1 });
    });
  });

  // ── postLeagueAnnouncement ─────────────────────────────────────────────────

  describe('postLeagueAnnouncement mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('postLeagueAnnouncement');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: 'hello' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when announcement is empty', async () => {
      const resolver = getMutation('postLeagueAnnouncement');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: '   ' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Announcement cannot be empty');
    });

    it('throws when league not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no league

      const resolver = getMutation('postLeagueAnnouncement');
      await expect(
        resolver(
          {},
          { leagueId: 999, messageText: 'Hello!' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('League not found');
    });

    it('throws when not the commissioner', async () => {
      mockDb.limit.mockResolvedValueOnce([{ owner: 2 }]); // different owner

      const resolver = getMutation('postLeagueAnnouncement');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: 'Hello!' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Only the commissioner can post announcements');
    });

    it('posts announcement successfully', async () => {
      mockDb.limit.mockResolvedValueOnce([{ owner: 1 }]); // is commissioner
      mockDb.returning.mockResolvedValueOnce([
        makeLeagueMsg({ messageType: 'announcement' }),
      ]);

      const resolver = getMutation('postLeagueAnnouncement');
      const result = (await resolver(
        {},
        { leagueId: 1, messageText: 'League update' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ messageType: 'announcement' });
    });
  });

  // ── updateLeagueAnnouncement ───────────────────────────────────────────────

  describe('updateLeagueAnnouncement mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('updateLeagueAnnouncement');
      await expect(
        resolver(
          {},
          { id: 1, leagueId: 1, messageText: 'updated' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when announcement not found', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ owner: 1 }]) // is commissioner
        .mockResolvedValueOnce([]); // no announcement

      const resolver = getMutation('updateLeagueAnnouncement');
      await expect(
        resolver(
          {},
          { id: 999, leagueId: 1, messageText: 'updated' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Announcement not found');
    });

    it('updates announcement successfully', async () => {
      const updated = makeLeagueMsg({
        messageText: 'Updated',
        messageType: 'announcement',
      });
      mockDb.limit
        .mockResolvedValueOnce([{ owner: 1 }]) // is commissioner
        .mockResolvedValueOnce([makeLeagueMsg()]); // existing found
      mockDb.returning.mockResolvedValueOnce([updated]);

      const resolver = getMutation('updateLeagueAnnouncement');
      const result = (await resolver(
        {},
        { id: 1, leagueId: 1, messageText: 'Updated' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result.messageText).toBe('Updated');
    });
  });

  // ── deleteLeagueAnnouncement ───────────────────────────────────────────────

  describe('deleteLeagueAnnouncement mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('deleteLeagueAnnouncement');
      await expect(
        resolver({}, { id: 1, leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when announcement not found', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ owner: 1 }]) // is commissioner
        .mockResolvedValueOnce([]); // no announcement

      const resolver = getMutation('deleteLeagueAnnouncement');
      await expect(
        resolver({}, { id: 999, leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Announcement not found');
    });

    it('deletes announcement and returns true', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ owner: 1 }]) // is commissioner
        .mockResolvedValueOnce([makeLeagueMsg()]); // exists

      const resolver = getMutation('deleteLeagueAnnouncement');
      const result = await resolver(
        {},
        { id: 1, leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
    });
  });

  // ── sendDirectMessage ──────────────────────────────────────────────────────

  describe('sendDirectMessage mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('sendDirectMessage');
      await expect(
        resolver(
          {},
          { toUserId: 2, messageText: 'hi' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when sending to self', async () => {
      const resolver = getMutation('sendDirectMessage');
      await expect(
        resolver(
          {},
          { toUserId: 1, messageText: 'hi' }, // same userId as mockContext.user.id
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Cannot send a direct message to yourself');
    });

    it('throws when message is empty', async () => {
      const resolver = getMutation('sendDirectMessage');
      await expect(
        resolver(
          {},
          { toUserId: 2, messageText: '  ' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Message cannot be empty');
    });

    it('sends direct message successfully', async () => {
      mockDb.returning.mockResolvedValueOnce([makeDirectMsg()]);

      const resolver = getMutation('sendDirectMessage');
      const result = (await resolver(
        {},
        { toUserId: 2, messageText: 'Hey there' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ fromUserId: 1, toUserId: 2 });
    });
  });
});

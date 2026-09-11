import type { GraphQLSchema } from 'graphql';

describe('Chat and Tiebreakers Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;
  let mockCheckAndIncrementRateLimit: jest.Mock;

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
    containsProfanity: false,
    ...overrides,
  });

  const makeChatBlock = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    leagueId: 1,
    matchupId: null,
    blockingUserId: 1,
    blockedUserId: 2,
    scope: 'league',
    createdAt: new Date(),
    expiresAt: null,
    updatedAt: new Date(),
    ...overrides,
  });

  const makeLeagueMessageReport = (
    overrides: Record<string, unknown> = {},
  ) => ({
    id: 1,
    messageId: 1,
    reportedBy: 1,
    reason: 'Abusive language',
    status: 'pending',
    createdAt: new Date(),
    resolvedAt: null,
    reviewedBy: null,
    moderatorNotes: null,
    resolution: null,
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
      ...jest.requireActual('@legacy-sports/utils'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('../services/activity-log', () => ({
      insertActivityLog: jest.fn().mockResolvedValue(undefined),
    }));

    mockCheckAndIncrementRateLimit = jest
      .fn()
      .mockResolvedValue({ allowed: true });
    jest.doMock('./rate-limit', () => ({
      checkAndIncrementRateLimit: mockCheckAndIncrementRateLimit,
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
          mentionedUserIds: 'mentionedUserIds',
          containsProfanity: 'containsProfanity',
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
        matchupChatBlocks: {
          id: 'id',
          leagueId: 'leagueId',
          matchupId: 'matchupId',
          blockingUserId: 'blockingUserId',
          blockedUserId: 'blockedUserId',
          scope: 'scope',
          createdAt: 'createdAt',
          expiresAt: 'expiresAt',
          updatedAt: 'updatedAt',
        },
        leagueMessageReports: {
          id: 'id',
          messageId: 'messageId',
          reportedBy: 'reportedBy',
          reason: 'reason',
          status: 'status',
          createdAt: 'createdAt',
          resolvedAt: 'resolvedAt',
          reviewedBy: 'reviewedBy',
          moderatorNotes: 'moderatorNotes',
          resolution: 'resolution',
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

    // LS-6302: reverse-pagination cursor for "load older messages".
    it('accepts a before cursor and returns the older page', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ id: 1 }]) // membership
        .mockResolvedValueOnce([
          makeLeagueMsg({ id: 49, messageText: 'older message' }),
        ]);

      const resolver = getQuery('getLeagueMessages');
      const result = (await resolver(
        {},
        { leagueId: 1, limit: 50, before: 50 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 49 });
      // The cursor condition is folded into the same `where` call as the
      // leagueId scope, not a second filter — assert the query was built
      // with a single combined where clause rather than skipped entirely.
      expect(mockDb.where).toHaveBeenCalledTimes(3); // membership + active blocks (LS-6297) + messages
    });

    it('still returns the newest page when before is omitted', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ id: 1 }]) // membership
        .mockResolvedValueOnce([makeLeagueMsg({ id: 100 })]);

      const resolver = getQuery('getLeagueMessages');
      const result = (await resolver(
        {},
        { leagueId: 1, limit: 50 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 100 });
    });

    // ── block enforcement (LS-6297) ─────────────────────────────────────

    it('filters out messages from a blocked sender', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership
      mockDb.where
        .mockReturnValueOnce(mockDb) // membership's .where() — chained with .limit()
        .mockResolvedValueOnce([{ blockedUserId: 2 }]); // active blocks (terminal .where())
      mockDb.limit.mockResolvedValueOnce([
        makeLeagueMsg({ id: 1, userId: 2 }),
        makeLeagueMsg({ id: 2, userId: 3 }),
      ]); // messages

      const resolver = getQuery('getLeagueMessages');
      const result = (await resolver(
        {},
        { leagueId: 1, limit: 20 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 2, userId: 3 });
    });

    it('does not filter messages when the caller has no active blocks', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership
      mockDb.where
        .mockReturnValueOnce(mockDb) // membership's .where() — chained with .limit()
        .mockResolvedValueOnce([]); // no active blocks (terminal .where())
      mockDb.limit.mockResolvedValueOnce([makeLeagueMsg({ userId: 2 })]);

      const resolver = getQuery('getLeagueMessages');
      const result = (await resolver(
        {},
        { leagueId: 1, limit: 20 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
    });
  });

  // ── getLeagueChatBlocks (LS-6297) ────────────────────────────────────────

  describe('getLeagueChatBlocks query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('getLeagueChatBlocks');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns the blocks the caller has created for a league', async () => {
      mockDb.orderBy.mockResolvedValueOnce([makeChatBlock()]);

      const resolver = getQuery('getLeagueChatBlocks');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ blockingUserId: 1, blockedUserId: 2 });
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

    // ── profanity check (LS-9622) ────────────────────────────────────────

    it('flags a message containing profanity and persists containsProfanity', async () => {
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]); // matchup found
      mockDb.returning.mockResolvedValueOnce([
        makeMessage({
          message: 'you fucking idiot',
          containsProfanity: true,
        }),
      ]);

      const resolver = getMutation('sendMatchupMessage');
      const result = (await resolver(
        {},
        { matchupId: 1, message: 'you fucking idiot' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ containsProfanity: true }),
      );
      expect(result).toMatchObject({ containsProfanity: true });
    });

    it('does not flag a clean message', async () => {
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]); // matchup found
      mockDb.returning.mockResolvedValueOnce([makeMessage()]);

      const resolver = getMutation('sendMatchupMessage');
      const result = (await resolver(
        {},
        { matchupId: 1, message: 'Good luck this week!' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ containsProfanity: false }),
      );
      expect(result).toMatchObject({ containsProfanity: false });
    });

    it('does not flag a word that merely contains a profane substring', async () => {
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]); // matchup found
      mockDb.returning.mockResolvedValueOnce([makeMessage()]);

      const resolver = getMutation('sendMatchupMessage');
      await resolver(
        {},
        { matchupId: 1, message: 'This class is a great assessment' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ containsProfanity: false }),
      );
    });

    // ── gifUrl allowlist (LS-9619 / FLD-047 follow-up) ──────────────────

    it('rejects a non-https gifUrl', async () => {
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]); // matchup found

      const resolver = getMutation('sendMatchupMessage');
      await expect(
        resolver(
          {},
          { matchupId: 1, message: 'hi', gifUrl: 'javascript:alert(1)' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('gifUrl must use HTTPS');
    });

    it('rejects a gifUrl not hosted on giphy.com or tenor.com', async () => {
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]); // matchup found

      const resolver = getMutation('sendMatchupMessage');
      await expect(
        resolver(
          {},
          {
            matchupId: 1,
            message: 'hi',
            gifUrl: 'https://malicious.example/track.gif',
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('gifUrl must be hosted on giphy.com or tenor.com');

      expect(mockDb.values).not.toHaveBeenCalled();
    });

    it('sends a matchup message with an allowlisted giphy.com gifUrl', async () => {
      const msg = makeMessage({
        messageType: 'gif',
        gifUrl: 'https://media0.giphy.com/media/abc/giphy.gif',
      });
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]); // matchup found
      mockDb.returning.mockResolvedValueOnce([msg]);

      const resolver = getMutation('sendMatchupMessage');
      const result = (await resolver(
        {},
        {
          matchupId: 1,
          message: 'hi',
          gifUrl: 'https://media0.giphy.com/media/abc/giphy.gif',
        },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'gif',
          gifUrl: 'https://media0.giphy.com/media/abc/giphy.gif',
        }),
      );
      expect(result).toMatchObject({ gifUrl: msg.gifUrl });
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

    it('rejects a non-https gifUrl', async () => {
      const resolver = getMutation('sendLeagueMessage');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: '', gifUrl: 'javascript:alert(1)' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('gifUrl must use HTTPS');
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

    // ── rate limiting (LS-6298 / FLD-046) ────────────────────────────────

    it('rate-limits per (user, league): checks the limiter after membership, before persisting', async () => {
      const msg = makeLeagueMsg();
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([msg]);

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: 'Hello everyone' },
        mockContext,
        undefined as never,
      );

      expect(mockCheckAndIncrementRateLimit).toHaveBeenCalledWith(mockDb, {
        bucket: 'send_league_message:1',
        userId: 1,
        limit: 5,
        windowMs: 10 * 1000,
      });
    });

    it('scopes the rate limit bucket to the target league', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([makeLeagueMsg({ leagueId: 42 })]);

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 42, messageText: 'Hello everyone' },
        mockContext,
        undefined as never,
      );

      expect(mockCheckAndIncrementRateLimit).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ bucket: 'send_league_message:42' }),
      );
    });

    it('throws RATE_LIMITED and does not persist a message once the limit is exceeded', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockCheckAndIncrementRateLimit.mockResolvedValueOnce({ allowed: false });

      const resolver = getMutation('sendLeagueMessage');
      await expect(
        resolver(
          {},
          { leagueId: 1, messageText: 'spam' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Too many attempts. Please try again later.');

      expect(mockDb.values).not.toHaveBeenCalledWith(
        expect.objectContaining({ messageText: expect.anything() }),
      );
    });

    // ── gifUrl allowlist (LS-6299 / FLD-047) ────────────────────────────

    it('rejects a gifUrl not hosted on giphy.com or tenor.com', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check

      const resolver = getMutation('sendLeagueMessage');
      await expect(
        resolver(
          {},
          {
            leagueId: 1,
            messageText: '',
            gifUrl: 'https://malicious.example/track.gif',
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('gifUrl must be hosted on giphy.com or tenor.com');

      expect(mockDb.values).not.toHaveBeenCalled();
    });

    it('sends a league message with an allowlisted giphy.com gifUrl', async () => {
      const msg = makeLeagueMsg({
        messageType: 'gif',
        gifUrl: 'https://media0.giphy.com/media/abc/giphy.gif',
      });
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([msg]);

      const resolver = getMutation('sendLeagueMessage');
      const result = (await resolver(
        {},
        {
          leagueId: 1,
          messageText: '',
          gifUrl: 'https://media0.giphy.com/media/abc/giphy.gif',
        },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'gif',
          gifUrl: 'https://media0.giphy.com/media/abc/giphy.gif',
        }),
      );
      expect(result).toMatchObject({ gifUrl: msg.gifUrl });
    });

    it('HTML-escapes messageText before persisting it (LS-6300)', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([makeLeagueMsg()]);

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: '<img src=x onerror=alert(1)>' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          messageText: '&lt;img src=x onerror=alert(1)&gt;',
        }),
      );
    });

    // ── profanity check (LS-6296, FLD-044) ─────────────────────────────

    it('flags a message containing profanity and persists containsProfanity', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([
        makeLeagueMsg({
          messageText: 'you fucking idiot',
          containsProfanity: true,
        }),
      ]);

      const resolver = getMutation('sendLeagueMessage');
      const result = (await resolver(
        {},
        { leagueId: 1, messageText: 'you fucking idiot' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ containsProfanity: true }),
      );
      expect(result).toMatchObject({ containsProfanity: true });
    });

    it('does not flag a clean message', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([makeLeagueMsg()]);

      const resolver = getMutation('sendLeagueMessage');
      const result = (await resolver(
        {},
        { leagueId: 1, messageText: 'Good luck this week!' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ containsProfanity: false }),
      );
      expect(result).toMatchObject({ containsProfanity: false });
    });

    it('does not flag a word that merely contains a profane substring', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.returning.mockResolvedValueOnce([makeLeagueMsg()]);

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: 'This class is a great assessment' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ containsProfanity: false }),
      );
    });

    // ── @mentions (LS-9216) ──────────────────────────────────────────────

    it('resolves an @TeamName mention to the managing user id and persists it', async () => {
      const msg = makeLeagueMsg({ mentionedUserIds: [2] });
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([
          { name: 'Wolfpack', managerId: 2 },
          { name: 'Bears', managerId: 3 },
        ]),
      );
      mockDb.returning.mockResolvedValueOnce([msg]);

      const resolver = getMutation('sendLeagueMessage');
      const result = (await resolver(
        {},
        { leagueId: 1, messageText: 'hi @Wolfpack, good luck this week' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ mentionedUserIds: [2] }),
      );
      expect(result).toMatchObject({ mentionedUserIds: [2] });
    });

    it('does not treat an unmatched @token as a mention', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ name: 'Wolfpack', managerId: 2 }]),
      );
      mockDb.returning.mockResolvedValueOnce([makeLeagueMsg()]);

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: 'hi @randomguy' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ mentionedUserIds: null }),
      );
    });

    it('prefers the longer team name when one is a prefix of another', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([
          { name: 'Bears', managerId: 2 },
          { name: 'Bears United', managerId: 3 },
        ]),
      );
      mockDb.returning.mockResolvedValueOnce([makeLeagueMsg()]);

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: 'go @Bears United' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ mentionedUserIds: [3] }),
      );
    });

    it('push-notifies a mentioned user who is not viewing the league', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ name: 'Wolfpack', managerId: 2 }]),
      );
      mockDb.returning.mockResolvedValueOnce([
        makeLeagueMsg({ mentionedUserIds: [2] }),
      ]);

      const publish = jest.fn().mockResolvedValue(undefined);
      const isUserViewingLeague = jest.fn().mockResolvedValue(false);
      mockContext.notificationPublisher = { publish };
      mockContext.notificationService = {
        notifyLeagueChatMessage: jest.fn().mockResolvedValue(undefined),
        isUserViewingLeague,
      };

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: 'hi @Wolfpack' },
        mockContext,
        undefined as never,
      );

      expect(isUserViewingLeague).toHaveBeenCalledWith(2, 1);
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 2,
          notificationType: 'LEAGUE_CHAT_MENTION',
          data: { leagueId: 1, messageId: 1 },
        }),
      );

      delete mockContext.notificationPublisher;
      delete mockContext.notificationService;
    });

    it('does not push-notify a mentioned user who is actively viewing the league', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ name: 'Wolfpack', managerId: 2 }]),
      );
      mockDb.returning.mockResolvedValueOnce([
        makeLeagueMsg({ mentionedUserIds: [2] }),
      ]);

      const publish = jest.fn().mockResolvedValue(undefined);
      mockContext.notificationPublisher = { publish };
      mockContext.notificationService = {
        notifyLeagueChatMessage: jest.fn().mockResolvedValue(undefined),
        isUserViewingLeague: jest.fn().mockResolvedValue(true),
      };

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: 'hi @Wolfpack' },
        mockContext,
        undefined as never,
      );

      expect(publish).not.toHaveBeenCalled();

      delete mockContext.notificationPublisher;
      delete mockContext.notificationService;
    });

    it('does not push-notify the sender when they mention their own team', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]); // membership check
      mockDb.then.mockImplementationOnce(
        (resolve: (v: unknown) => void) =>
          resolve([{ name: 'MyTeam', managerId: 1 }]), // sender's own team
      );
      mockDb.returning.mockResolvedValueOnce([
        makeLeagueMsg({ mentionedUserIds: [1] }),
      ]);

      const publish = jest.fn().mockResolvedValue(undefined);
      mockContext.notificationPublisher = { publish };

      const resolver = getMutation('sendLeagueMessage');
      await resolver(
        {},
        { leagueId: 1, messageText: 'go @MyTeam' },
        mockContext,
        undefined as never,
      );

      expect(publish).not.toHaveBeenCalled();

      delete mockContext.notificationPublisher;
    });
  });

  // ── blockLeagueChatUser (LS-6297) ───────────────────────────────────────

  describe('blockLeagueChatUser mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('blockLeagueChatUser');
      await expect(
        resolver(
          {},
          { leagueId: 1, blockedUserId: 2 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when blocking yourself', async () => {
      const resolver = getMutation('blockLeagueChatUser');
      await expect(
        resolver(
          {},
          { leagueId: 1, blockedUserId: 1 }, // same as mockContext.user.id
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Cannot block yourself');
    });

    it('throws when not a league member', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no membership

      const resolver = getMutation('blockLeagueChatUser');
      await expect(
        resolver(
          {},
          { leagueId: 1, blockedUserId: 2 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Not a member of this league');
    });

    it('returns the existing block without inserting a duplicate', async () => {
      const existing = makeChatBlock();
      mockDb.limit
        .mockResolvedValueOnce([{ id: 1 }]) // membership
        .mockResolvedValueOnce([existing]); // existing block found

      const resolver = getMutation('blockLeagueChatUser');
      const result = (await resolver(
        {},
        { leagueId: 1, blockedUserId: 2 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toEqual({
        ...existing,
        updatedAt: existing.updatedAt.toISOString(),
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('creates a new league-scoped block', async () => {
      const block = makeChatBlock();
      mockDb.limit
        .mockResolvedValueOnce([{ id: 1 }]) // membership
        .mockResolvedValueOnce([]); // no existing block
      mockDb.returning.mockResolvedValueOnce([block]);

      const resolver = getMutation('blockLeagueChatUser');
      const result = (await resolver(
        {},
        { leagueId: 1, blockedUserId: 2 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          leagueId: 1,
          matchupId: null,
          blockingUserId: 1,
          blockedUserId: 2,
          scope: 'league',
        }),
      );
      expect(result).toMatchObject({ blockedUserId: 2, scope: 'league' });
    });
  });

  // ── unblockLeagueChatUser (LS-6297) ─────────────────────────────────────

  describe('unblockLeagueChatUser mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('unblockLeagueChatUser');
      await expect(
        resolver(
          {},
          { leagueId: 1, blockedUserId: 2 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('deletes the block and returns true', async () => {
      const resolver = getMutation('unblockLeagueChatUser');
      const result = await resolver(
        {},
        { leagueId: 1, blockedUserId: 2 },
        mockContext,
        undefined as never,
      );

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  // ── reportLeagueMessage (LS-6297) ───────────────────────────────────────

  describe('reportLeagueMessage mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('reportLeagueMessage');
      await expect(
        resolver(
          {},
          { messageId: 1, reason: 'Abusive' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when reason is empty', async () => {
      const resolver = getMutation('reportLeagueMessage');
      await expect(
        resolver(
          {},
          { messageId: 1, reason: '   ' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Report reason cannot be empty');
    });

    it('throws when reason exceeds 1000 characters', async () => {
      const resolver = getMutation('reportLeagueMessage');
      await expect(
        resolver(
          {},
          { messageId: 1, reason: 'x'.repeat(1001) },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Report reason cannot exceed 1000 characters');
    });

    it('throws when the message is not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no message

      const resolver = getMutation('reportLeagueMessage');
      await expect(
        resolver(
          {},
          { messageId: 999, reason: 'Abusive' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Message not found');
    });

    it('throws when not a league member', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ leagueId: 1 }]) // message found
        .mockResolvedValueOnce([]); // no membership

      const resolver = getMutation('reportLeagueMessage');
      await expect(
        resolver(
          {},
          { messageId: 1, reason: 'Abusive' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Not a member of this league');
    });

    it('creates a report successfully', async () => {
      const report = makeLeagueMessageReport();
      mockDb.limit
        .mockResolvedValueOnce([{ leagueId: 1 }]) // message found
        .mockResolvedValueOnce([{ id: 1 }]); // membership
      mockDb.returning.mockResolvedValueOnce([report]);

      const resolver = getMutation('reportLeagueMessage');
      const result = (await resolver(
        {},
        { messageId: 1, reason: 'Abusive language' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 1,
          reportedBy: 1,
          reason: 'Abusive language',
        }),
      );
      expect(result).toMatchObject({ status: 'pending' });
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

    it('HTML-escapes messageText before persisting it (LS-6300)', async () => {
      mockDb.limit.mockResolvedValueOnce([{ owner: 1 }]); // is commissioner
      mockDb.returning.mockResolvedValueOnce([
        makeLeagueMsg({ messageType: 'announcement' }),
      ]);

      const resolver = getMutation('postLeagueAnnouncement');
      await resolver(
        {},
        { leagueId: 1, messageText: '<img src=x onerror=alert(1)>' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          messageText: '&lt;img src=x onerror=alert(1)&gt;',
        }),
      );
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

    it('HTML-escapes messageText before persisting it (LS-6300)', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ owner: 1 }]) // is commissioner
        .mockResolvedValueOnce([makeLeagueMsg()]); // existing found
      mockDb.returning.mockResolvedValueOnce([makeLeagueMsg()]);

      const resolver = getMutation('updateLeagueAnnouncement');
      await resolver(
        {},
        { id: 1, leagueId: 1, messageText: '<img src=x onerror=alert(1)>' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.set).toHaveBeenCalledWith({
        messageText: '&lt;img src=x onerror=alert(1)&gt;',
      });
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

    it('HTML-escapes messageText before persisting it (LS-6300)', async () => {
      mockDb.returning.mockResolvedValueOnce([makeDirectMsg()]);

      const resolver = getMutation('sendDirectMessage');
      await resolver(
        {},
        { toUserId: 2, messageText: '<img src=x onerror=alert(1)>' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          messageText: '&lt;img src=x onerror=alert(1)&gt;',
        }),
      );
    });
  });
});

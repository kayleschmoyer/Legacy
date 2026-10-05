/**
 * Unit tests for commissionerToggleUserAutoPick resolver (LS-7981)
 *
 * Test list:
 *  1. UNAUTHENTICATED guard — ctx.user = null
 *  2. Draft not found → BAD_USER_INPUT
 *  3. Non-commissioner membership → FORBIDDEN
 *  4. No membership row → FORBIDDEN
 *  5. Draft not in-progress → BAD_USER_INPUT
 *  6. Team has no seat in the draft → BAD_USER_INPUT
 *  7. Successful enable → true, DB updated, chat message inserted, WS notified
 *  8. Successful disable → false, chat message says "disabled"
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type Resolver = (
  parent: unknown,
  args: { draftId: number; teamId: number; enable: boolean },
  ctx: unknown,
  info: unknown,
) => Promise<boolean>;

function buildDb(overrides: {
  limitResults?: unknown[][];
  insertReturning?: unknown[];
}) {
  const {
    limitResults = [],
    insertReturning = [{ id: 99, timestamp: '2024-01-01T00:00:00Z' }],
  } = overrides;

  const mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  const mockSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });

  const mockReturning = jest.fn().mockResolvedValue(insertReturning);
  const mockValues = jest.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

  let limitCall = 0;
  const mockLimit = jest.fn().mockImplementation(() => {
    return Promise.resolve(limitResults[limitCall++] ?? []);
  });

  const db = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: mockLimit,
    update: mockUpdate,
    insert: mockInsert,
  };

  return {
    db,
    mockUpdate,
    mockSet,
    mockUpdateWhere,
    mockInsert,
    mockValues,
    mockReturning,
  };
}

const getSeatForTeamMock = jest.fn();
const setSeatAutoPickMock = jest.fn().mockResolvedValue(undefined);

function captureResolver(): Resolver {
  jest.resetModules();
  let capturedFn: Resolver | undefined;

  // Default: the target team holds a seat. The "not participating" case
  // overrides this with null.
  getSeatForTeamMock
    .mockReset()
    .mockResolvedValue({ id: 500, slot: 2, teamId: 2 });
  setSeatAutoPickMock.mockReset().mockResolvedValue(undefined);

  // Seat reads/writes go through drafts/participants (LS-10074), which has
  // its own coverage; stub it so this suite stays on the resolver's guards.
  jest.doMock('../participants', () => ({
    getSeatForTeam: (...args: unknown[]) => getSeatForTeamMock(...args),
    setSeatAutoPick: (...args: unknown[]) => setSeatAutoPickMock(...args),
  }));

  jest.doMock('../../builder', () => ({
    builder: {
      mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: { resolve: Resolver }) => {
            capturedFn = opts.resolve;
          },
          arg: {
            int: () => ({}),
            boolean: () => ({}),
          },
        });
      }),
    },
  }));

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      PublicSchema: {
        drafts: {
          id: 'drafts.id',
          leagueId: 'drafts.leagueId',
          status: 'drafts.status',
        },
        leagueMembers: {
          leagueId: 'leagueMembers.leagueId',
          userId: 'leagueMembers.userId',
          permissionLevel: 'leagueMembers.permissionLevel',
        },
        leagues: { id: 'leagues.id', draftStatus: 'leagues.draftStatus' },
        teams: { id: 'teams.id', name: 'teams.name' },
        leagueMessages: {
          leagueId: 'leagueMessages.leagueId',
          userId: 'leagueMessages.userId',
          messageText: 'leagueMessages.messageText',
          messageType: 'leagueMessages.messageType',
        },
      },
    }),
  );

  require('./commissioner-toggle-user-autopick');

  if (!capturedFn) throw new Error('resolver not captured');
  return capturedFn;
}

// Default happy-path DB result sequence. Since LS-10074 the draft row carries
// the status the resolver gates on (no separate leagues read) and the seat
// lookup goes through the mocked participants module (no draft_teams read).
//   1st limit → draft row (incl. status)
//   2nd limit → commissioner membership
//   3rd limit → team name
function happyPathLimits() {
  return [
    [{ id: 1, leagueId: 10, status: 'in-progress' }],
    [{ permissionLevel: 'commissioner' }],
    [{ name: 'Team Rocket' }],
  ];
}

/** Index of the team-name lookup inside happyPathLimits(). */
const TEAM_NAME_LIMIT_INDEX = 2;

// ── UNAUTHENTICATED ───────────────────────────────────────────────────────────

describe('commissionerToggleUserAutoPick UNAUTHENTICATED guard', () => {
  it('throws UNAUTHENTICATED when ctx.user is null', async () => {
    const resolve = captureResolver();
    const { db } = buildDb({ limitResults: [] });
    await expect(
      resolve(
        {},
        { draftId: 1, teamId: 2, enable: true },
        { user: null, db },
        undefined,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});

// ── ERROR PATHS ───────────────────────────────────────────────────────────────

describe('commissionerToggleUserAutoPick error paths', () => {
  let resolve: Resolver;
  beforeEach(() => {
    resolve = captureResolver();
  });

  it('throws BAD_USER_INPUT when draft is not found', async () => {
    const { db } = buildDb({ limitResults: [[]] }); // no draft row
    const ctx = {
      user: { id: 5, username: 'alice' },
      db,
      notificationService: null,
    };
    await expect(
      resolve({}, { draftId: 99, teamId: 2, enable: true }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'Draft not found',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('throws FORBIDDEN when caller has no membership', async () => {
    const { db } = buildDb({
      limitResults: [
        [{ id: 1, leagueId: 10, status: 'in-progress' }], // draft found
        [], // no membership row
      ],
    });
    const ctx = {
      user: { id: 5, username: 'alice' },
      db,
      notificationService: null,
    };
    await expect(
      resolve({}, { draftId: 1, teamId: 2, enable: true }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('throws FORBIDDEN when caller is not commissioner', async () => {
    const { db } = buildDb({
      limitResults: [
        [{ id: 1, leagueId: 10, status: 'in-progress' }],
        [{ permissionLevel: 'member' }],
      ],
    });
    const ctx = {
      user: { id: 5, username: 'alice' },
      db,
      notificationService: null,
    };
    await expect(
      resolve({}, { draftId: 1, teamId: 2, enable: true }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('throws BAD_USER_INPUT when the draft row carries no in-progress status', async () => {
    const { db } = buildDb({
      limitResults: [
        [{ id: 1, leagueId: 10, status: 'not-started' }],
        [{ permissionLevel: 'commissioner' }],
      ],
    });
    const ctx = {
      user: { id: 5, username: 'alice' },
      db,
      notificationService: null,
    };
    await expect(
      resolve({}, { draftId: 1, teamId: 2, enable: true }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'Auto-pick can only be toggled while a draft is in progress',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('throws BAD_USER_INPUT when draft is not in-progress', async () => {
    const { db } = buildDb({
      limitResults: [
        [{ id: 1, leagueId: 10, status: 'completed' }],
        [{ permissionLevel: 'commissioner' }],
      ],
    });
    const ctx = {
      user: { id: 5, username: 'alice' },
      db,
      notificationService: null,
    };
    await expect(
      resolve({}, { draftId: 1, teamId: 2, enable: true }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'Auto-pick can only be toggled while a draft is in progress',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('throws BAD_USER_INPUT when team is not participating in draft', async () => {
    const { db } = buildDb({
      limitResults: [
        [{ id: 1, leagueId: 10, status: 'in-progress' }],
        [{ permissionLevel: 'commissioner' }],
      ],
    });
    getSeatForTeamMock.mockResolvedValue(null); // team holds no seat
    const ctx = {
      user: { id: 5, username: 'alice' },
      db,
      notificationService: null,
    };
    await expect(
      resolve({}, { draftId: 1, teamId: 99, enable: true }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'Team is not participating in this draft',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });
});

// ── SUCCESS PATHS ─────────────────────────────────────────────────────────────

describe('commissionerToggleUserAutoPick success paths', () => {
  let resolve: Resolver;
  beforeEach(() => {
    resolve = captureResolver();
  });

  it('enables auto-pick: returns true, updates DB, inserts chat message, notifies WS', async () => {
    const { db, mockInsert } = buildDb({
      limitResults: happyPathLimits(),
      insertReturning: [{ id: 55, timestamp: '2024-06-01T12:00:00Z' }],
    });

    const notifyMock = jest.fn().mockResolvedValue(undefined);
    const notificationService = { notifyLeagueChatMessage: notifyMock };

    const ctx = {
      user: { id: 7, username: 'commish' },
      db,
      notificationService,
    };
    const result = await resolve(
      {},
      { draftId: 1, teamId: 2, enable: true },
      ctx,
      undefined,
    );

    expect(result).toBe(true);

    // The seat's auto-pick flag was written
    expect(setSeatAutoPickMock).toHaveBeenCalledWith(db, {
      draftId: 1,
      leagueId: 10,
      teamIds: [2],
      autoPick: true,
    });

    // Chat message was inserted
    expect(mockInsert).toHaveBeenCalled();

    // WS notification was fired
    expect(notifyMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        leagueId: 10,
        messageId: 55,
        senderId: null,
        senderUsername: 'commish',
        messageType: 'system',
        messageText: expect.stringContaining('enabled'),
      }),
    );
  });

  it('disables auto-pick: returns false and chat message says "disabled"', async () => {
    const { db, mockInsert } = buildDb({
      limitResults: happyPathLimits(),
      insertReturning: [{ id: 56, timestamp: '2024-06-01T12:00:00Z' }],
    });

    const notifyMock = jest.fn().mockResolvedValue(undefined);
    const notificationService = { notifyLeagueChatMessage: notifyMock };

    const ctx = {
      user: { id: 7, username: 'commish' },
      db,
      notificationService,
    };
    const result = await resolve(
      {},
      { draftId: 1, teamId: 2, enable: false },
      ctx,
      undefined,
    );

    expect(result).toBe(false);
    expect(mockInsert).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        messageText: expect.stringContaining('disabled'),
      }),
    );
  });

  it('succeeds without notificationService (WS notify is skipped)', async () => {
    const { db } = buildDb({ limitResults: happyPathLimits() });
    const ctx = {
      user: { id: 7, username: 'commish' },
      db,
      notificationService: null,
    };
    const result = await resolve(
      {},
      { draftId: 1, teamId: 2, enable: true },
      ctx,
      undefined,
    );
    expect(result).toBe(true);
  });

  it('uses fallback team name when team row is missing', async () => {
    const limits = happyPathLimits();
    limits[TEAM_NAME_LIMIT_INDEX] = []; // team lookup returns nothing
    const { db, mockInsert } = buildDb({ limitResults: limits });

    const notifyMock = jest.fn().mockResolvedValue(undefined);
    const ctx = {
      user: { id: 7, username: 'commish' },
      db,
      notificationService: { notifyLeagueChatMessage: notifyMock },
    };
    await resolve({}, { draftId: 1, teamId: 2, enable: true }, ctx, undefined);

    const insertedValues = (mockInsert().values as jest.Mock).mock
      .calls[0]?.[0] as { messageText?: string } | undefined;
    // The text should fall back to "Team #2"
    expect(notifyMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        messageText: expect.stringContaining('Team #2'),
      }),
    );
  });
});

export {};

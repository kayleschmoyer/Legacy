/**
 * Resolver-level proof that both team-member position mutations run the
 * slot-eligibility gate before they write anything (LS-6427).
 *
 * The gate's own decision rule is covered in `../position-eligibility.spec.ts`
 * and against real PostgreSQL in `./position-eligibility.db.spec.ts`. What is
 * verified here is the wiring the acceptance criteria actually name: that
 * `updateTeamMemberPosition` (AC1) and `swapTeamMemberPositions` (AC2) reject
 * an ineligible assignment, that the rejection happens *before* the
 * transaction opens, and that it is not logged as a system error.
 *
 * Uses the isolated-resolver-capture pattern from `./mutations.spec.ts` —
 * mock `../builder` to capture each mutation's `resolve` directly rather than
 * building the full aggregate GraphQL schema.
 */

type Resolver = (...args: unknown[]) => Promise<unknown>;

const LOGGER = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

/**
 * Minimal drizzle query-builder stand-in: every chain method returns `this`,
 * and awaiting the chain yields the next queued result set. Each awaited
 * statement consumes exactly one entry, so tests declare the query results in
 * the order the code under test issues them.
 */
function makeQueuedDb(resultSets: unknown[][]) {
  const queue = [...resultSets];
  const transaction = jest.fn();
  const chain: Record<string, unknown> = {
    transaction,
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(queue.shift() ?? []).then(onFulfilled, onRejected),
  };
  return { db: chain, transaction, remaining: () => queue.length };
}

/** Captures the teams-domain mutation resolvers with auth and drizzle stubbed. */
async function captureResolvers(): Promise<Record<string, Resolver>> {
  jest.resetModules();
  const captured: Record<string, { resolve?: Resolver }> = {};

  const argStub = new Proxy({}, { get: () => (cfg: unknown) => cfg });
  const tStub = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'arg') return argStub;
        return (cfg: unknown) => cfg;
      },
    },
  );

  jest.doMock('../builder', () => ({
    builder: {
      mutationField: (name: string, fn: (t: unknown) => unknown) => {
        captured[name] = fn(tStub) as { resolve?: Resolver };
      },
    },
  }));

  jest.doMock('@legacy-sports/logging', () => ({ LOGGER }));

  // Authorization is exercised by `../authorization.*.spec.ts`; here it is a
  // pass-through so the resolver body itself is reachable.
  jest.doMock('../authorization', () => ({
    authorized:
      (_config: unknown, handler: Resolver) =>
      (parent: unknown, args: unknown, context: { user: unknown }) =>
        handler(parent, args, context, context.user),
    isTeamGeneralManager: jest.fn(),
  }));

  // Column references are only ever passed to the stubbed drizzle operators,
  // so identity strings are sufficient.
  const columns = (...names: string[]) =>
    Object.fromEntries(names.map((n) => [n, n]));
  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      teamMembers: columns(
        'id',
        'teamId',
        'leagueId',
        'playerId',
        'positionId',
        'onTradeBlock',
      ),
      leagues: columns('id', 'sport', 'currentWeek', 'currentMatchup'),
      leaguePosition: columns('id', 'leagueId', 'positionType'),
      players: columns('id', 'firstName', 'lastName'),
      playerEligiblePositions: columns('playerId', 'position'),
      footballPlayerEligiblePositions: columns('playerId', 'position'),
      teams: columns('id', 'leagueId', 'name'),
      matchups: columns('id', 'leagueId', 'weekNumber', 'team1Id', 'team2Id'),
      matchupPlayers: columns(
        'matchupId',
        'teamId',
        'playerId',
        'positionId',
        'manuallyEdited',
      ),
      leagueMembers: columns('leagueId', 'userId', 'teamId', 'permissionLevel'),
      leagueMessages: columns('id', 'leagueId'),
    },
  }));

  jest.doMock('drizzle-orm', () => ({
    and: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
    ilike: jest.fn(),
    inArray: jest.fn(),
    ne: jest.fn(),
    sql: jest.fn(),
  }));

  jest.doMock('../leagues/types', () => ({
    Team: {},
    TeamMember: {},
    LeagueMember: {},
  }));

  await import('./mutations');
  const resolvers: Record<string, Resolver> = {};
  for (const [name, opts] of Object.entries(captured)) {
    if (opts.resolve) resolvers[name] = opts.resolve;
  }
  return resolvers;
}

const USER = { id: 1, username: 'gm-user' };

/**
 * Query results, in issue order, for a football league where the target
 * player is a QB and the target slot is FLEX — the canonical rejection.
 */
function ineligibleQbIntoFlex(memberRows: unknown[]) {
  return [
    memberRows, // resolver: team member(s) being moved
    [{ sport: 'football' }], // gate: league sport
    [{ id: 77, positionType: 'FLEX' }], // gate: slot code
    [{ playerId: 9, position: 'QB' }], // gate: eligible positions
    [{ id: 9, firstName: 'Test', lastName: 'Quarterback' }], // gate: player name
  ];
}

beforeEach(() => {
  LOGGER.error.mockClear();
});

describe('updateTeamMemberPosition — slot-eligibility gate (AC1)', () => {
  it('rejects an ineligible assignment before opening the transaction', async () => {
    const { db, transaction } = makeQueuedDb(
      ineligibleQbIntoFlex([{ playerId: 9, leagueId: 5 }]),
    );
    const resolvers = await captureResolvers();

    await expect(
      resolvers.updateTeamMemberPosition(
        {},
        { teamMemberId: 42, positionId: 77 },
        { user: USER, db },
      ),
    ).rejects.toMatchObject({
      extensions: {
        code: 'POSITION_INELIGIBLE',
        slotType: 'FLEX',
        playerId: 9,
      },
    });

    // Nothing was written, and an expected user-input rejection was not
    // reported as a system error.
    expect(transaction).not.toHaveBeenCalled();
    expect(LOGGER.error).not.toHaveBeenCalled();
  });

  it('proceeds to the transaction when the assignment is eligible', async () => {
    const { db, transaction } = makeQueuedDb([
      [{ playerId: 9, leagueId: 5 }],
      [{ sport: 'football' }],
      [{ id: 77, positionType: 'FLEX' }],
      [{ playerId: 9, position: 'WR' }], // WR is FLEX-eligible
    ]);
    transaction.mockResolvedValue({ member: { id: 42 } });
    const resolvers = await captureResolvers();

    await expect(
      resolvers.updateTeamMemberPosition(
        {},
        { teamMemberId: 42, positionId: 77 },
        { user: USER, db },
      ),
    ).resolves.toEqual({ id: 42 });

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('skips the gate entirely when clearing a slot', async () => {
    const { db, transaction } = makeQueuedDb([[{ playerId: 9, leagueId: 5 }]]);
    transaction.mockResolvedValue({ member: { id: 42 } });
    const resolvers = await captureResolvers();

    await resolvers.updateTeamMemberPosition(
      {},
      { teamMemberId: 42, positionId: null },
      { user: USER, db },
    );

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('swapTeamMemberPositions — slot-eligibility gate (AC2)', () => {
  it('rejects when either side of the swap is ineligible', async () => {
    const { db, transaction } = makeQueuedDb(
      ineligibleQbIntoFlex([
        { id: 1, playerId: 8, leagueId: 5 },
        { id: 2, playerId: 9, leagueId: 5 },
      ]),
    );
    const resolvers = await captureResolvers();

    await expect(
      resolvers.swapTeamMemberPositions(
        {},
        {
          teamMemberIdA: 1,
          positionIdA: 77,
          teamMemberIdB: 2,
          positionIdB: 77,
        },
        { user: USER, db },
      ),
    ).rejects.toMatchObject({
      extensions: { code: 'POSITION_INELIGIBLE', slotType: 'FLEX' },
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(LOGGER.error).not.toHaveBeenCalled();
  });

  it('proceeds to the transaction when both sides are eligible', async () => {
    const { db, transaction } = makeQueuedDb([
      [
        { id: 1, playerId: 8, leagueId: 5 },
        { id: 2, playerId: 9, leagueId: 5 },
      ],
      [{ sport: 'football' }],
      [
        { id: 77, positionType: 'FLEX' },
        { id: 78, positionType: 'QB' },
      ],
      [
        { playerId: 8, position: 'WR' },
        { playerId: 9, position: 'QB' },
      ],
    ]);
    transaction.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const resolvers = await captureResolvers();

    await expect(
      resolvers.swapTeamMemberPositions(
        {},
        {
          teamMemberIdA: 1,
          positionIdA: 77, // WR → FLEX, eligible
          teamMemberIdB: 2,
          positionIdB: 78, // QB → QB, eligible
        },
        { user: USER, db },
      ),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }]);

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

// Every import here is dynamic (after `jest.doMock`), so without this the file
// parses as a script rather than a module — the same marker `./mutations.spec.ts`
// carries for the same reason.
export {};

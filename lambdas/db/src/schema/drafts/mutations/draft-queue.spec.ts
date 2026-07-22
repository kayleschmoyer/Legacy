/**
 * Unit tests for draft-queue mutations
 *
 * Regression coverage for LS-8215: FK constraint violation on draft_queue.draft_id
 * when the draft is deleted between auth validation and the transactional insert.
 *
 * Each insert mutation (setDraftQueue, addToDraftQueue) must re-validate draft
 * existence inside the transaction so the DB never sees an orphaned draft_id.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type Resolver = (...args: unknown[]) => Promise<unknown>;

// ── Module loader ─────────────────────────────────────────────────────────────

function captureDraftQueueResolvers(): Record<string, Resolver> {
  jest.resetModules();
  const captured: Record<string, Resolver> = {};

  jest.doMock('../../builder', () => ({
    builder: {
      mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: { resolve: Resolver }) => {
            captured[name] = opts.resolve;
          },
          arg: {
            int: () => ({}),
            intList: () => ({}),
          },
        });
      }),
    },
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      drafts: { id: 'drafts.id', leagueId: 'drafts.leagueId' },
      leagueMembers: {
        leagueId: 'leagueMembers.leagueId',
        userId: 'leagueMembers.userId',
        teamId: 'leagueMembers.teamId',
      },
      draftQueue: {
        id: 'draftQueue.id',
        draftId: 'draftQueue.draftId',
        teamId: 'draftQueue.teamId',
        playerId: 'draftQueue.playerId',
        priority: 'draftQueue.priority',
      },
    },
  }));

  // Cut the scoring.ts → createDatabaseService chain
  jest.doMock('../types', () => ({ DraftQueueEntry: {} }));

  jest.doMock('drizzle-orm', () => ({
    eq: jest.fn((_col: unknown, _val: unknown) => `eq`),
    and: jest.fn((...args: unknown[]) => args),
    asc: jest.fn(() => 'asc'),
  }));

  require('./draft-queue');

  return captured;
}

// ── DB builder helpers ────────────────────────────────────────────────────────

/** Build a db.transaction mock that runs the callback with the given tx object. */
function makeTxWrapper(tx: unknown) {
  return jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
}

/**
 * Build an outer db.select chain that returns successive row-sets for each
 * chained .limit(1) call (used by resolveTeamIdForDraft outside the tx).
 */
function makeOuterDb(limitResultSets: unknown[][], txWrapper: jest.Mock) {
  let call = 0;
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(() => Promise.resolve(limitResultSets[call++] ?? [])),
  };
  return {
    select: jest.fn(() => chain),
    transaction: txWrapper,
  };
}

// ── setDraftQueue ─────────────────────────────────────────────────────────────

describe('setDraftQueue', () => {
  let resolve: Resolver;

  beforeEach(() => {
    resolve = captureDraftQueueResolvers()['setDraftQueue']!;
  });

  it('throws UNAUTHENTICATED when user is null', async () => {
    await expect(
      resolve(
        null,
        { draftId: 5810, playerIds: [31422] },
        { user: null, db: {} },
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  function buildTx(draftExistsInTx: boolean) {
    let txSelectCall = 0;
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(() =>
        Promise.resolve(
          txSelectCall++ === 0 && draftExistsInTx ? [{ id: 5810 }] : [],
        ),
      ),
    };
    return {
      select: jest.fn(() => chain),
      delete: jest.fn(() => ({
        where: jest.fn().mockResolvedValue({ rowCount: 0 }),
      })),
      insert: jest.fn(() => ({
        values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([]) })),
      })),
    };
  }

  it('throws "Draft not found" when draft is deleted before the transaction insert (LS-8215)', async () => {
    const tx = buildTx(false);
    const outerDb = makeOuterDb(
      [
        [{ leagueId: 99 }], // resolveTeamIdForDraft: draft query
        [{ teamId: 25363 }], // resolveTeamIdForDraft: membership query
      ],
      makeTxWrapper(tx),
    );

    await expect(
      resolve(
        null,
        { draftId: 5810, playerIds: [31422] },
        { user: { id: 7 }, db: outerDb },
      ),
    ).rejects.toThrow('Draft not found');

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('completes successfully when draft still exists inside the transaction', async () => {
    const tx = buildTx(true);
    const outerDb = makeOuterDb(
      [[{ leagueId: 99 }], [{ teamId: 25363 }]],
      makeTxWrapper(tx),
    );

    await expect(
      resolve(
        null,
        { draftId: 5810, playerIds: [] },
        { user: { id: 7 }, db: outerDb },
      ),
    ).resolves.toEqual([]);
  });
});

// ── addToDraftQueue ───────────────────────────────────────────────────────────

describe('addToDraftQueue', () => {
  let resolve: Resolver;

  beforeEach(() => {
    resolve = captureDraftQueueResolvers()['addToDraftQueue']!;
  });

  it('throws UNAUTHENTICATED when user is null', async () => {
    await expect(
      resolve(null, { draftId: 5810, playerId: 31422 }, { user: null, db: {} }),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  function buildTx(draftExistsInTx: boolean, alreadyQueued: boolean) {
    let txSelectCall = 0;
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(() => {
        const call = txSelectCall++;
        if (call === 0)
          return Promise.resolve(draftExistsInTx ? [{ id: 5810 }] : []);
        if (call === 1)
          return Promise.resolve(alreadyQueued ? [{ id: 1 }] : []);
        return Promise.resolve([]);
      }),
      orderBy: jest.fn().mockResolvedValue([]),
    };
    const insertMock = jest.fn(() => ({
      values: jest.fn().mockResolvedValue(undefined),
    }));
    return {
      select: jest.fn(() => chain),
      insert: insertMock,
    };
  }

  it('throws "Draft not found" when draft is deleted before the transaction insert (LS-8215)', async () => {
    const tx = buildTx(false, false);
    const outerDb = makeOuterDb(
      [[{ leagueId: 99 }], [{ teamId: 25363 }]],
      makeTxWrapper(tx),
    );

    await expect(
      resolve(
        null,
        { draftId: 5810, playerId: 31422 },
        { user: { id: 7 }, db: outerDb },
      ),
    ).rejects.toThrow('Draft not found');

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('skips insert when player is already queued', async () => {
    const tx = buildTx(true, true);
    const outerDb = makeOuterDb(
      [[{ leagueId: 99 }], [{ teamId: 25363 }]],
      makeTxWrapper(tx),
    );

    await expect(
      resolve(
        null,
        { draftId: 5810, playerId: 31422 },
        { user: { id: 7 }, db: outerDb },
      ),
    ).resolves.toEqual([]);

    expect(tx.insert).not.toHaveBeenCalled();
  });
});

export {};

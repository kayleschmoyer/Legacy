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

/**
 * The seat the caller's team holds in the draft. Queue rows are keyed on
 * `draft_participants.id` since LS-10076, so every mutation resolves one
 * before it touches `draft_queue`.
 */
const SEAT_ROW = {
  id: 4411,
  draftId: 5810,
  slot: 2,
  teamId: 25363,
  leagueId: 99,
  userId: null,
  controller: 'user',
  seatName: 'Team 25363',
  autoPick: false,
};

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

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      PublicSchema: {
        drafts: {
          id: 'drafts.id',
          kind: 'drafts.kind',
          leagueId: 'drafts.leagueId',
        },
        leagueMembers: {
          leagueId: 'leagueMembers.leagueId',
          userId: 'leagueMembers.userId',
          teamId: 'leagueMembers.teamId',
          permissionLevel: 'leagueMembers.permissionLevel',
        },
        // The queue is keyed on the seat since LS-10076 — a mock draft's queue
        // has no team behind it.
        draftParticipants: {
          id: 'draftParticipants.id',
          draftId: 'draftParticipants.draftId',
          slot: 'draftParticipants.slot',
          teamId: 'draftParticipants.teamId',
          leagueId: 'draftParticipants.leagueId',
          userId: 'draftParticipants.userId',
          controller: 'draftParticipants.controller',
          seatName: 'draftParticipants.seatName',
          autoPick: 'draftParticipants.autoPick',
        },
        draftQueue: {
          id: 'draftQueue.id',
          draftId: 'draftQueue.draftId',
          teamId: 'draftQueue.teamId',
          participantId: 'draftQueue.participantId',
          playerId: 'draftQueue.playerId',
          priority: 'draftQueue.priority',
        },
      },
    }),
  );

  // Cut the scoring.ts → createDatabaseService chain
  jest.doMock('../types', () => ({ DraftQueueEntry: {} }));

  jest.doMock('drizzle-orm', () =>
    mockDrizzleOrm({
      eq: jest.fn((_col: unknown, _val: unknown) => `eq`),
      and: jest.fn((...args: unknown[]) => args),
      asc: jest.fn(() => 'asc'),
    }),
  );

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
 * chained .limit(1) call (used by resolveSeatForDraft outside the tx).
 */
function makeOuterDb(limitResultSets: unknown[][], txWrapper: jest.Mock) {
  let call = 0;
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
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
        [{ kind: 'league', leagueId: 99 }], // resolveSeatForDraft: draft query
        [{ teamId: 25363, permissionLevel: 'general_manager' }], // resolveSeatForDraft: membership query
        [SEAT_ROW], // resolveSeatForDraft: the team's seat (LS-10076)
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
      [
        [{ kind: 'league', leagueId: 99 }],
        [{ teamId: 25363, permissionLevel: 'general_manager' }],
        [SEAT_ROW],
      ],
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
      [
        [{ kind: 'league', leagueId: 99 }],
        [{ teamId: 25363, permissionLevel: 'general_manager' }],
        [SEAT_ROW],
      ],
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
      [
        [{ kind: 'league', leagueId: 99 }],
        [{ teamId: 25363, permissionLevel: 'general_manager' }],
        [SEAT_ROW],
      ],
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

// ── non-GM authorization (LS-4737) ──────────────────────────────────────────
//
// resolveTeamIdForDraft must reject any league member whose permissionLevel
// is not 'general_manager', mirroring the getMyDraftQueue read guard from
// LS-2501. A non-GM (assistant manager, co-manager) must not be able to
// mutate the GM's draft queue.

describe('non-GM authorization (LS-4737)', () => {
  const mutations: Array<{
    name: string;
    args: Record<string, unknown>;
  }> = [
    { name: 'setDraftQueue', args: { draftId: 5810, playerIds: [31422] } },
    { name: 'addToDraftQueue', args: { draftId: 5810, playerId: 31422 } },
    { name: 'removeFromDraftQueue', args: { draftId: 5810, playerId: 31422 } },
    { name: 'reorderDraftQueue', args: { draftId: 5810, playerIds: [31422] } },
  ];

  it.each(mutations)(
    'rejects $name for a non-GM league member (assistant_manager)',
    async ({ name, args }) => {
      const resolve = captureDraftQueueResolvers()[name];
      const transaction = jest.fn();
      const outerDb = makeOuterDb(
        [
          [{ kind: 'league', leagueId: 99 }], // resolveSeatForDraft: draft query
          [{ teamId: 25363, permissionLevel: 'assistant_manager' }], // membership query
        ],
        transaction,
      );

      await expect(
        resolve(null, args, { user: { id: 7 }, db: outerDb }),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });

      expect(transaction).not.toHaveBeenCalled();
    },
  );
});

export {};

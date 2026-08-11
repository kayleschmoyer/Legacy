/**
 * Resolver-level tests for autoStartScheduledDrafts (LS-8309).
 *
 * Covers the happy path, the <2-teams skip branch, the
 * enableAutoPickForUnmanagedTeams interaction, the transaction wrapping, and
 * the guarded-rollout staleness cutoff that keeps a long-dormant backlog of
 * past-due `scheduled_at` rows from mass-starting in a single invocation.
 */

const enableAutoPickForUnmanagedTeams = jest.fn();
const shuffleArray = jest.fn((arr: unknown[]) => arr);
const resolveDraftTeamsOrder = jest.fn(
  async (_db: unknown, _draftId: unknown, teams: { id: number }[]) => ({
    orderedTeamIds: teams.map((t) => t.id),
    needsInsert: true,
  }),
);

interface ScheduledDraftRow {
  draftId: number;
  leagueId: number;
  draftMode: string;
  selectionMethod: string;
  draftOrder: string;
  pickTimeLimitSeconds: number;
  scheduledAt: Date | null;
}

interface AutoStartScheduledDraftsResultShape {
  draftsStarted: number;
  errors: string[];
}

type ResolverFn = (
  ...args: unknown[]
) => Promise<AutoStartScheduledDraftsResultShape>;

function makeTxMock() {
  return {
    delete: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) })),
    insert: jest.fn(() => ({ values: jest.fn(() => Promise.resolve()) })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve({ rowCount: 0 })),
      })),
    })),
  };
}

function makeMockDb({
  scheduledDraftsRows,
  teamsRowsInOrder = [],
}: {
  scheduledDraftsRows: ScheduledDraftRow[];
  teamsRowsInOrder?: Array<Array<{ id: number }>>;
}) {
  let selectCallCount = 0;
  const transaction = jest.fn(async (cb: (tx: unknown) => unknown) =>
    cb(makeTxMock()),
  );
  const insert = jest.fn(() => ({
    values: jest.fn(() => ({
      returning: jest.fn(() => Promise.resolve([{ id: 1, timestamp: null }])),
    })),
  }));

  const select = jest.fn(() => {
    selectCallCount++;
    if (selectCallCount === 1) {
      // The scheduledDrafts × leagues join query.
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(scheduledDraftsRows),
          }),
        }),
      };
    }
    // Per-draft teams lookup — one call per draft in draftsToStart order.
    const teamsIndex = selectCallCount - 2;
    return {
      from: () => ({
        where: () => Promise.resolve(teamsRowsInOrder[teamsIndex] ?? []),
      }),
    };
  });

  return { select, transaction, insert };
}

function makeNotificationService() {
  return {
    notifyDraftStarted: jest.fn(() => Promise.resolve()),
    notifyLeagueChatMessage: jest.fn(() => Promise.resolve()),
  };
}

async function captureAutoStartScheduledDraftsResolver(): Promise<ResolverFn> {
  jest.resetModules();
  const captured: Record<string, ResolverFn> = {};

  jest.doMock('../builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({})),
      objectType: jest.fn(),
      mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: { resolve: ResolverFn }) => {
            captured[name] = opts.resolve;
          },
        });
      }),
    },
  }));

  jest.doMock('@legacy-sports/logging', () => ({
    LOGGER: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  jest.doMock('@legacy-sports/utils', () => ({
    shuffleArray,
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      drafts: {
        id: 'drafts.id',
        leagueId: 'drafts.league_id',
        draftMode: 'drafts.draft_mode',
        selectionMethod: 'drafts.selection_method',
        draftOrder: 'drafts.draft_order',
        pickTimeLimitSeconds: 'drafts.pick_time_limit_seconds',
        scheduledAt: 'drafts.scheduled_at',
      },
      leagues: {
        id: 'leagues.id',
        draftStatus: 'leagues.draft_status',
      },
      teams: {
        id: 'teams.id',
        leagueId: 'teams.league_id',
      },
      draftTeams: {
        draftId: 'draft_teams.draft_id',
        teamId: 'draft_teams.team_id',
        leagueId: 'draft_teams.league_id',
        draftOrder: 'draft_teams.draft_order',
      },
      draftPicks: {
        draftId: 'draft_picks.draft_id',
      },
      draftSlotTrades: {
        leagueId: 'draft_slot_trades.league_id',
        status: 'draft_slot_trades.status',
      },
      leagueMessages: {},
    },
  }));

  jest.doMock('drizzle-orm', () => ({
    and: jest.fn(),
    eq: jest.fn(),
    lte: jest.fn(),
    inArray: jest.fn(),
  }));

  jest.doMock('./helpers', () => ({
    enableAutoPickForUnmanagedTeams,
    resolveDraftTeamsOrder,
  }));

  await import('./auto-start-mutation');
  const resolve = captured.autoStartScheduledDrafts;
  if (!resolve) {
    throw new Error('autoStartScheduledDrafts resolver was not captured');
  }
  return resolve;
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

describe('autoStartScheduledDrafts resolver — LS-8309', () => {
  beforeEach(() => {
    enableAutoPickForUnmanagedTeams.mockReset();
    enableAutoPickForUnmanagedTeams.mockResolvedValue([]);
    shuffleArray.mockClear();
    resolveDraftTeamsOrder.mockClear();
    resolveDraftTeamsOrder.mockImplementation(
      async (_db: unknown, _draftId: unknown, teams: { id: number }[]) => ({
        orderedTeamIds: teams.map((t) => t.id),
        needsInsert: true,
      }),
    );
  });

  it('rejects non-system, non-admin callers', async () => {
    const resolve = await captureAutoStartScheduledDraftsResolver();
    const db = makeMockDb({ scheduledDraftsRows: [] });
    await expect(
      resolve(
        {},
        {},
        { isSystemRequest: false, user: null, db, notificationService: null },
      ),
    ).rejects.toThrow(/system-only operation/);
  });

  it('starts a single due draft with enough teams (happy path)', async () => {
    const resolve = await captureAutoStartScheduledDraftsResolver();
    const db = makeMockDb({
      scheduledDraftsRows: [
        {
          draftId: 1,
          leagueId: 10,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          pickTimeLimitSeconds: 120,
          scheduledAt: minutesAgo(1),
        },
      ],
      teamsRowsInOrder: [[{ id: 100 }, { id: 101 }]],
    });
    const notificationService = makeNotificationService();

    const result = await resolve(
      {},
      {},
      { isSystemRequest: true, user: null, db, notificationService },
    );

    expect(result).toMatchObject({ draftsStarted: 1, errors: [] });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyDraftStarted).toHaveBeenCalledTimes(1);
  });

  it('skips a draft with fewer than 2 teams and reports it without starting a transaction', async () => {
    const resolve = await captureAutoStartScheduledDraftsResolver();
    const db = makeMockDb({
      scheduledDraftsRows: [
        {
          draftId: 2,
          leagueId: 20,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          pickTimeLimitSeconds: 120,
          scheduledAt: minutesAgo(1),
        },
      ],
      teamsRowsInOrder: [[{ id: 200 }]],
    });
    const notificationService = makeNotificationService();

    const result = await resolve(
      {},
      {},
      { isSystemRequest: true, user: null, db, notificationService },
    );

    expect(result.draftsStarted).toBe(0);
    expect(result.errors).toEqual([
      'League 20: fewer than 2 teams, cannot auto-start',
    ]);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('calls enableAutoPickForUnmanagedTeams with the shuffled team ids for the started draft', async () => {
    const resolve = await captureAutoStartScheduledDraftsResolver();
    const db = makeMockDb({
      scheduledDraftsRows: [
        {
          draftId: 3,
          leagueId: 30,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          pickTimeLimitSeconds: 120,
          scheduledAt: minutesAgo(1),
        },
      ],
      teamsRowsInOrder: [[{ id: 300 }, { id: 301 }, { id: 302 }]],
    });
    const notificationService = makeNotificationService();

    await resolve(
      {},
      {},
      { isSystemRequest: true, user: null, db, notificationService },
    );

    expect(enableAutoPickForUnmanagedTeams).toHaveBeenCalledWith(
      db,
      30,
      3,
      [300, 301, 302],
    );
  });

  it('LS-8742: preserves a draft_teams order already seeded by an approved slot trade instead of reshuffling', async () => {
    resolveDraftTeamsOrder.mockResolvedValueOnce({
      orderedTeamIds: [501, 500],
      needsInsert: false,
    });
    const resolve = await captureAutoStartScheduledDraftsResolver();
    const db = makeMockDb({
      scheduledDraftsRows: [
        {
          draftId: 8,
          leagueId: 80,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          pickTimeLimitSeconds: 120,
          scheduledAt: minutesAgo(1),
        },
      ],
      teamsRowsInOrder: [[{ id: 500 }, { id: 501 }]],
    });
    const notificationService = makeNotificationService();
    let txMock: ReturnType<typeof makeTxMock> | undefined;
    db.transaction.mockImplementationOnce(
      async (cb: (tx: unknown) => unknown) => {
        txMock = makeTxMock();
        return cb(txMock);
      },
    );

    await resolve(
      {},
      {},
      { isSystemRequest: true, user: null, db, notificationService },
    );

    expect(resolveDraftTeamsOrder).toHaveBeenCalledWith(db, 8, [
      { id: 500 },
      { id: 501 },
    ]);
    expect(enableAutoPickForUnmanagedTeams).toHaveBeenCalledWith(
      db,
      80,
      8,
      [501, 500],
    );
    // needsInsert: false ⇒ the seeded draft_teams rows must be left
    // untouched: only the (unconditional) draft_picks cleanup delete runs,
    // and nothing is (re)inserted into draft_teams.
    expect(txMock?.delete).toHaveBeenCalledTimes(1);
    expect(txMock?.insert).not.toHaveBeenCalled();
  });

  it('wraps the multi-table write sequence in a single transaction', async () => {
    const resolve = await captureAutoStartScheduledDraftsResolver();
    const db = makeMockDb({
      scheduledDraftsRows: [
        {
          draftId: 4,
          leagueId: 40,
          draftMode: 'live',
          selectionMethod: 'standard',
          draftOrder: 'snake',
          pickTimeLimitSeconds: 120,
          scheduledAt: minutesAgo(1),
        },
      ],
      teamsRowsInOrder: [[{ id: 400 }, { id: 401 }]],
    });
    const notificationService = makeNotificationService();

    await resolve(
      {},
      {},
      { isSystemRequest: true, user: null, db, notificationService },
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  describe('guarded rollout — stale backlog cutoff', () => {
    it('skips a draft whose scheduled_at is more than the staleness threshold in the past, without touching teams/transaction', async () => {
      const resolve = await captureAutoStartScheduledDraftsResolver();
      const { STALE_SCHEDULE_THRESHOLD_MS } =
        await import('./auto-start-mutation');
      const db = makeMockDb({
        scheduledDraftsRows: [
          {
            draftId: 5,
            leagueId: 50,
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder: 'snake',
            pickTimeLimitSeconds: 120,
            scheduledAt: new Date(
              Date.now() - STALE_SCHEDULE_THRESHOLD_MS - 60_000,
            ),
          },
        ],
        teamsRowsInOrder: [],
      });
      const notificationService = makeNotificationService();

      const result = await resolve(
        {},
        {},
        { isSystemRequest: true, user: null, db, notificationService },
      );

      expect(result.draftsStarted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/stale backlog/);
      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.select).toHaveBeenCalledTimes(1); // only the scan query — no per-draft teams lookup
    });

    it('starts fresh drafts and skips stale ones in the same invocation', async () => {
      const resolve = await captureAutoStartScheduledDraftsResolver();
      const { STALE_SCHEDULE_THRESHOLD_MS } =
        await import('./auto-start-mutation');
      const db = makeMockDb({
        scheduledDraftsRows: [
          {
            draftId: 6,
            leagueId: 60,
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder: 'snake',
            pickTimeLimitSeconds: 120,
            scheduledAt: minutesAgo(2), // fresh — within threshold
          },
          {
            draftId: 7,
            leagueId: 70,
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder: 'snake',
            pickTimeLimitSeconds: 120,
            scheduledAt: new Date(
              Date.now() - STALE_SCHEDULE_THRESHOLD_MS - 60_000,
            ), // stale
          },
        ],
        teamsRowsInOrder: [[{ id: 600 }, { id: 601 }]],
      });
      const notificationService = makeNotificationService();

      const result = await resolve(
        {},
        {},
        { isSystemRequest: true, user: null, db, notificationService },
      );

      expect(result.draftsStarted).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Draft 7.*stale backlog/);
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });
  });
});

export {};

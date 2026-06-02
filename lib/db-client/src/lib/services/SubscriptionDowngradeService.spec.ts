/**
 * Unit tests for SubscriptionDowngradeService (LS-848).
 *
 * Covers:
 *   - handleSubscriptionDowngrade: no-op when user has no leagues
 *   - handleSubscriptionDowngrade: keeps first 3 leagues, tier-freezes the rest
 *   - handleSubscriptionDowngrade: disables salary cap in active leagues
 *   - handleSubscriptionDowngrade: resets advanced (6/8-team) playoff formats to 4-team
 *   - handleSubscriptionDowngrade: converts FAAB waivers to standard
 *   - handleSubscriptionDowngrade: idempotent (already-frozen leagues skipped)
 *   - reapplyLeagueRestrictions: unfreezes selected leagues, freezes the rest
 *   - clearLeagueTierFreezes: clears tierFrozenAt on all owned leagues
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Mock runWithPublicClient ──────────────────────────────────────────────────

const mockRunWithPublicClient = jest.fn<
  Promise<unknown>,
  [unknown, (db: unknown) => Promise<unknown>]
>();

jest.mock('../client/Helpers', () => ({
  runWithPublicClient: (opts: unknown, cb: (db: unknown) => Promise<unknown>) =>
    mockRunWithPublicClient(opts, cb),
}));

// ── Mock PublicSchema column references ──────────────────────────────────────

jest.mock('../client/PublicDbClient', () => ({
  PublicSchema: {
    leagues: {
      id: 'leagues.id',
      owner: 'leagues.owner',
      isMockDraft: 'leagues.is_mock_draft',
      salaryCapEnabled: 'leagues.salary_cap_enabled',
      playoffFormat: 'leagues.playoff_format',
      waiverType: 'leagues.waiver_type',
      tierFrozenAt: 'leagues.tier_frozen_at',
      frozenAt: 'leagues.frozen_at',
    },
  },
}));

// ── Mock Drizzle ORM helpers ──────────────────────────────────────────────────

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => ({ __and: args })),
  asc: jest.fn((col: unknown) => ({ __asc: col })),
  eq: jest.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
  isNull: jest.fn((col: unknown) => ({ __isNull: col })),
  not: jest.fn((expr: unknown) => ({ __not: expr })),
}));

// ── Import after mocks are set up ─────────────────────────────────────────────

import {
  clearLeagueTierFreezes,
  FREE_TIER_LEAGUE_LIMIT,
  handleSubscriptionDowngrade,
  reapplyLeagueRestrictions,
} from './SubscriptionDowngradeService';

const TEST_DB_OPTS = { type: 'pg-remote' as const };

// ── Mock league builder ───────────────────────────────────────────────────────

interface MockLeague {
  id: number;
  salaryCapEnabled: boolean;
  playoffFormat: '4-team' | '6-team' | '8-team';
  waiverType: 'standard' | 'faab';
  tierFrozenAt: Date | null;
  frozenAt: Date | null;
}

function mockLeague(
  id: number,
  overrides: Partial<MockLeague> = {},
): MockLeague {
  return {
    id,
    salaryCapEnabled: false,
    playoffFormat: '4-team',
    waiverType: 'standard',
    tierFrozenAt: null,
    frozenAt: null,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock Drizzle DB that returns `selectRows` from any select chain
 * and silently accepts update operations.
 *
 * Key design decisions:
 *  - `mockSet` is a shared spy so callers can read `.mock.calls` directly
 *    without needing to call `mockUpdate()` a second time (which would create
 *    a fresh, empty chain).
 *  - `.where()` returns a thenable that ALSO exposes `.orderBy()`, making it
 *    compatible with both `handleSubscriptionDowngrade` (which calls `.orderBy()`)
 *    and `reapplyLeagueRestrictions` / `clearLeagueTierFreezes` (which await
 *    directly after `.where()`).
 */
function makeMockDb(selectRows: MockLeague[]) {
  // Single shared set spy — records every .set() call across all update chains.
  const mockSet = jest.fn((_arg: unknown) => ({
    where: jest.fn(() => Promise.resolve()),
  }));
  const mockUpdate = jest.fn(() => ({ set: mockSet }));

  // .where() is thenable AND has .orderBy() so it works for both:
  //   handleSubscriptionDowngrade: .select().from().where().orderBy()
  //   reapplyLeagueRestrictions:   .select().from().where()  (no orderBy)
  const makeWhereResult = () =>
    Object.assign(Promise.resolve(selectRows), {
      orderBy: jest.fn(() => Promise.resolve(selectRows)),
    });

  const mockDb = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(makeWhereResult),
      })),
    })),
    update: mockUpdate,
  };

  return { mockDb, mockUpdate, mockSet };
}

/**
 * Set up `mockRunWithPublicClient` to call the callback with the given mockDb.
 */
function setupPublicClient(db: unknown) {
  mockRunWithPublicClient.mockImplementationOnce(
    (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FREE_TIER_LEAGUE_LIMIT', () => {
  it('equals 3', () => {
    expect(FREE_TIER_LEAGUE_LIMIT).toBe(3);
  });
});

describe('handleSubscriptionDowngrade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is a no-op when the user owns no leagues', async () => {
    const { mockDb, mockUpdate } = makeMockDb([]);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(1, TEST_DB_OPTS);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not tier-freeze any league when the user has 3 or fewer leagues', async () => {
    const leagues = [mockLeague(1), mockLeague(2), mockLeague(3)];
    const { mockDb, mockUpdate } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(1, TEST_DB_OPTS);

    // With defaults (salaryCapEnabled: false, waiverType: 'standard') and no
    // excess leagues, the service should not call update at all.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('tier-freezes leagues beyond the 3-league limit (oldest 3 kept)', async () => {
    // 5 leagues — IDs 1-5.  Oldest first (lowest ID = oldest).
    const leagues = [1, 2, 3, 4, 5].map((id) => mockLeague(id));
    const { mockDb, mockSet } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(99, TEST_DB_OPTS);

    // mockSet.mock.calls holds every arg passed to .set() across all update chains.
    const frozenSets = mockSet.mock.calls.filter((call) => {
      const arg = call[0] as Record<string, unknown>;
      return 'tierFrozenAt' in arg && arg.tierFrozenAt !== null;
    });
    // Leagues 4 and 5 should be frozen (excess beyond limit of 3)
    expect(frozenSets).toHaveLength(2);
  });

  it('skips already-frozen leagues (idempotent)', async () => {
    const alreadyFrozen = new Date('2026-01-01');
    const leagues = [
      mockLeague(1),
      mockLeague(2),
      mockLeague(3),
      // League 4 is already frozen (excess but skip)
      mockLeague(4, { tierFrozenAt: alreadyFrozen }),
    ];
    const { mockDb, mockUpdate } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(99, TEST_DB_OPTS);

    // League 4 is the only excess league and it's already frozen — service
    // should call update 0 times (no new freezes, no feature downgrades).
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('disables salary cap in active leagues that have it enabled', async () => {
    const leagues = [
      mockLeague(1, { salaryCapEnabled: true }),
      mockLeague(2),
      mockLeague(3),
    ];
    const { mockDb, mockSet } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(1, TEST_DB_OPTS);

    const capDisableSets = mockSet.mock.calls.filter((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg['salaryCapEnabled'] === false;
    });
    expect(capDisableSets).toHaveLength(1);
  });

  it('resets 6-team and 8-team playoff formats to 4-team in active leagues', async () => {
    const leagues = [
      mockLeague(1, { playoffFormat: '6-team' }),
      mockLeague(2, { playoffFormat: '8-team' }),
      mockLeague(3),
    ];
    const { mockDb, mockSet } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(1, TEST_DB_OPTS);

    const playoffResets = mockSet.mock.calls.filter((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg['playoffFormat'] === '4-team';
    });
    expect(playoffResets).toHaveLength(2);
  });

  it('leaves 4-team playoff formats untouched', async () => {
    const leagues = [mockLeague(1), mockLeague(2), mockLeague(3)];
    const { mockDb, mockUpdate } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(1, TEST_DB_OPTS);

    // All defaults (4-team playoff, no salary cap, standard waivers, ≤ limit) —
    // nothing premium to strip, so no update should be issued.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not reset advanced playoff formats in tier-frozen (excess) leagues', async () => {
    // 4 leagues; league 4 is excess (beyond limit) and uses 8-team playoffs.
    // Excess leagues are frozen read-only, not feature-stripped, so its
    // playoffFormat must not be reset.
    const leagues = [
      mockLeague(1),
      mockLeague(2),
      mockLeague(3),
      mockLeague(4, { playoffFormat: '8-team' }),
    ];
    const { mockDb, mockSet } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(1, TEST_DB_OPTS);

    const playoffResets = mockSet.mock.calls.filter((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg['playoffFormat'] === '4-team';
    });
    expect(playoffResets).toHaveLength(0);
  });

  it('converts FAAB waivers to standard in active leagues', async () => {
    const leagues = [
      mockLeague(1, { waiverType: 'faab' }),
      mockLeague(2, { waiverType: 'faab' }),
      mockLeague(3),
    ];
    const { mockDb, mockSet } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    await handleSubscriptionDowngrade(1, TEST_DB_OPTS);

    const waiverConversions = mockSet.mock.calls.filter((call) => {
      const arg = call[0] as Record<string, unknown>;
      return arg['waiverType'] === 'standard';
    });
    expect(waiverConversions).toHaveLength(2);
  });
});

describe('reapplyLeagueRestrictions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unfreezes specified active leagues and freezes the rest', async () => {
    const leagues = [
      mockLeague(1, { tierFrozenAt: new Date() }),
      mockLeague(2, { tierFrozenAt: new Date() }),
      mockLeague(3, { tierFrozenAt: null }),
    ];

    const { mockDb, mockSet } = makeMockDb(leagues);
    setupPublicClient(mockDb);

    // Keep leagues 1 and 2 active; league 3 should be frozen
    await reapplyLeagueRestrictions(1, [1, 2], TEST_DB_OPTS);

    // League 1 and 2: tierFrozenAt → null (unfreeze)
    const unfreezes = mockSet.mock.calls.filter((call) => {
      const arg = call[0] as Record<string, unknown>;
      return 'tierFrozenAt' in arg && arg.tierFrozenAt === null;
    });

    // League 3: tierFrozenAt → now (freeze)
    const freezes = mockSet.mock.calls.filter((call) => {
      const arg = call[0] as Record<string, unknown>;
      return 'tierFrozenAt' in arg && arg.tierFrozenAt !== null;
    });

    expect(unfreezes).toHaveLength(2);
    expect(freezes).toHaveLength(1);
  });
});

describe('clearLeagueTierFreezes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues a bulk update clearing tierFrozenAt for all owned leagues', async () => {
    const mockUpdateSet = jest.fn(() => ({
      where: jest.fn(() => Promise.resolve()),
    }));
    const mockUpdate = jest.fn(() => ({ set: mockUpdateSet }));
    const mockDb = { update: mockUpdate };

    setupPublicClient(mockDb);

    await clearLeagueTierFreezes(1, TEST_DB_OPTS);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ tierFrozenAt: null }),
    );
  });
});

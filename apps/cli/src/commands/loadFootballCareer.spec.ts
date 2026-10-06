import { loadFootballCareerStats } from '@legacy-sports/data-loaders';
import { refreshFootballPlayerEligiblePositions } from '@legacy-sports/db-client';
import { handleLoadFootballCareer } from './loadFootballCareer';

const mockReadFileSync = jest.fn();

jest.mock('fs', () => ({
  readFileSync: (...args: unknown[]): unknown => mockReadFileSync(...args),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({ host: 'localhost' })),
}));

jest.mock('drizzle-orm', () =>
  mockDrizzleOrm({
    and: jest.fn((...args: unknown[]) => ({ and: args })),
    eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
    isNotNull: jest.fn((col: unknown) => ({ isNotNull: col })),
  }),
);

jest.mock('@legacy-sports/data-loaders', () => ({
  loadFootballCareerStats: jest.fn(),
}));

// A marker class stands in for an axios 403 error without depending on
// axios internals — isPfrForbiddenError is mocked to recognize it directly.
class FakeAuthError extends Error {
  readonly isAuthError = true;
  constructor() {
    super('Request failed with status code 403');
  }
}

jest.mock('@legacy-sports/pfr-client', () => ({
  clearCache: jest.fn(),
  isPfrForbiddenError: jest.fn((err: unknown) => err instanceof FakeAuthError),
}));

interface FakePlayer {
  id: number;
  pfrId: string | null;
}

// Stand-in for the drizzle query builder chain used by both
// getFootballPlayers (select().from().where()) and
// getFootballPlayersPrioritized (select().from().where().orderBy().limit()).
function makeFakeDb(players: FakePlayer[]) {
  const limitMock = jest.fn().mockResolvedValue(players);
  const orderByMock = jest.fn(() => ({ limit: limitMock }));
  const whereResult = {
    orderBy: orderByMock,
    then: (
      resolve: (value: FakePlayer[]) => void,
      reject?: (reason: unknown) => void,
    ) => Promise.resolve(players).then(resolve, reject),
  };
  const whereMock = jest.fn(() => whereResult);
  const fromMock = jest.fn(() => ({ where: whereMock }));
  const selectMock = jest.fn(() => ({ from: fromMock }));
  return { select: selectMock };
}

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    runWithPublicClient: jest.fn(
      (_opts: unknown, cb: (db: unknown) => Promise<unknown>) =>
        cb(currentFakeDb),
    ),
    refreshFootballPlayerEligiblePositions: jest.fn(),
    PublicSchema: {
      players: {
        sport: 'players.sport',
        pfrId: 'players.pfr_id',
      },
    },
  }),
);

// Mutable binding read by the runWithPublicClient mock above — set per-test
// before calling handleLoadFootballCareer.
let currentFakeDb: ReturnType<typeof makeFakeDb>;

function makePlayers(count: number): FakePlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    pfrId: `Player${i + 1}00`,
  }));
}

describe('handleLoadFootballCareer — consecutive-failure streak detection', () => {
  let exitSpy: jest.SpyInstance;
  const loadStats = loadFootballCareerStats as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  describe('--limit mode', () => {
    it('aborts early once 4 consecutive players fail with a 403, without touching remaining players', async () => {
      const players = makePlayers(6);
      currentFakeDb = makeFakeDb(players);
      loadStats.mockRejectedValue(new FakeAuthError());

      await handleLoadFootballCareer({ limit: 6 });

      // Streak threshold is 4 — the loop must stop after the 4th player.
      expect(loadStats).toHaveBeenCalledTimes(4);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not abort when 403s are interrupted by a success (streak resets)', async () => {
      const players = makePlayers(7);
      currentFakeDb = makeFakeDb(players);
      loadStats
        .mockRejectedValueOnce(new FakeAuthError())
        .mockRejectedValueOnce(new FakeAuthError())
        .mockRejectedValueOnce(new FakeAuthError())
        .mockResolvedValueOnce({
          playerId: 4,
          pfrId: 'Player400',
          groupsUpserted: ['passing'],
        })
        .mockRejectedValueOnce(new FakeAuthError())
        .mockRejectedValueOnce(new FakeAuthError())
        .mockRejectedValueOnce(new FakeAuthError());

      await handleLoadFootballCareer({ limit: 7 });

      // All 7 players attempted — the streak never reaches 4 in a row.
      expect(loadStats).toHaveBeenCalledTimes(7);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    // LS-8431: a dropped DB connection failed every remaining player in the
    // same second. The abort must not be auth-specific — any consecutive-
    // failure run is systemic and has to stop the loop.
    it('aborts early on a streak of non-auth failures (e.g. a DB outage)', async () => {
      const players = makePlayers(20);
      currentFakeDb = makeFakeDb(players);
      loadStats.mockRejectedValue(
        new Error('Failed query: select "id", "first_name" from players'),
      );

      await handleLoadFootballCareer({ limit: 20 });

      expect(loadStats).toHaveBeenCalledTimes(4);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not abort when non-auth failures are interrupted by successes', async () => {
      const players = makePlayers(5);
      currentFakeDb = makeFakeDb(players);
      loadStats
        .mockRejectedValueOnce(new Error('Player not found'))
        .mockRejectedValueOnce(new Error('Player not found'))
        .mockResolvedValueOnce({
          playerId: 3,
          pfrId: 'Player300',
          groupsUpserted: ['passing'],
        })
        .mockRejectedValueOnce(new Error('Player not found'))
        .mockRejectedValueOnce(new Error('Player not found'));

      await handleLoadFootballCareer({ limit: 5 });

      expect(loadStats).toHaveBeenCalledTimes(5);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits non-zero when the streak aborts mid-batch, even though not every player was attempted', async () => {
      const players = makePlayers(10);
      currentFakeDb = makeFakeDb(players);
      loadStats.mockRejectedValue(new FakeAuthError());

      await handleLoadFootballCareer({ limit: 10 });

      // Only 4 of 10 players were attempted (errors.length !== batchPlayers.length),
      // yet the run must still fail loudly instead of silently exiting 0.
      expect(loadStats).toHaveBeenCalledTimes(4);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('does not exit non-zero when only some players fail and no streak forms', async () => {
      const players = makePlayers(4);
      currentFakeDb = makeFakeDb(players);
      loadStats
        .mockResolvedValueOnce({
          playerId: 1,
          pfrId: 'Player100',
          groupsUpserted: ['passing'],
        })
        .mockRejectedValueOnce(new Error('some transient error'))
        .mockResolvedValueOnce({
          playerId: 3,
          pfrId: 'Player300',
          groupsUpserted: [],
        })
        .mockResolvedValueOnce({
          playerId: 4,
          pfrId: 'Player400',
          groupsUpserted: ['rushing'],
        });

      await handleLoadFootballCareer({ limit: 4 });

      expect(loadStats).toHaveBeenCalledTimes(4);
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  describe('--all mode', () => {
    it('aborts early on a 4-in-a-row 403 streak and exits non-zero', async () => {
      const players = makePlayers(20);
      currentFakeDb = makeFakeDb(players);
      loadStats.mockRejectedValue(new FakeAuthError());

      await handleLoadFootballCareer({ all: true });

      expect(loadStats).toHaveBeenCalledTimes(4);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('runs to completion and does not exit non-zero without a 403 streak', async () => {
      const players = makePlayers(5);
      currentFakeDb = makeFakeDb(players);
      loadStats.mockResolvedValue({
        playerId: 1,
        pfrId: 'PlayerX00',
        groupsUpserted: [],
      });

      await handleLoadFootballCareer({ all: true });

      expect(loadStats).toHaveBeenCalledTimes(5);
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  describe('--batch mode', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue('1\n2\n3\n4\n5\n6\n');
    });

    it('aborts early on a 4-in-a-row 403 streak and exits non-zero', async () => {
      currentFakeDb = makeFakeDb([]);
      loadStats.mockRejectedValue(new FakeAuthError());

      await handleLoadFootballCareer({ batch: 'players.txt' });

      expect(loadStats).toHaveBeenCalledTimes(4);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});

describe('handleLoadFootballCareer — Rollbar noise reduction', () => {
  const AUTH_EXPIRED_MESSAGE =
    'PFR auth appears to have expired — refresh PFR_CF_CLEARANCE and re-run.';
  let exitSpy: jest.SpyInstance;
  const loadStats = loadFootballCareerStats as jest.Mock;
  const { LOGGER }: { LOGGER: { warn: jest.Mock; error: jest.Mock } } =
    jest.requireMock('@legacy-sports/logging');

  /**
   * Only `error`/`fatal` entries reach Rollbar
   * (RollbarOutputDestination.shouldLog), so the count of LOGGER.error calls
   * is the count of Rollbar occurrences a run produces.
   */
  const rollbarOccurrences = (): number => LOGGER.error.mock.calls.length;

  const authAlerts = (): unknown[] =>
    LOGGER.error.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes(AUTH_EXPIRED_MESSAGE),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('logs individual 403s at warn (not error) so they are not forwarded to Rollbar', async () => {
    const players = makePlayers(3);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new FakeAuthError());

    await handleLoadFootballCareer({ limit: 3 });

    expect(LOGGER.warn).toHaveBeenCalledWith(
      expect.stringContaining('Player 1 failed'),
    );
    expect(LOGGER.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Player 1 failed'),
    );
  });

  // LS-8431 regression: non-auth per-player failures used to be logged at
  // `error`, so a DB outage mid-run produced one Rollbar occurrence per
  // player — 20+ in one second — which tripped Rollbar's per-minute item cap
  // and caused genuine errors to be dropped (LS-8571).
  it('logs non-auth per-player failures at warn, not error', async () => {
    const players = makePlayers(3);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new Error('Failed query: select "id"'));

    await handleLoadFootballCareer({ limit: 3 });

    expect(LOGGER.warn).toHaveBeenCalledWith(
      expect.stringContaining('Player 1 failed'),
    );
    expect(LOGGER.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Player 1 failed'),
    );
  });

  it('emits at most one Rollbar-bound error for a run where every player fails', async () => {
    const players = makePlayers(50);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new Error('Failed query: select "id"'));

    await handleLoadFootballCareer({ limit: 50 });

    expect(rollbarOccurrences()).toBe(1);
  });

  it('includes the first error in the single summary so the cause stays diagnosable', async () => {
    const players = makePlayers(6);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new Error('Failed query: select "id"'));

    await handleLoadFootballCareer({ limit: 6 });

    expect(LOGGER.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed query: select "id"'),
      expect.anything(),
    );
  });

  // The reviewer flagged (correctly) that interpolating only the message
  // string denies Rollbar a stack trace — RollbarOutputDestination forwards
  // the first Error argument, so the summary must pass the Error instance
  // itself, not just its text.
  it('forwards the first Error instance to Rollbar for the stack trace', async () => {
    const players = makePlayers(6);
    currentFakeDb = makeFakeDb(players);
    const dbError = new Error('Failed query: select "id"');
    loadStats.mockRejectedValue(dbError);

    await handleLoadFootballCareer({ limit: 6 });

    const forwardedError = LOGGER.error.mock.calls
      .flat()
      .find((arg: unknown) => arg instanceof Error);
    expect(forwardedError).toBe(dbError);
  });

  it('raises exactly one actionable alert when auth failures never form a streak', async () => {
    const players = makePlayers(4);
    currentFakeDb = makeFakeDb(players);
    loadStats
      .mockRejectedValueOnce(new FakeAuthError())
      .mockResolvedValueOnce({
        playerId: 2,
        pfrId: 'Player200',
        groupsUpserted: [],
      })
      .mockRejectedValueOnce(new FakeAuthError())
      .mockResolvedValueOnce({
        playerId: 4,
        pfrId: 'Player400',
        groupsUpserted: [],
      });

    await handleLoadFootballCareer({ limit: 4 });

    expect(authAlerts()).toHaveLength(1);
  });

  it('does not double-alert when the streak abort already raised the summary', async () => {
    const players = makePlayers(6);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new FakeAuthError());

    await handleLoadFootballCareer({ limit: 6 });

    expect(authAlerts()).toHaveLength(1);
  });

  it('does not raise the auth alert when no auth failures occurred', async () => {
    const players = makePlayers(2);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new Error('some transient error'));

    await handleLoadFootballCareer({ limit: 2 });

    expect(authAlerts()).toHaveLength(0);
  });
});

describe('handleLoadFootballCareer — football_player_eligible_positions refresh (LS-10553)', () => {
  const loadStats = loadFootballCareerStats as jest.Mock;
  const refresh = refreshFootballPlayerEligiblePositions as jest.Mock;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('refreshes once after a batch run with at least one success', async () => {
    currentFakeDb = makeFakeDb(makePlayers(3));
    loadStats.mockResolvedValue({
      playerId: 1,
      pfrId: 'PlayerX00',
      groupsUpserted: ['passing'],
    });

    await handleLoadFootballCareer({ limit: 3 });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(currentFakeDb);
  });

  it('refreshes after a successful single-player load', async () => {
    currentFakeDb = makeFakeDb([]);
    loadStats.mockResolvedValue({
      playerId: 7,
      pfrId: 'Player700',
      groupsUpserted: ['kicking'],
    });

    await handleLoadFootballCareer({ playerId: 7 });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('skips the refresh when every player failed', async () => {
    currentFakeDb = makeFakeDb(makePlayers(2));
    loadStats.mockRejectedValue(new Error('boom'));

    await handleLoadFootballCareer({ limit: 2 });

    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not fail the run when the refresh throws', async () => {
    currentFakeDb = makeFakeDb(makePlayers(1));
    loadStats.mockResolvedValue({
      playerId: 1,
      pfrId: 'Player100',
      groupsUpserted: [],
    });
    refresh.mockRejectedValueOnce(new Error('lock timeout'));

    await expect(
      handleLoadFootballCareer({ limit: 1 }),
    ).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
    // The Error instance (not a string) reaches the logger so Rollbar keeps
    // the stack trace.
    const { LOGGER }: { LOGGER: { error: jest.Mock } } = jest.requireMock(
      '@legacy-sports/logging',
    );
    expect(LOGGER.error).toHaveBeenCalledWith(
      'Failed to refresh football_player_eligible_positions:',
      expect.objectContaining({ message: 'lock timeout' }),
    );
  });
});

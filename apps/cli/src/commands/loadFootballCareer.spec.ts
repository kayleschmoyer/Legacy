import { loadFootballCareerStats } from '@legacy-sports/data-loaders';
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

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => ({ and: args })),
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
  isNotNull: jest.fn((col: unknown) => ({ isNotNull: col })),
  sql: Object.assign(jest.fn(), { raw: jest.fn() }),
}));

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

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: jest.fn(
    (_opts: unknown, cb: (db: unknown) => Promise<unknown>) =>
      cb(currentFakeDb),
  ),
  PublicSchema: {
    players: {
      sport: 'players.sport',
      pfrId: 'players.pfr_id',
    },
  },
}));

// Mutable binding read by the runWithPublicClient mock above — set per-test
// before calling handleLoadFootballCareer.
let currentFakeDb: ReturnType<typeof makeFakeDb>;

function makePlayers(count: number): FakePlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    pfrId: `Player${i + 1}00`,
  }));
}

describe('handleLoadFootballCareer — consecutive-403 streak detection', () => {
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

    it('does not abort on scattered non-auth failures below the streak threshold', async () => {
      const players = makePlayers(5);
      currentFakeDb = makeFakeDb(players);
      loadStats.mockRejectedValue(new Error('Player not found'));

      await handleLoadFootballCareer({ limit: 5 });

      expect(loadStats).toHaveBeenCalledTimes(5);
      // Every player failed, so the existing "whole batch failed" exit path
      // still fires — just not via the auth-streak path.
      expect(exitSpy).toHaveBeenCalledWith(1);
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

describe('handleLoadFootballCareer — auth-failure Rollbar noise reduction', () => {
  const AUTH_EXPIRED_MESSAGE =
    'PFR auth appears to have expired — refresh PFR_CF_CLEARANCE and re-run.';
  let exitSpy: jest.SpyInstance;
  const loadStats = loadFootballCareerStats as jest.Mock;
  const { LOGGER }: { LOGGER: { warn: jest.Mock; error: jest.Mock } } =
    jest.requireMock('@legacy-sports/logging');

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

  it('still logs non-auth failures at error so they remain individually actionable', async () => {
    const players = makePlayers(1);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new Error('Player not found'));

    await handleLoadFootballCareer({ limit: 1 });

    expect(LOGGER.error).toHaveBeenCalledWith(
      expect.stringContaining('Player 1 failed'),
    );
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

    const authAlertCalls = LOGGER.error.mock.calls.filter(
      (call: unknown[]) => call[0] === AUTH_EXPIRED_MESSAGE,
    );
    expect(authAlertCalls).toHaveLength(1);
  });

  it('does not double-alert when the streak abort already raised the summary', async () => {
    const players = makePlayers(6);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new FakeAuthError());

    await handleLoadFootballCareer({ limit: 6 });

    const authAlertCalls = LOGGER.error.mock.calls.filter(
      (call: unknown[]) => call[0] === AUTH_EXPIRED_MESSAGE,
    );
    expect(authAlertCalls).toHaveLength(1);
  });

  it('does not raise the auth alert when no auth failures occurred', async () => {
    const players = makePlayers(2);
    currentFakeDb = makeFakeDb(players);
    loadStats.mockRejectedValue(new Error('some transient error'));

    await handleLoadFootballCareer({ limit: 2 });

    const authAlertCalls = LOGGER.error.mock.calls.filter(
      (call: unknown[]) => call[0] === AUTH_EXPIRED_MESSAGE,
    );
    expect(authAlertCalls).toHaveLength(0);
  });
});

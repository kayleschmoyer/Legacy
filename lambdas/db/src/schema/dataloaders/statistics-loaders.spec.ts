/**
 * Regression tests for the season stats loaders' pool-timeout retry (LS-10037).
 *
 * The Rollbar trace for item 250 showed createSeasonPitchingLoader's batch
 * query failing with the pg pool's "timeout exceeded when trying to connect"
 * message under concurrent Matchup.winProbability fan-out — the same
 * `withPoolTimeoutRetry` gap already fixed for createLeaguePositionByIdLoader
 * (LS-8478). createSeasonBattingLoader and createSeasonFieldingLoader share
 * the identical pattern and are fired alongside it in the same Promise.all,
 * so all three are covered here.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Minimal stand-in mirroring Helpers.ts's real `withPoolTimeoutRetry` (retry
// up to 2x on the pool's connection-timeout message).
jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    seasonBatting: { playerId: 'sb.playerId', season: 'sb.season' },
    seasonPitching: { playerId: 'sp.playerId', season: 'sp.season' },
    seasonFielding: { playerId: 'sf.playerId', season: 'sf.season' },
  },
  withPoolTimeoutRetry: async (queryFn: () => Promise<unknown>) => {
    const POOL_TIMEOUT_MESSAGE = 'timeout exceeded when trying to connect';
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await queryFn();
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === POOL_TIMEOUT_MESSAGE &&
          attempt < 2
        ) {
          continue;
        }
        throw err;
      }
    }
  },
}));

import {
  createSeasonBattingLoader,
  createSeasonFieldingLoader,
  createSeasonPitchingLoader,
} from './statistics-loaders';

function makeMockDb(resolver: () => unknown) {
  let calls = 0;
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => ({
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => {
        calls += 1;
        return Promise.resolve(resolver()).then(onFulfilled, onRejected);
      },
    }),
  };
  return {
    db: {
      select: () => chain,
    } as unknown as Parameters<typeof createSeasonPitchingLoader>[0],
    getCalls: () => calls,
  };
}

describe.each([
  ['createSeasonBattingLoader', createSeasonBattingLoader],
  ['createSeasonPitchingLoader', createSeasonPitchingLoader],
  ['createSeasonFieldingLoader', createSeasonFieldingLoader],
] as const)('%s — pool timeout retry (LS-10037)', (_name, createLoader) => {
  it('retries and succeeds after a pool connection-timeout error', async () => {
    let attempt = 0;
    const row = { playerId: 11, season: 2024 };
    const { db, getCalls } = makeMockDb(() => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('timeout exceeded when trying to connect');
      }
      return [row];
    });

    const loader = createLoader(db);
    await expect(loader.load('11-2024')).resolves.toEqual(row);
    expect(getCalls()).toBe(2);
  });

  it('does not retry and rejects on a non-pool-timeout error', async () => {
    const dbErr = new Error('syntax error at or near "SELECT"');
    const { db, getCalls } = makeMockDb(() => {
      throw dbErr;
    });

    const loader = createLoader(db);
    await expect(loader.load('11-2024')).rejects.toThrow(
      'syntax error at or near "SELECT"',
    );
    expect(getCalls()).toBe(1);
  });
});

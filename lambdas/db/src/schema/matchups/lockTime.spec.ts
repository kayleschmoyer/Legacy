/**
 * Regression tests for Matchup.lockTime's pool-timeout retry (LS-10042/LS-10045).
 *
 * Rollbar items 255/257 (roster_lock_rules) and 258 (leagues.roster_lock_timing)
 * showed this resolver's two direct selects failing with the pg pool's
 * "timeout exceeded when trying to connect" message under concurrent
 * Matchup.lockTime fan-out — the same withPoolTimeoutRetry gap already fixed
 * for createLeaguePositionByIdLoader (LS-8478).
 */

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    leagues: { id: 'leagues.id', rosterLockTiming: 'leagues.rosterLockTiming' },
    rosterLockRules: {
      leagueId: 'rosterLockRules.leagueId',
      customLockTime: 'rosterLockRules.customLockTime',
      lockHoursBeforeMatchup: 'rosterLockRules.lockHoursBeforeMatchup',
    },
  },
  computeRosterLockTime: jest.fn(
    (matchupStartTime: string | null) =>
      matchupStartTime && new Date(matchupStartTime),
  ),
  // Minimal stand-in mirroring Helpers.ts's real `withPoolTimeoutRetry` (retry
  // up to 2x on the pool's connection-timeout message).
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

import { resolveMatchupLockTime } from './lockTime';
import type { Context } from '../builder';

const SCHEDULED = {
  id: 1,
  leagueId: 5,
  status: 'scheduled',
  startTime: '2026-09-14T18:00:00.000Z',
};

function makeContext(
  leagueSelectImpl: () => Promise<unknown[]>,
  lockRulesSelectImpl: () => Promise<unknown[]>,
) {
  // Advances to the lock-rules query only once the league query has actually
  // succeeded — mirroring real call order, where a retried (failed) league
  // query must keep calling leagueSelectImpl rather than "moving on" to the
  // next query the way a plain call-count index would.
  let phase: 'league' | 'lockRules' = 'league';
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const result =
                phase === 'league'
                  ? await leagueSelectImpl()
                  : await lockRulesSelectImpl();
              if (phase === 'league') phase = 'lockRules';
              return result;
            },
          }),
        }),
      }),
    },
  } as unknown as Context;
}

describe('resolveMatchupLockTime — pool timeout retry (LS-10042/LS-10045)', () => {
  it('returns null without querying when the matchup is no longer scheduled', async () => {
    const ctx = makeContext(
      () => Promise.reject(new Error('should not be called')),
      () => Promise.reject(new Error('should not be called')),
    );
    await expect(
      resolveMatchupLockTime({ ...SCHEDULED, status: 'in_progress' }, ctx),
    ).resolves.toBeNull();
  });

  it('retries the league select after a pool connection-timeout error', async () => {
    let leagueAttempt = 0;
    const ctx = makeContext(
      () => {
        leagueAttempt += 1;
        if (leagueAttempt === 1) {
          return Promise.reject(
            new Error('timeout exceeded when trying to connect'),
          );
        }
        return Promise.resolve([{ rosterLockTiming: 'matchup_start' }]);
      },
      () => Promise.resolve([]),
    );

    const result = await resolveMatchupLockTime(SCHEDULED, ctx);

    expect(leagueAttempt).toBe(2);
    expect(result).toBe(new Date(SCHEDULED.startTime).toISOString());
  });

  it('retries the roster-lock-rules select after a pool connection-timeout error', async () => {
    let lockRulesAttempt = 0;
    const ctx = makeContext(
      () => Promise.resolve([{ rosterLockTiming: 'matchup_start' }]),
      () => {
        lockRulesAttempt += 1;
        if (lockRulesAttempt === 1) {
          return Promise.reject(
            new Error('timeout exceeded when trying to connect'),
          );
        }
        return Promise.resolve([]);
      },
    );

    const result = await resolveMatchupLockTime(SCHEDULED, ctx);

    expect(lockRulesAttempt).toBe(2);
    expect(result).toBe(new Date(SCHEDULED.startTime).toISOString());
  });

  it('does not retry and rejects on a non-pool-timeout error', async () => {
    const ctx = makeContext(
      () => Promise.reject(new Error('syntax error at or near "SELECT"')),
      () => Promise.resolve([]),
    );

    await expect(resolveMatchupLockTime(SCHEDULED, ctx)).rejects.toThrow(
      'syntax error at or near "SELECT"',
    );
  });
});

/**
 * Tests for Matchup.lockTime.
 *
 * The resolver's per-league inputs (`leagues.roster_lock_timing` and the
 * `roster_lock_rules` row) are read through the request-scoped
 * `leagueRosterLockInputs` loader (LS-10307). Selecting them directly per
 * matchup — 2 identical queries for every matchup in a league-wide query —
 * exhausted the Lambda's connection pool (LS-10042/LS-10045, LS-10307). The
 * loader's own batching and pool-timeout retry are covered in
 * `dataloaders/matchup-loaders.spec.ts`.
 */

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    computeRosterLockTime: jest.fn(
      (matchupStartTime: string | null) =>
        matchupStartTime && new Date(matchupStartTime),
    ),
  }),
);

import { computeRosterLockTime } from '@legacy-sports/db-client';
import { resolveMatchupLockTime } from './lockTime';
import type { Context } from '../builder';

const SCHEDULED = {
  id: 1,
  leagueId: 5,
  status: 'scheduled',
  startTime: '2026-09-14T18:00:00.000Z',
};

function makeContext(loadImpl: (leagueId: number) => Promise<unknown>) {
  const load = jest.fn(loadImpl);
  return {
    ctx: {
      loaders: { leagueRosterLockInputs: { load } },
    } as unknown as Context,
    load,
  };
}

describe('resolveMatchupLockTime', () => {
  beforeEach(() => {
    jest.mocked(computeRosterLockTime).mockClear();
  });

  it('returns null without loading when the matchup is no longer scheduled', async () => {
    const { ctx, load } = makeContext(() =>
      Promise.reject(new Error('should not be called')),
    );
    await expect(
      resolveMatchupLockTime({ ...SCHEDULED, status: 'in_progress' }, ctx),
    ).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('returns null when the league does not exist', async () => {
    const { ctx } = makeContext(() => Promise.resolve(null));
    await expect(resolveMatchupLockTime(SCHEDULED, ctx)).resolves.toBeNull();
  });

  it('computes the lock time from the league-scoped loader inputs', async () => {
    const lockRules = { customLockTime: null, lockHoursBeforeMatchup: 2 };
    const { ctx, load } = makeContext(() =>
      Promise.resolve({ rosterLockTiming: 'custom', lockRules }),
    );

    const result = await resolveMatchupLockTime(SCHEDULED, ctx);

    expect(load).toHaveBeenCalledWith(SCHEDULED.leagueId);
    expect(computeRosterLockTime).toHaveBeenCalledWith(
      SCHEDULED.startTime,
      'custom',
      lockRules,
    );
    expect(result).toBe(new Date(SCHEDULED.startTime).toISOString());
  });

  it('propagates a loader failure', async () => {
    const { ctx } = makeContext(() =>
      Promise.reject(new Error('syntax error at or near "SELECT"')),
    );
    await expect(resolveMatchupLockTime(SCHEDULED, ctx)).rejects.toThrow(
      'syntax error at or near "SELECT"',
    );
  });
});

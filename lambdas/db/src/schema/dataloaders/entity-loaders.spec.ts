/**
 * Unit tests for the league-payroll dataloaders (LS-2506).
 *
 * Verifies that Team.totalPayroll / Team.capSpace hot-path no longer issues
 * one query per Team — both loaders batch their inputs into a single
 * underlying DB query.
 */

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    leagues: {
      id: 'leagues.id',
      salaryCapEnabled: 'leagues.salaryCapEnabled',
      salaryCap: 'leagues.salaryCap',
      luxuryTaxThreshold: 'leagues.luxuryTaxThreshold',
    },
    teamMembers: {
      teamId: 'teamMembers.teamId',
      leagueId: 'teamMembers.leagueId',
      salary: 'teamMembers.salary',
    },
    leaguePosition: {
      id: 'leaguePosition.id',
      leagueId: 'leaguePosition.leagueId',
      positionType: 'leaguePosition.positionType',
    },
  },
  // Minimal stand-in mirroring Helpers.ts's real `withPoolTimeoutRetry` (retry
  // up to 2x on the pool's connection-timeout message) so the loader-level
  // regression test below (LS-8478) exercises the same retry contract without
  // pulling in the real Helpers module (and its pg/drizzle dependencies).
  withPoolTimeoutRetry: async (queryFn: () => Promise<unknown>) => {
    const POOL_TIMEOUT_MESSAGE = 'timeout exceeded when trying to connect';
    const isPoolTimeout = (err: unknown): boolean => {
      let current: unknown = err;
      while (current instanceof Error) {
        if (current.message === POOL_TIMEOUT_MESSAGE) return true;
        current = (current as Error & { cause?: unknown }).cause;
      }
      return false;
    };
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await queryFn();
      } catch (err) {
        if (isPoolTimeout(err) && attempt < 2) continue;
        throw err;
      }
    }
  },
}));

import {
  createLeaguePayrollConfigLoader,
  createLeaguePositionByIdLoader,
  createTeamPayrollLoader,
} from './entity-loaders';

type ChainResolver = (chain: {
  fields: unknown;
  table: unknown;
  whereArg: unknown;
  groupByArg?: unknown;
}) => unknown;

function makeMockDb(resolver: ChainResolver) {
  const calls: Array<{
    fields: unknown;
    table: unknown;
    whereArg: unknown;
    groupByArg?: unknown;
  }> = [];

  const buildChain = (fields: unknown) => {
    const state: {
      fields: unknown;
      table: unknown;
      whereArg: unknown;
      groupByArg?: unknown;
    } = {
      fields,
      table: undefined,
      whereArg: undefined,
    };
    const chain: Record<string, unknown> = {
      from(table: unknown) {
        state.table = table;
        return chain;
      },
      where(whereArg: unknown) {
        state.whereArg = whereArg;
        // Make the where() result thenable so `await db.select().from().where()` works.
        return {
          ...chain,
          then: (
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => {
            try {
              calls.push({ ...state });
              return Promise.resolve(resolver(state)).then(
                onFulfilled,
                onRejected,
              );
            } catch (err) {
              if (onRejected) return Promise.resolve(onRejected(err));
              return Promise.reject(
                err instanceof Error ? err : new Error(String(err)),
              );
            }
          },
        };
      },
      groupBy(groupByArg: unknown) {
        state.groupByArg = groupByArg;
        calls.push({ ...state });
        return Promise.resolve(resolver(state));
      },
    };
    return chain;
  };

  return {
    db: {
      select: (fields: unknown) => buildChain(fields),
    } as unknown as Parameters<typeof createLeaguePayrollConfigLoader>[0],
    calls,
  };
}

describe('createLeaguePayrollConfigLoader (LS-2506)', () => {
  it('batches multiple leagueId loads into a single query', async () => {
    const rows = [
      {
        id: 1,
        salaryCapEnabled: true,
        salaryCap: 200,
        luxuryTaxThreshold: 150,
      },
      {
        id: 2,
        salaryCapEnabled: false,
        salaryCap: null,
        luxuryTaxThreshold: null,
      },
    ];
    const { db, calls } = makeMockDb(() => rows);
    const loader = createLeaguePayrollConfigLoader(db);

    const [a, b, dup] = await Promise.all([
      loader.load(1),
      loader.load(2),
      loader.load(1),
    ]);

    expect(calls).toHaveLength(1);
    expect(a).toEqual({
      salaryCapEnabled: true,
      salaryCap: 200,
      luxuryTaxThreshold: 150,
    });
    expect(b).toEqual({
      salaryCapEnabled: false,
      salaryCap: null,
      luxuryTaxThreshold: null,
    });
    expect(dup).toBe(a);
  });

  it('returns null when the league row is missing', async () => {
    const { db } = makeMockDb(() => []);
    const loader = createLeaguePayrollConfigLoader(db);
    await expect(loader.load(999)).resolves.toBeNull();
  });
});

describe('createTeamPayrollLoader (LS-2506)', () => {
  it('batches all teamIds in a league into a single GROUP BY query', async () => {
    const { db, calls } = makeMockDb(() => [
      { teamId: 10, total: 50 },
      { teamId: 11, total: 75 },
      // teamId 12 has no rows — should resolve to 0
    ]);
    const loader = createTeamPayrollLoader(db);

    const [a, b, c] = await Promise.all([
      loader.load({ teamId: 10, leagueId: 1 }),
      loader.load({ teamId: 11, leagueId: 1 }),
      loader.load({ teamId: 12, leagueId: 1 }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.groupByArg).toBe('teamMembers.teamId');
    expect(a).toBe(50);
    expect(b).toBe(75);
    expect(c).toBe(0);
  });

  it('issues one query per league when keys span leagues', async () => {
    const { db, calls } = makeMockDb(() => [{ teamId: 10, total: 25 }]);
    const loader = createTeamPayrollLoader(db);

    await Promise.all([
      loader.load({ teamId: 10, leagueId: 1 }),
      loader.load({ teamId: 10, leagueId: 2 }),
    ]);

    expect(calls).toHaveLength(2);
  });
});

// LS-8478: the league_positions batch query intermittently failed with
// "timeout exceeded when trying to connect" when the per-request connection
// pool was exhausted by concurrent DataLoader batches. The loader now wraps
// its query in `withPoolTimeoutRetry` so a transient pool timeout is retried
// instead of propagating and crashing the resolving field.
describe('createLeaguePositionByIdLoader (LS-8478)', () => {
  it('retries and succeeds after a pool connection-timeout error', async () => {
    let call = 0;
    const rows = [{ id: 5, leagueId: 1, positionType: 'C' }];
    const { db, calls } = makeMockDb(() => {
      call += 1;
      if (call === 1) {
        throw new Error('timeout exceeded when trying to connect');
      }
      return rows;
    });
    const loader = createLeaguePositionByIdLoader(db);

    await expect(loader.load(5)).resolves.toEqual(rows[0]);
    expect(calls).toHaveLength(2);
  });

  it('does not retry and rejects on a non-pool-timeout error', async () => {
    const dbErr = new Error('syntax error at or near "SELECT"');
    const { db, calls } = makeMockDb(() => {
      throw dbErr;
    });
    const loader = createLeaguePositionByIdLoader(db);

    await expect(loader.load(5)).rejects.toThrow(
      'syntax error at or near "SELECT"',
    );
    expect(calls).toHaveLength(1);
  });
});

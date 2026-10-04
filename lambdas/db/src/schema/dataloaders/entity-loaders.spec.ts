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
      maxRosterSize: 'leagues.maxRosterSize',
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
    playerEligiblePositions: {
      playerId: 'pep.playerId',
      position: 'pep.position',
      games: 'pep.games',
    },
    footballPlayerEligiblePositions: {
      playerId: 'fpep.playerId',
      position: 'fpep.position',
    },
    seasonBatting: {
      playerId: 'sb.playerId',
      team: 'sb.team',
      g: 'sb.g',
      season: 'sb.season',
    },
    seasonPitching: {
      playerId: 'sp.playerId',
      team: 'sp.team',
      g: 'sp.g',
      season: 'sp.season',
    },
    players: {
      id: 'players.id',
      nflTeam: 'players.nflTeam',
    },
    teams: {
      id: 'teams.id',
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
  clearEligiblePositionsCache,
  clearPlayerClubCache,
  createEligiblePositionsLoader,
  createLeaguePayrollConfigLoader,
  createLeaguePositionByIdLoader,
  createPlayerClubLoader,
  createTeamPayrollLoader,
  createTeamRosterLimitStatusLoader,
  createTeamsLoader,
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

describe('createTeamRosterLimitStatusLoader (LS-10477)', () => {
  it('batches a league into one limit read plus one GROUP BY count', async () => {
    const { db, calls } = makeMockDb((chain) =>
      chain.groupByArg
        ? [
            { teamId: 10, total: 28 },
            { teamId: 11, total: 26 },
            // teamId 12 has no roster rows
          ]
        : [{ maxRosterSize: 26 }],
    );
    const loader = createTeamRosterLimitStatusLoader(db);

    const [a, b, c] = await Promise.all([
      loader.load({ teamId: 10, leagueId: 1 }),
      loader.load({ teamId: 11, leagueId: 1 }),
      loader.load({ teamId: 12, leagueId: 1 }),
    ]);

    expect(calls).toHaveLength(2);
    expect(a).toEqual({
      rosterSize: 28,
      maxRosterSize: 26,
      isOverLimit: true,
      playersToRelease: 2,
    });
    expect(b).toMatchObject({ isOverLimit: false, playersToRelease: 0 });
    expect(c).toMatchObject({ rosterSize: 0, isOverLimit: false });
  });

  it('resolves null when the league does not exist', async () => {
    const { db } = makeMockDb(() => []);
    const loader = createTeamRosterLimitStatusLoader(db);
    await expect(
      loader.load({ teamId: 10, leagueId: 999 }),
    ).resolves.toBeNull();
  });
});

// LS-10041: unlike createLeaguePositionByIdLoader, the teams batch query was
// not wrapped in withPoolTimeoutRetry, so a pool connection timeout under
// concurrent load propagated straight to the resolver. Now wrapped to match
// the LS-8478 pattern.
describe('createTeamsLoader (LS-10041)', () => {
  it('retries and succeeds after a pool connection-timeout error', async () => {
    let call = 0;
    const rows = [{ id: 5, name: 'The Foo' }];
    const { db, calls } = makeMockDb(() => {
      call += 1;
      if (call === 1) {
        throw new Error('timeout exceeded when trying to connect');
      }
      return rows;
    });
    const loader = createTeamsLoader(db);

    await expect(loader.load(5)).resolves.toEqual(rows[0]);
    expect(calls).toHaveLength(2);
  });

  it('does not retry and rejects on a non-pool-timeout error', async () => {
    const dbErr = new Error('syntax error at or near "SELECT"');
    const { db, calls } = makeMockDb(() => {
      throw dbErr;
    });
    const loader = createTeamsLoader(db);

    await expect(loader.load(5)).rejects.toThrow(
      'syntax error at or near "SELECT"',
    );
    expect(calls).toHaveLength(1);
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

/**
 * LS-9474: this loader read only `player_eligible_positions`, which holds zero
 * football rows, so every football player resolved to `[]`. `usePlayerData`
 * falls back to `'UTIL'` on an empty list, so the draft board labelled every
 * football player UTIL — on real leagues and mock drafts alike.
 */
describe('createEligiblePositionsLoader — multi-sport (LS-9474)', () => {
  beforeEach(() => clearEligiblePositionsCache());

  /** The mocked PublicSchema entries are objects, so identify the relation by
   *  one of its column markers rather than by reference. */
  const tableOf = (t: unknown): string =>
    (t as { playerId?: string })?.playerId?.split('.')[0] ?? 'unknown';

  it('resolves football positions from the football relation', async () => {
    const { db, calls } = makeMockDb((state) =>
      tableOf(state.table) === 'fpep' ? [{ playerId: 42, position: 'QB' }] : [],
    );
    const loader = createEligiblePositionsLoader(db);

    await expect(loader.load(42)).resolves.toEqual(['QB']);
    // Both relations are consulted; a player belongs to exactly one sport, so
    // the two result sets are disjoint and merge without conflict.
    expect(calls.map((c) => tableOf(c.table)).sort()).toEqual(['fpep', 'pep']);
  });

  it('still resolves baseball positions, ordered by games played', async () => {
    const { db } = makeMockDb((state) =>
      tableOf(state.table) === 'pep'
        ? [
            { playerId: 7, position: 'LF', games: 20 },
            { playerId: 7, position: 'SS', games: 140 },
          ]
        : [],
    );
    const loader = createEligiblePositionsLoader(db);

    await expect(loader.load(7)).resolves.toEqual(['SS', 'LF']);
  });

  it('returns an empty list when neither relation has the player', async () => {
    const { db } = makeMockDb(() => []);
    const loader = createEligiblePositionsLoader(db);

    await expect(loader.load(999)).resolves.toEqual([]);
  });
});

describe('createPlayerClubLoader (LS-9832)', () => {
  beforeEach(() => clearPlayerClubCache());

  /** Mocked PublicSchema entries are plain objects — identify the relation by
   *  the table prefix on one of its column markers. */
  const relationOf = (t: unknown): string =>
    (t as { playerId?: string; id?: string })?.playerId?.split('.')[0] ??
    (t as { id?: string })?.id?.split('.')[0] ??
    'unknown';

  it('picks the club with the most games played', async () => {
    const { db } = makeMockDb((state) =>
      relationOf(state.table) === 'sb'
        ? [
            { playerId: 1, team: 'BOS', games: 391, lastSeason: 1919 },
            { playerId: 1, team: 'NYY', games: 2084, lastSeason: 1934 },
          ]
        : [],
    );

    await expect(createPlayerClubLoader(db).load(1)).resolves.toBe('NYY');
  });

  it('sums batting and pitching games for the same club', async () => {
    // A two-way player: neither table alone outranks the other club, but the
    // combined total does. Summing per club is what makes BOS win here.
    const { db } = makeMockDb((state) => {
      const rel = relationOf(state.table);
      if (rel === 'sb') {
        return [
          { playerId: 2, team: 'BOS', games: 60, lastSeason: 1918 },
          { playerId: 2, team: 'NYY', games: 90, lastSeason: 1920 },
        ];
      }
      if (rel === 'sp') {
        return [{ playerId: 2, team: 'BOS', games: 70, lastSeason: 1918 }];
      }
      return [];
    });

    await expect(createPlayerClubLoader(db).load(2)).resolves.toBe('BOS');
  });

  it('breaks a games tie on the most recent season', async () => {
    const { db } = makeMockDb((state) =>
      relationOf(state.table) === 'sb'
        ? [
            { playerId: 3, team: 'BRO', games: 100, lastSeason: 1950 },
            { playerId: 3, team: 'NYG', games: 100, lastSeason: 1955 },
          ]
        : [],
    );

    await expect(createPlayerClubLoader(db).load(3)).resolves.toBe('NYG');
  });

  it('returns a defunct franchise code, which players.mlb_team cannot hold', async () => {
    // The FK on players.mlb_team only admits the 30 current franchises, so
    // 'BRO' is exactly the case that column could not represent.
    const { db } = makeMockDb((state) =>
      relationOf(state.table) === 'sb'
        ? [{ playerId: 4, team: 'BRO', games: 1382, lastSeason: 1956 }]
        : [],
    );

    await expect(createPlayerClubLoader(db).load(4)).resolves.toBe('BRO');
  });

  it('falls back to the football club when there are no baseball seasons', async () => {
    const { db } = makeMockDb((state) =>
      relationOf(state.table) === 'players' ? [{ id: 5, nflTeam: 'GB' }] : [],
    );

    await expect(createPlayerClubLoader(db).load(5)).resolves.toBe('GB');
  });

  it('returns null rather than a fabricated code when nothing is on file', async () => {
    const { db } = makeMockDb(() => []);

    await expect(createPlayerClubLoader(db).load(999)).resolves.toBeNull();
  });

  it('batches every requested player into one query per relation', async () => {
    const { db, calls } = makeMockDb((state) =>
      relationOf(state.table) === 'sb'
        ? [
            { playerId: 10, team: 'STL', games: 10, lastSeason: 1960 },
            { playerId: 11, team: 'PIT', games: 20, lastSeason: 1965 },
          ]
        : [],
    );
    const loader = createPlayerClubLoader(db);

    await expect(
      Promise.all([loader.load(10), loader.load(11)]),
    ).resolves.toEqual(['STL', 'PIT']);
    // Three relations consulted, one query each — not one per player.
    expect(calls).toHaveLength(3);
  });
});

// LS-10039: unlike createLeaguePositionByIdLoader, this loader's three-way
// batch query was not wrapped in withPoolTimeoutRetry, so a pool connection
// timeout during a concurrent draft-picks page (one of the DataLoader batch
// loaders in the LS-10037 cluster) propagated straight to the resolver
// instead of retrying. Now wrapped to match the LS-8478 pattern.
describe('createPlayerClubLoader — pool timeout retry (LS-10039)', () => {
  beforeEach(() => clearPlayerClubCache());

  it('retries and succeeds after a pool connection-timeout error', async () => {
    let call = 0;
    const { db, calls } = makeMockDb((state) => {
      call += 1;
      if (call === 1) {
        throw new Error('timeout exceeded when trying to connect');
      }
      return (state.table as { playerId?: string })?.playerId?.startsWith('sb')
        ? [{ playerId: 6, team: 'CHC', games: 10, lastSeason: 1970 }]
        : [];
    });

    await expect(createPlayerClubLoader(db).load(6)).resolves.toBe('CHC');
    expect(calls).toHaveLength(4); // 1 failed attempt + 3 relations on retry
  });

  it('does not retry and rejects on a non-pool-timeout error', async () => {
    const dbErr = new Error('syntax error at or near "SELECT"');
    const { db, calls } = makeMockDb(() => {
      throw dbErr;
    });

    await expect(createPlayerClubLoader(db).load(7)).rejects.toThrow(
      'syntax error at or near "SELECT"',
    );
    expect(calls).toHaveLength(1);
  });
});

/**
 * Unit tests for createLockedTeamMembersLoader (LS-5955).
 *
 * Verifies the three-step batching logic:
 *  1. league row fetch (currentWeek / currentMatchup)
 *  2. legacy matchup FK fallback (only when currentWeek is null)
 *  3. single locked-players query across all active leagues
 */

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    leagues: {
      id: 'leagues.id',
      currentWeek: 'leagues.currentWeek',
      currentMatchup: 'leagues.currentMatchup',
    },
    matchups: {
      id: 'matchups.id',
      weekNumber: 'matchups.weekNumber',
      leagueId: 'matchups.leagueId',
      team1Id: 'matchups.team1Id',
      team2Id: 'matchups.team2Id',
    },
    matchupPlayers: {
      id: 'matchupPlayers.id',
      matchupId: 'matchupPlayers.matchupId',
      teamId: 'matchupPlayers.teamId',
      playerId: 'matchupPlayers.playerId',
    },
    matchupPlayerGames: {
      matchupPlayerId: 'matchupPlayerGames.matchupPlayerId',
    },
  },
}));

import {
  createLockedTeamMembersLoader,
  createMatchupPlayerGamesLoader,
} from './matchup-loaders';

type QueryResult = Record<string, unknown>[];

/**
 * Builds a minimal Drizzle-like mock db.
 * Calls to select/selectDistinct are resolved by calling `resolver` in order.
 */
function makeMockDb(resolvers: Array<() => QueryResult>) {
  let callIndex = 0;
  const queryCalls: string[] = [];

  const buildChain = (method: string) => {
    const chain: Record<string, unknown> = {};

    const finalize = () => {
      const idx = callIndex++;
      queryCalls.push(method);
      const resolver = resolvers[idx];
      return Promise.resolve(resolver ? resolver() : []);
    };

    chain.from = () => chain;
    chain.innerJoin = () => chain;
    chain.where = () => ({
      ...chain,
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => finalize().then(onFulfilled, onRejected),
    });

    return chain;
  };

  return {
    db: {
      select: () => buildChain('select'),
      selectDistinct: () => buildChain('selectDistinct'),
    } as unknown as Parameters<typeof createLockedTeamMembersLoader>[0],
    queryCalls,
  };
}

describe('createLockedTeamMembersLoader (LS-5955)', () => {
  it('returns a set of locked playerId:teamId keys for a league with currentWeek', async () => {
    const { db } = makeMockDb([
      // Step 1: league rows
      () => [{ id: 1, currentWeek: 3, currentMatchup: null }],
      // Step 2: no legacy matchup lookup needed (currentWeek is set)
      // Step 3: locked player rows
      () => [{ leagueId: 1, playerId: 42, teamId: 7 }],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const result = await loader.load(1);

    expect(result).toBeInstanceOf(Set);
    expect(result.has('42:7')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('falls back to legacy currentMatchup FK when currentWeek is null', async () => {
    const { db, queryCalls } = makeMockDb([
      // Step 1: league row with null currentWeek
      () => [{ id: 2, currentWeek: null, currentMatchup: 99 }],
      // Step 2: resolve weekNumber from matchup
      () => [{ id: 99, weekNumber: 5 }],
      // Step 3: locked players
      () => [{ leagueId: 2, playerId: 10, teamId: 3 }],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const result = await loader.load(2);

    expect(queryCalls).toHaveLength(3);
    expect(result.has('10:3')).toBe(true);
  });

  it('returns an empty set when no players are locked', async () => {
    const { db } = makeMockDb([
      () => [{ id: 5, currentWeek: 1, currentMatchup: null }],
      () => [],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const result = await loader.load(5);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns an empty set when league has no active week', async () => {
    const { db } = makeMockDb([
      // currentWeek null, currentMatchup null → no active week
      () => [{ id: 6, currentWeek: null, currentMatchup: null }],
      // Step 3 should not be called, but resolver list is empty anyway
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const result = await loader.load(6);

    expect(result.size).toBe(0);
  });

  it('batches multiple leagueIds into a single set of queries', async () => {
    const { db, queryCalls } = makeMockDb([
      // Step 1: two leagues in one query
      () => [
        { id: 10, currentWeek: 2, currentMatchup: null },
        { id: 11, currentWeek: 4, currentMatchup: null },
      ],
      // Step 3: locked players for both leagues
      () => [
        { leagueId: 10, playerId: 1, teamId: 100 },
        { leagueId: 11, playerId: 2, teamId: 200 },
      ],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const [r10, r11] = await Promise.all([loader.load(10), loader.load(11)]);

    // Only 2 queries (step 2 skipped — both leagues have currentWeek)
    expect(queryCalls).toHaveLength(2);
    expect(r10.has('1:100')).toBe(true);
    expect(r11.has('2:200')).toBe(true);
  });
});

describe('createMatchupPlayerGamesLoader (LS-8477)', () => {
  it('retries once on a transient pg-pool connection timeout, then succeeds', async () => {
    const games = [{ id: 1, matchupPlayerId: 42, gameNum: 1 }];
    let attempt = 0;
    const where = jest.fn(() => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.reject(
          new Error('timeout exceeded when trying to connect'),
        );
      }
      return Promise.resolve(games);
    });
    const db = {
      select: () => ({
        from: () => ({ where }),
      }),
    } as unknown as Parameters<typeof createMatchupPlayerGamesLoader>[0];

    const loader = createMatchupPlayerGamesLoader(db);
    const result = await loader.load(42);

    expect(where).toHaveBeenCalledTimes(2);
    expect(result).toEqual(games);
  });
});

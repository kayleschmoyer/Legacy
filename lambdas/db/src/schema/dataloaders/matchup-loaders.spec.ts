/**
 * Unit tests for createLockedTeamMembersLoader (LS-5955).
 *
 * Verifies the four-step batching logic:
 *  1. league row fetch (currentWeek / currentMatchup)
 *  2. legacy matchup FK fallback (only when currentWeek is null)
 *  3. started-matchups query across all active leagues
 *  4. roster members of the locked teams from step 3
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
      status: 'matchups.status',
    },
    teamMembers: {
      teamId: 'teamMembers.teamId',
      playerId: 'teamMembers.playerId',
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
      // Step 3a: started matchups (status !== 'scheduled')
      () => [{ leagueId: 1, team1Id: 7, team2Id: null }],
      // Step 3b: roster members of the locked teams
      () => [{ teamId: 7, playerId: 42 }],
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
      // Step 3a: started matchups
      () => [{ leagueId: 2, team1Id: 3, team2Id: null }],
      // Step 3b: roster members
      () => [{ teamId: 3, playerId: 10 }],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const result = await loader.load(2);

    expect(queryCalls).toHaveLength(4);
    expect(result.has('10:3')).toBe(true);
  });

  it('returns an empty set when no matchups have started', async () => {
    const { db, queryCalls } = makeMockDb([
      () => [{ id: 5, currentWeek: 1, currentMatchup: null }],
      // Step 3a: no started matchups — step 3b is skipped entirely
      () => [],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const result = await loader.load(5);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(queryCalls).toHaveLength(2);
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
      // Step 3a: started matchups for both leagues
      () => [
        { leagueId: 10, team1Id: 100, team2Id: null },
        { leagueId: 11, team1Id: 200, team2Id: null },
      ],
      // Step 3b: roster members of both locked teams
      () => [
        { teamId: 100, playerId: 1 },
        { teamId: 200, playerId: 2 },
      ],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const [r10, r11] = await Promise.all([loader.load(10), loader.load(11)]);

    // 3 queries (step 2 skipped — both leagues have currentWeek)
    expect(queryCalls).toHaveLength(3);
    expect(r10.has('1:100')).toBe(true);
    expect(r11.has('2:200')).toBe(true);
  });

  it('locks every roster member of a started matchup team, even those with no stats rows yet (LS-9405)', async () => {
    // Regression: previously this loader locked only players with an
    // existing `matchupPlayerGames` row, so a matchup that had just flipped
    // to `in_progress` (but had not yet had stats ingested) reported every
    // player as unlocked, letting the client allow a swap the mutation-time
    // `checkPlayersNotLocked` check then rejected.
    const { db } = makeMockDb([
      () => [{ id: 1, currentWeek: 3, currentMatchup: null }],
      // Matchup has started for team 7, but no stats/game rows exist yet.
      () => [{ leagueId: 1, team1Id: 7, team2Id: 8 }],
      // Both teams' full rosters come back locked regardless of stats.
      () => [
        { teamId: 7, playerId: 42 },
        { teamId: 7, playerId: 43 },
        { teamId: 8, playerId: 99 },
      ],
    ]);

    const loader = createLockedTeamMembersLoader(db);
    const result = await loader.load(1);

    expect(result.has('42:7')).toBe(true);
    expect(result.has('43:7')).toBe(true);
    expect(result.has('99:8')).toBe(true);
    expect(result.size).toBe(3);
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

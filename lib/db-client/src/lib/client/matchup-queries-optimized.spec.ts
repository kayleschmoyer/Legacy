/**
 * Unit tests for the LS-6367 / LS-9517 fix: matchup completion must be
 * gated on the least-resolved rostered player, not a matchup-wide DISTINCT
 * game_num count. LS-6367 fixed the batch path (getSelectedGamesCountBatch);
 * LS-9517 fixed the same bug pattern in the singular getSelectedGamesCount.
 */

import {
  getSelectedGamesCount,
  getSelectedGamesCountBatch,
  minResolvedCountPerMatchup,
} from './matchup-queries-optimized';

/**
 * Extracts the literal SQL text a drizzle `sql` template produced, so a test
 * can assert on the generated CASE WHEN without hitting a real database.
 * Column-reference chunks are rendered by their column name.
 */
function renderSqlChunks(sqlObj: {
  queryChunks: Array<{ value?: unknown[]; name?: string }>;
}): string {
  return sqlObj.queryChunks
    .map((chunk) =>
      Array.isArray(chunk.value) ? chunk.value.join('') : (chunk.name ?? ''),
    )
    .join('');
}

interface ResolvedCountRow {
  matchupId: number;
  matchupPlayerId: number;
  count: number;
}

interface MockDbChain {
  select: jest.Mock<MockDbChain, [Record<string, unknown>]>;
  from: jest.Mock<MockDbChain, [unknown]>;
  leftJoin: jest.Mock<MockDbChain, [unknown]>;
  where: jest.Mock<MockDbChain, [unknown]>;
  groupBy: jest.Mock<Promise<ResolvedCountRow[]>, [unknown]>;
}

function createMockDbChain(
  finalResult: ResolvedCountRow[],
  onSelect?: (fields: Record<string, unknown>) => void,
): MockDbChain {
  const chain = {} as MockDbChain;

  chain.select = jest.fn((fields: Record<string, unknown>) => {
    onSelect?.(fields);
    return chain;
  });
  chain.from = jest.fn(() => chain);
  chain.leftJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.groupBy = jest.fn(() => Promise.resolve(finalResult));

  return chain;
}

describe('minResolvedCountPerMatchup', () => {
  it("takes the minimum resolved count across a matchup's players", () => {
    // Matchup 1: player A has all 5 slots resolved (e.g. early-window Sunday
    // players), player B is missing slot 5 (e.g. a postponed/rescheduled MNF
    // game still pending). The matchup must report 4, not 5 — a matchup-wide
    // DISTINCT game_num count would incorrectly report 5 here because player
    // A's resolved slot 5 alone would satisfy the distinct check.
    const rows = [
      { matchupId: 1, matchupPlayerId: 101, count: 5 },
      { matchupId: 1, matchupPlayerId: 102, count: 4 },
    ];

    const result = minResolvedCountPerMatchup([1], rows);

    expect(result.get(1)).toBe(4);
  });

  it('reports 0 for a matchup with no resolved-game rows', () => {
    const result = minResolvedCountPerMatchup([2], []);

    expect(result.get(2)).toBe(0);
  });

  it('reports the shared count when every player is fully resolved', () => {
    const rows = [
      { matchupId: 3, matchupPlayerId: 201, count: 5 },
      { matchupId: 3, matchupPlayerId: 202, count: 5 },
      { matchupId: 3, matchupPlayerId: 203, count: 5 },
    ];

    const result = minResolvedCountPerMatchup([3], rows);

    expect(result.get(3)).toBe(5);
  });

  it('handles multiple matchups independently', () => {
    const rows = [
      { matchupId: 1, matchupPlayerId: 101, count: 5 },
      { matchupId: 1, matchupPlayerId: 102, count: 3 },
      { matchupId: 2, matchupPlayerId: 201, count: 5 },
      { matchupId: 2, matchupPlayerId: 202, count: 5 },
    ];

    const result = minResolvedCountPerMatchup([1, 2], rows);

    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(5);
  });

  it('accepts a numeric string count (raw SQL COUNT() result shape)', () => {
    const rows = [{ matchupId: 1, matchupPlayerId: 101, count: '2' }];

    const result = minResolvedCountPerMatchup([1], rows);

    expect(result.get(1)).toBe(2);
  });
});

describe('getSelectedGamesCount', () => {
  it('returns the minimum per-player resolved count for a partially-resolved matchup', async () => {
    // Player 101 has 5 resolved slots, player 102 (e.g. a still-pending
    // game) only has 4 — the matchup-wide DISTINCT game_num count would
    // report 5, but the correct answer is 4: the matchup isn't done until
    // its least-resolved player is.
    const db = createMockDbChain([
      { matchupId: 7, matchupPlayerId: 101, count: 5 },
      { matchupId: 7, matchupPlayerId: 102, count: 4 },
    ]);

    const result = await getSelectedGamesCount(db, 7);

    expect(result).toBe(4);
  });

  it('returns 0 for a matchup with no rostered players resolved', async () => {
    const db = createMockDbChain([]);

    const result = await getSelectedGamesCount(db, 8);

    expect(result).toBe(0);
  });

  it('returns the shared count when every rostered player is fully resolved', async () => {
    const db = createMockDbChain([
      { matchupId: 9, matchupPlayerId: 301, count: 5 },
      { matchupId: 9, matchupPlayerId: 302, count: 5 },
    ]);

    const result = await getSelectedGamesCount(db, 9);

    expect(result).toBe(5);
  });

  // LS-9925: a matchupPlayerGames row can be terminally marked
  // noGameDataFound (no per-game box scores available for that
  // player/season — LS-9122) instead of getting a real gameIdentifier. The
  // resolved-slot CASE WHEN must treat that as resolved too, or a single
  // such player permanently caps the whole matchup's count below
  // gamesPerMatchup — autoSelectGames then keeps recomputing the same
  // "next" game number forever instead of advancing.
  it('includes no_game_data_found in the resolved-slot CASE WHEN', async () => {
    let capturedFields: Record<string, unknown> | undefined;
    const db = createMockDbChain([], (fields) => {
      capturedFields = fields;
    });

    await getSelectedGamesCount(db, 10);

    const rendered = renderSqlChunks(
      capturedFields?.count as Parameters<typeof renderSqlChunks>[0],
    );
    expect(rendered).toContain('no_game_data_found');
  });
});

describe('getSelectedGamesCountBatch', () => {
  // LS-9925: same CASE WHEN gap as getSelectedGamesCount, in the batch path.
  it('includes no_game_data_found in the resolved-slot CASE WHEN', async () => {
    let capturedFields: Record<string, unknown> | undefined;
    const db = createMockDbChain([], (fields) => {
      capturedFields = fields;
    });

    await getSelectedGamesCountBatch(db, [10, 11]);

    const rendered = renderSqlChunks(
      capturedFields?.count as Parameters<typeof renderSqlChunks>[0],
    );
    expect(rendered).toContain('no_game_data_found');
  });

  it('returns an empty map for an empty matchupIds array without querying', async () => {
    const db = createMockDbChain([]);

    const result = await getSelectedGamesCountBatch(db, []);

    expect(result.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});

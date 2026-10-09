/**
 * Tests for game-state-manager.ts — specifically that a season with no
 * scraped per-game box scores is flagged as `noGameDataFound`, not
 * `pitcherStartSkipped` (LS-9122). Conflating the two caused hitters with
 * a data-availability gap to be mislabeled as having real off days,
 * inflating the "off days" count shown on the matchup page.
 *
 * LS-10234 extends this to the inverse direction: the no-data branch must
 * not stamp `noGameDataFound` onto `pitcherStartSkipped` rows, and a later
 * run that does find real game data must clear any flag a previous run
 * already left on them.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const gameBatting = {
  gameIdentifier: 'gb.id',
  playerId: 'gb.playerId',
  season: 'gb.season',
};
const gamePitching = {
  gameIdentifier: 'gp.id',
  playerId: 'gp.playerId',
  season: 'gp.season',
};
const gameFootballDefense = {
  gameIdentifier: 'gfd.id',
  playerId: 'gfd.playerId',
  season: 'gfd.season',
};
const gameFootballDefenseIdp = {
  gameIdentifier: 'gfdi.id',
  playerId: 'gfdi.playerId',
  season: 'gfdi.season',
};
const gameFootballPassing = {
  gameIdentifier: 'gfp.id',
  playerId: 'gfp.playerId',
  season: 'gfp.season',
};
const gameFootballRushing = {
  gameIdentifier: 'gfr.id',
  playerId: 'gfr.playerId',
  season: 'gfr.season',
};
const gameFootballReceiving = {
  gameIdentifier: 'gfrec.id',
  playerId: 'gfrec.playerId',
  season: 'gfrec.season',
};
const gameFootballKicking = {
  gameIdentifier: 'gfk.id',
  playerId: 'gfk.playerId',
  season: 'gfk.season',
};
const matchupPlayerGames = {
  id: 'mpg.id',
  matchupPlayerId: 'mpg.matchupPlayerId',
  gameIdentifier: 'mpg.gameIdentifier',
  pitcherStartSkipped: 'mpg.pitcherStartSkipped',
  noGameDataFound: 'mpg.noGameDataFound',
};
const matchupPlayers = {
  id: 'mp.id',
  matchupId: 'mp.matchupId',
};
const matchups = {
  id: 'm.id',
  gamesPerMatchup: 'm.gamesPerMatchup',
};

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    minResolvedCountPerMatchup: (
      matchupIds: number[],
      rows: { matchupId: number; count: number | string }[],
    ) => {
      const minByMatchup = new Map<number, number>();
      for (const row of rows) {
        const rowCount = Number(row.count);
        const current = minByMatchup.get(row.matchupId);
        minByMatchup.set(
          row.matchupId,
          current === undefined ? rowCount : Math.min(current, rowCount),
        );
      }
      const result = new Map<number, number>();
      for (const id of matchupIds) {
        result.set(id, minByMatchup.get(id) ?? 0);
      }
      return result;
    },
    PublicSchema: {
      gameBatting,
      gamePitching,
      gameFootballDefense,
      gameFootballDefenseIdp,
      gameFootballPassing,
      gameFootballRushing,
      gameFootballReceiving,
      gameFootballKicking,
      matchupPlayerGames,
      matchupPlayers,
      matchups,
    },
  }),
);

import {
  checkMatchupCompletion,
  selectAndAssignFootballGameIdentifiers,
  selectAndAssignGameIdentifiers,
} from './game-state-manager';

type TableResults = Map<unknown, Array<{ gameIdentifier: string | null }>>;

/**
 * Flatten a drizzle SQL predicate into readable text. The schema stubs above
 * are plain strings, so drizzle appends them to `queryChunks` verbatim and a
 * recursive walk renders e.g. `(mpg.matchupPlayerId = 42 and ...)`. Used to
 * assert on UPDATE WHERE clauses, which is the only place the
 * noGameDataFound/pitcherStartSkipped mutual exclusion is observable.
 */
function renderSql(chunk: unknown): string {
  if (chunk == null) return '';
  if (typeof chunk === 'string') return chunk;
  // Bound values are appended to queryChunks unwrapped, so a predicate's
  // right-hand side arrives as a raw number or boolean (e.g. 42, false).
  if (typeof chunk === 'number' || typeof chunk === 'boolean')
    return String(chunk);
  if (typeof chunk !== 'object') return '';
  const node = chunk as { value?: unknown; queryChunks?: unknown[] };
  if (Array.isArray(node.value)) return node.value.join('');
  if (Array.isArray(node.queryChunks))
    return node.queryChunks.map(renderSql).join('');
  return '';
}

/**
 * @param resultsByTable per-stat-table `selectDistinct` results
 * @param selectResults  `select()` results consumed in call order — the
 *                       production code issues them as: unassigned slots,
 *                       then already-used game identifiers
 */
function createMockDb(
  resultsByTable: TableResults,
  selectResults: Array<Array<Record<string, unknown>>> = [],
) {
  const updateSetCalls: Array<Record<string, unknown>> = [];
  const updateWhereCalls: unknown[] = [];
  let selectCallCount = 0;

  const db = {
    selectDistinct: jest.fn(() => ({
      from: jest.fn((table: unknown) => ({
        where: jest.fn(() => Promise.resolve(resultsByTable.get(table) ?? [])),
      })),
    })),
    select: jest.fn(() => {
      const result = selectResults[selectCallCount] ?? [];
      selectCallCount++;
      return {
        from: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve(result)),
        })),
      };
    }),
    update: jest.fn(() => ({
      set: jest.fn((values: Record<string, unknown>) => {
        updateSetCalls.push(values);
        return {
          where: jest.fn((condition: unknown) => {
            updateWhereCalls.push(condition);
            return Promise.resolve(undefined);
          }),
        };
      }),
    })),
  };

  return { db, updateSetCalls, updateWhereCalls };
}

describe('selectAndAssignGameIdentifiers', () => {
  it('marks unassigned slots as noGameDataFound, not pitcherStartSkipped, when no per-game rows exist for the season', async () => {
    const { db, updateSetCalls } = createMockDb(
      new Map([
        [gameBatting, []],
        [gamePitching, []],
      ]),
    );

    await selectAndAssignGameIdentifiers(db as never, 42, 2836, 1890);

    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toEqual({
      noGameDataFound: true,
      statsLoadingStatus: 'completed',
    });
    expect(updateSetCalls[0]).not.toHaveProperty('pitcherStartSkipped');
  });

  // LS-10234: noGameDataFound and pitcherStartSkipped are mutually exclusive
  // by design (LS-9122), but the no-data branch bulk-flagged every row with a
  // null gameIdentifier — SP-skipped placeholders included — and nothing ever
  // cleared it again. The matchup view checks noGameDataFound first, so an
  // affected player rendered "Stats unavailable" instead of "N off days" even
  // after real games were assigned and scored.
  it('excludes pitcherStartSkipped rows from the no-data bulk flag', async () => {
    const { db, updateWhereCalls } = createMockDb(
      new Map([
        [gameBatting, []],
        [gamePitching, []],
      ]),
    );

    await selectAndAssignGameIdentifiers(db as never, 42, 2836, 1890);

    // Negative control: on the unfixed code this WHERE has no
    // pitcherStartSkipped term, so the assertion below fails.
    expect(updateWhereCalls).toHaveLength(1);
    expect(renderSql(updateWhereCalls[0])).toBe(
      '(mpg.matchupPlayerId = 42 and mpg.gameIdentifier is null and mpg.pitcherStartSkipped = false)',
    );
  });

  it('clears stale noGameDataFound on SP-skipped rows once real game data exists, even when there is nothing left to assign', async () => {
    const { db, updateSetCalls, updateWhereCalls } = createMockDb(
      new Map([[gameBatting, [{ gameIdentifier: 'BLN189706120' }]]]),
      // No unassigned non-skipped slots — the state of the reported row
      // (matchup_player 3793673), whose real slots were already filled.
      [[]],
    );

    await selectAndAssignGameIdentifiers(db as never, 42, 2836, 1897);

    // Negative control: the unfixed code issues no UPDATE at all here.
    expect(updateSetCalls).toEqual([{ noGameDataFound: false }]);
    expect(renderSql(updateWhereCalls[0])).toBe(
      '(mpg.matchupPlayerId = 42 and mpg.pitcherStartSkipped = true and mpg.noGameDataFound = true)',
    );
  });

  it('heals stale SP-skipped rows before assigning the remaining slots', async () => {
    const { db, updateSetCalls } = createMockDb(
      new Map([[gameBatting, [{ gameIdentifier: 'CHN189705312' }]]]),
      // One unassigned non-skipped slot, then the already-used lookup.
      [[{ id: 7 }], []],
    );

    await selectAndAssignGameIdentifiers(db as never, 42, 2836, 1897);

    expect(updateSetCalls).toEqual([
      { noGameDataFound: false },
      { gameIdentifier: 'CHN189705312', noGameDataFound: false },
    ]);
  });
});

describe('selectAndAssignFootballGameIdentifiers', () => {
  it('marks unassigned slots as noGameDataFound, not pitcherStartSkipped, when no per-game rows exist for the season', async () => {
    const { db, updateSetCalls } = createMockDb(
      new Map([
        [gameFootballPassing, []],
        [gameFootballRushing, []],
        [gameFootballReceiving, []],
        [gameFootballKicking, []],
      ]),
    );

    await selectAndAssignFootballGameIdentifiers(
      db as never,
      42,
      991,
      2025,
      false,
      'WR',
    );

    expect(updateSetCalls).toHaveLength(1);
    expect(updateSetCalls[0]).toEqual({
      noGameDataFound: true,
      statsLoadingStatus: 'completed',
    });
    expect(updateSetCalls[0]).not.toHaveProperty('pitcherStartSkipped');
  });

  // LS-10238: football sibling of the LS-10234 fix.
  it('excludes pitcherStartSkipped rows from the no-data bulk flag', async () => {
    const { db, updateWhereCalls } = createMockDb(
      new Map([
        [gameFootballPassing, []],
        [gameFootballRushing, []],
        [gameFootballReceiving, []],
        [gameFootballKicking, []],
      ]),
    );

    await selectAndAssignFootballGameIdentifiers(
      db as never,
      42,
      991,
      2025,
      false,
      'WR',
    );

    // Negative control: on the unfixed code this WHERE has no
    // pitcherStartSkipped term, so the assertion below fails.
    expect(updateWhereCalls).toHaveLength(1);
    expect(renderSql(updateWhereCalls[0])).toBe(
      '(mpg.matchupPlayerId = 42 and mpg.gameIdentifier is null and mpg.pitcherStartSkipped = false)',
    );
  });

  it('clears stale noGameDataFound on SP-skipped rows once real game data exists, even when there is nothing left to assign', async () => {
    const { db, updateSetCalls, updateWhereCalls } = createMockDb(
      new Map([[gameFootballPassing, [{ gameIdentifier: 'NFL2025W01' }]]]),
      [[]],
    );

    await selectAndAssignFootballGameIdentifiers(
      db as never,
      42,
      991,
      2025,
      false,
      'QB',
    );

    // Negative control: the unfixed code issues no UPDATE at all here.
    expect(updateSetCalls).toEqual([{ noGameDataFound: false }]);
    expect(renderSql(updateWhereCalls[0])).toBe(
      '(mpg.matchupPlayerId = 42 and mpg.pitcherStartSkipped = true and mpg.noGameDataFound = true)',
    );
  });

  it('heals stale SP-skipped rows before assigning the remaining slots', async () => {
    const { db, updateSetCalls } = createMockDb(
      new Map([[gameFootballPassing, [{ gameIdentifier: 'NFL2025W02' }]]]),
      [[{ id: 7 }], []],
    );

    await selectAndAssignFootballGameIdentifiers(
      db as never,
      42,
      991,
      2025,
      false,
      'QB',
    );

    expect(updateSetCalls).toEqual([
      { noGameDataFound: false },
      { gameIdentifier: 'NFL2025W02', noGameDataFound: false },
    ]);
  });
});

describe('checkMatchupCompletion', () => {
  // LS-9517: checkMatchupCompletion must be gated on the least-resolved
  // rostered player, not a matchup-wide DISTINCT game_num count — the same
  // premature-completion bug pattern fixed for getSelectedGamesCountBatch in
  // LS-6367.

  function createCompletionMockDb(
    gamesPerMatchup: number,
    resolvedRows: Array<{
      matchupId: number;
      matchupPlayerId: number;
      count: number;
    }>,
  ) {
    let callCount = 0;
    const db = {
      select: jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First select(): matchups.gamesPerMatchup lookup
          return {
            from: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve([{ gamesPerMatchup }])),
              })),
            })),
          };
        }
        // Second select(): per-player resolved-slot counts
        return {
          from: jest.fn(() => ({
            leftJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                groupBy: jest.fn(() => Promise.resolve(resolvedRows)),
              })),
            })),
          })),
        };
      }),
    };

    return db;
  }

  it('returns in_progress when one rostered player still has an unresolved game slot', async () => {
    const db = createCompletionMockDb(5, [
      { matchupId: 42, matchupPlayerId: 101, count: 5 },
      { matchupId: 42, matchupPlayerId: 102, count: 4 },
    ]);

    const result = await checkMatchupCompletion(db as never, 42);

    expect(result).toBe('in_progress');
  });

  it('returns completed only once every rostered player has all slots resolved', async () => {
    const db = createCompletionMockDb(5, [
      { matchupId: 42, matchupPlayerId: 101, count: 5 },
      { matchupId: 42, matchupPlayerId: 102, count: 5 },
    ]);

    const result = await checkMatchupCompletion(db as never, 42);

    expect(result).toBe('completed');
  });

  // LS-9925: a matchupPlayerGames row can be terminally marked
  // noGameDataFound (no per-game box scores available for that
  // player/season — LS-9122) instead of getting a real gameIdentifier. The
  // resolved-slot CASE WHEN must treat that as resolved too, or a single
  // such player permanently caps the matchup below gamesPerMatchup and it
  // can never reach 'completed'.
  it('includes no_game_data_found in the resolved-slot CASE WHEN', async () => {
    let capturedFields: Record<string, unknown> | undefined;
    let callCount = 0;
    const db = {
      select: jest.fn((fields: Record<string, unknown>) => {
        callCount++;
        if (callCount === 1) {
          return {
            from: jest.fn(() => ({
              where: jest.fn(() => ({
                limit: jest.fn(() => Promise.resolve([{ gamesPerMatchup: 2 }])),
              })),
            })),
          };
        }
        capturedFields = fields;
        return {
          from: jest.fn(() => ({
            leftJoin: jest.fn(() => ({
              where: jest.fn(() => ({
                groupBy: jest.fn(() => Promise.resolve([])),
              })),
            })),
          })),
        };
      }),
    };

    await checkMatchupCompletion(db as never, 42);

    const countSql = capturedFields?.count as {
      queryChunks: Array<{ value?: unknown[] } | string | null | undefined>;
    };
    const rendered = countSql.queryChunks
      .map((chunk) => {
        if (chunk == null) return '';
        if (typeof chunk === 'string') return chunk;
        return Array.isArray(chunk.value) ? chunk.value.join('') : '';
      })
      .join('');
    expect(rendered).toContain('mpg.noGameDataFound');
  });
});

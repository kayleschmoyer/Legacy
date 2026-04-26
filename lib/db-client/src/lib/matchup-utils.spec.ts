/**
 * Unit tests for matchup lineup pipeline utilities (LS-3834).
 *
 * Covers the two DB functions that populate positionId on matchup_players
 * after draft completion — the pipeline that the STARTERS section depends on.
 *
 * autoPopulateFirstMatchupLineup:
 *  - Already-assigned players (non-null positionId) must be skipped so the
 *    LS-3816 regression (double-assignment clobbering correct data) stays fixed.
 *  - Bench players get assigned to the appropriate slot based on eligibility.
 *  - Two teams in one matchup are handled independently.
 *
 * populateMatchupPlayersAndSeasons (smoke test):
 *  - Both teams' players from team_members are inserted into matchup_players.
 */

import {
  autoPopulateFirstMatchupLineup,
  populateMatchupPlayersAndSeasons,
} from './matchup-utils';

// ---------------------------------------------------------------------------
// Types derived from the functions under test
// ---------------------------------------------------------------------------

type MockDb = Parameters<typeof autoPopulateFirstMatchupLineup>[0];
type SmokeDb = Parameters<typeof populateMatchupPlayersAndSeasons>[0];

interface TxUpdate {
  table: unknown;
  setArg: { positionId?: number | null };
}

// ---------------------------------------------------------------------------
// Typed mock chain interfaces — avoids broad eslint-disable blocks
// ---------------------------------------------------------------------------

interface MockSelectChain {
  select: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  inArray: jest.Mock;
  then: jest.Mock;
}

interface MockUpdateChain {
  set: jest.Mock;
  where: jest.Mock;
}

interface MockTx {
  update: jest.Mock;
}

interface MockInsertChain {
  values: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  onConflictDoNothing: jest.Mock;
  then: jest.Mock;
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock Drizzle database where each `select()` call returns the next
 * result from `selectResults` in order, and `transaction()` invokes the
 * callback with a mock tx that tracks update calls.
 *
 * Throws if more `select()` calls are made than results were provided, so
 * tests fail loudly when the query sequence changes unexpectedly.
 */
function buildMockDb(selectResults: unknown[]): {
  db: MockDb;
  selectMock: jest.Mock;
  transactionMock: jest.Mock;
  txUpdateCalls: TxUpdate[];
} {
  const txUpdateCalls: TxUpdate[] = [];

  let selectIndex = 0;
  const makeSelectChain = (): MockSelectChain => {
    if (selectIndex >= selectResults.length) {
      throw new Error(
        `Unexpected select() call #${selectIndex + 1}; only ${selectResults.length} mocked result(s) were provided.`,
      );
    }
    const result = selectResults[selectIndex++];
    const chain: MockSelectChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      inArray: jest.fn().mockReturnThis(),
      // make the chain itself thenable so `await db.select(...).from(...).where(...)` works.
      // Must RETURN resolve(result) — not just call it — so that chained `.then(fn)`
      // calls (e.g. `.then(rows => rows.filter(...))` in Promise.all) receive the
      // filtered array rather than undefined.
      then: jest
        .fn()
        .mockImplementation((resolve: (value: unknown) => unknown) =>
          resolve(result),
        ),
    };
    return chain;
  };

  const makeUpdateChain = (table: unknown): MockUpdateChain => {
    let capturedSet: TxUpdate['setArg'] | null = null;
    const updateChain: MockUpdateChain = {
      set: jest.fn().mockImplementation((arg: TxUpdate['setArg']) => {
        capturedSet = arg;
        txUpdateCalls.push({ table, setArg: capturedSet });
        return updateChain;
      }),
      where: jest.fn().mockResolvedValue(undefined),
    };
    return updateChain;
  };

  const mockTx: MockTx = {
    update: jest
      .fn()
      .mockImplementation((table: unknown) => makeUpdateChain(table)),
  };

  const selectMock = jest.fn().mockImplementation(makeSelectChain);
  const transactionMock = jest
    .fn()
    .mockImplementation(async (callback: (tx: MockTx) => Promise<void>) => {
      await callback(mockTx);
    });

  const mockDb = { select: selectMock, transaction: transactionMock };

  return {
    db: mockDb as unknown as MockDb,
    selectMock,
    transactionMock,
    txUpdateCalls,
  };
}

// ---------------------------------------------------------------------------
// autoPopulateFirstMatchupLineup tests
// ---------------------------------------------------------------------------

describe('autoPopulateFirstMatchupLineup', () => {
  it('returns 0 assignments when matchupIds array is empty', async () => {
    const { db, selectMock } = buildMockDb([]);
    const result = await autoPopulateFirstMatchupLineup(db, 1, []);
    expect(result.assignedCount).toBe(0);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns 0 when no league positions exist', async () => {
    const { db } = buildMockDb([
      [], // leaguePositions → empty
    ]);
    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);
    expect(result.assignedCount).toBe(0);
  });

  it('returns 0 when no matchup_players exist', async () => {
    const { db } = buildMockDb([
      [{ id: 1, positionType: '1B' }], // leaguePositions
      [], // mpRows → empty
    ]);
    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);
    expect(result.assignedCount).toBe(0);
  });

  it('assigns bench players to matching slots based on eligibility', async () => {
    // Arrange: two slots (1B, OF), two bench players for one team
    const { db, txUpdateCalls } = buildMockDb([
      [
        { id: 1, positionType: '1B' },
        { id: 2, positionType: 'OF' },
      ],
      [
        // matchup_players — both on bench (positionId null)
        { id: 101, matchupId: 10, playerId: 1001, teamId: 5, positionId: null },
        { id: 102, matchupId: 10, playerId: 1002, teamId: 5, positionId: null },
      ],
      [
        // player eligible positions
        { playerId: 1001, position: '1B' },
        { playerId: 1002, position: 'OF' },
      ],
    ]);

    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);

    expect(result.assignedCount).toBe(2);
    // Each assignment produces one matchup_players update + one team_members mirror
    expect(txUpdateCalls.length).toBe(4);
    // All updates set a non-null positionId
    expect(txUpdateCalls.every((u) => u.setArg.positionId != null)).toBe(true);
  });

  it('skips players already assigned — LS-3816 regression', async () => {
    // Player 1001 already has positionId = 1 (1B slot); player 1002 is on bench.
    // autoPopulateFirstMatchupLineup should only assign 1002, not touch 1001.
    const { db, txUpdateCalls } = buildMockDb([
      [
        { id: 1, positionType: '1B' },
        { id: 2, positionType: 'OF' },
      ],
      [
        { id: 101, matchupId: 10, playerId: 1001, teamId: 5, positionId: 1 }, // already assigned
        { id: 102, matchupId: 10, playerId: 1002, teamId: 5, positionId: null }, // bench
      ],
      [
        { playerId: 1001, position: '1B' },
        { playerId: 1002, position: 'OF' },
      ],
    ]);

    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);

    // Only player 1002 should be assigned
    expect(result.assignedCount).toBe(1);
    // 1 matchup_players update + 1 team_members mirror (player 1001 was pre-assigned, not touched)
    expect(txUpdateCalls.length).toBe(2);
    // The assigned positionId should be 2 (OF slot), not 1 (already occupied 1B)
    const positionIds = txUpdateCalls
      .map((c) => c.setArg.positionId)
      .filter((id): id is number => id != null);
    expect(positionIds).toContain(2);
    expect(positionIds).not.toContain(1);
  });

  it('skips a slot that is already occupied — no double-filling', async () => {
    // Both players eligible for 1B but only one slot available.
    // Second player should NOT also be assigned to 1B.
    const { db, txUpdateCalls } = buildMockDb([
      [{ id: 1, positionType: '1B' }], // only one slot
      [
        { id: 101, matchupId: 10, playerId: 1001, teamId: 5, positionId: null },
        { id: 102, matchupId: 10, playerId: 1002, teamId: 5, positionId: null },
      ],
      [
        { playerId: 1001, position: '1B' },
        { playerId: 1002, position: '1B' },
      ],
    ]);

    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);

    // Only 1 assignment because there is only 1 slot
    expect(result.assignedCount).toBe(1);
    // 1 matchup_players update + 1 team_members mirror
    expect(txUpdateCalls.length).toBe(2);
  });

  it('handles two teams in the same matchup independently', async () => {
    // Team 5 and Team 6 are in matchup 10. Each team has one bench player.
    const { db, txUpdateCalls } = buildMockDb([
      [{ id: 1, positionType: 'OF' }],
      [
        { id: 101, matchupId: 10, playerId: 1001, teamId: 5, positionId: null },
        { id: 102, matchupId: 10, playerId: 2001, teamId: 6, positionId: null },
      ],
      [
        { playerId: 1001, position: 'OF' },
        { playerId: 2001, position: 'OF' },
      ],
    ]);

    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);

    // Both teams should each get their player assigned
    expect(result.assignedCount).toBe(2);
    // 2 matchup_players updates + 2 team_members mirrors
    expect(txUpdateCalls.length).toBe(4);
  });

  it('returns 0 when all slots are already filled for every team', async () => {
    // Every matchup_player already has a positionId — nothing to assign
    const { db, transactionMock, txUpdateCalls } = buildMockDb([
      [{ id: 1, positionType: '1B' }],
      [
        { id: 101, matchupId: 10, playerId: 1001, teamId: 5, positionId: 1 }, // filled
      ],
      [{ playerId: 1001, position: '1B' }],
    ]);

    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);

    expect(result.assignedCount).toBe(0);
    // transaction should not be called if there are no assignments
    expect(transactionMock).not.toHaveBeenCalled();
    expect(txUpdateCalls.length).toBe(0);
  });

  it('skips players with no eligible positions for a slot', async () => {
    // Player 1001 is eligible for SP only; the slot is 1B.
    // Player should NOT fill the 1B slot.
    const { db } = buildMockDb([
      [{ id: 1, positionType: '1B' }],
      [{ id: 101, matchupId: 10, playerId: 1001, teamId: 5, positionId: null }],
      [
        { playerId: 1001, position: 'SP' }, // not eligible for 1B
      ],
    ]);

    const result = await autoPopulateFirstMatchupLineup(db, 1, [10]);
    expect(result.assignedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// populateMatchupPlayersAndSeasons smoke test
// ---------------------------------------------------------------------------

describe('populateMatchupPlayersAndSeasons', () => {
  /**
   * Covers the three-query sequence used by populateMatchupPlayersAndSeasons
   * for a single week-1 matchup with two teams and no season data:
   *   1. team_members select (all teams)
   *   2. seasonBatting, seasonPitching, seasonFielding (parallel — three selects)
   *   3. insert (captured) — verifies both teams' players appear in the insert values.
   */
  it('inserts matchup_players for both teams from team_members', async () => {
    interface PlayerRow {
      teamId: number;
      playerId: number;
      positionId: number | null;
    }

    const team1Players: PlayerRow[] = [
      { teamId: 10, playerId: 1001, positionId: 1 }, // starter
      { teamId: 10, playerId: 1002, positionId: null }, // bench
    ];
    const team2Players: PlayerRow[] = [
      { teamId: 20, playerId: 2001, positionId: 2 }, // starter
      { teamId: 20, playerId: 2002, positionId: null }, // bench
    ];

    const insertedValueSets: PlayerRow[][] = [];

    let selectIndex = 0;
    const selectResults: unknown[] = [
      [...team1Players, ...team2Players], // team_members for the league
      [], // seasonBatting
      [], // seasonPitching
      [], // seasonFielding
    ];

    const makeSelectChain = (): MockSelectChain => {
      if (selectIndex >= selectResults.length) {
        throw new Error(
          `Unexpected select() call #${selectIndex + 1}; only ${selectResults.length} mocked result(s) were provided.`,
        );
      }
      const result = selectResults[selectIndex++];
      const chain: MockSelectChain = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        inArray: jest.fn().mockReturnThis(),
        // Must RETURN resolve(result) so chained .then(fn) calls in Promise.all
        // (e.g. `.then(rows => rows.filter(...))`) receive the array, not undefined.
        then: jest
          .fn()
          .mockImplementation((resolve: (value: unknown) => unknown) =>
            resolve(result),
          ),
      };
      return chain;
    };

    const makeInsertChain = (): MockInsertChain => {
      const chain: MockInsertChain = {
        values: jest.fn().mockImplementation((vals: PlayerRow[]) => {
          insertedValueSets.push(vals);
          return chain;
        }),
        onConflictDoUpdate: jest.fn().mockReturnThis(),
        onConflictDoNothing: jest.fn().mockReturnThis(),
        then: jest
          .fn()
          .mockImplementation((resolve: (value: unknown) => unknown) =>
            resolve(undefined),
          ),
      };
      return chain;
    };

    const mockDb = {
      select: jest.fn().mockImplementation(makeSelectChain),
      insert: jest.fn().mockImplementation(makeInsertChain),
    };

    const db = mockDb as unknown as SmokeDb;
    const matchupRows = [{ id: 100, weekNumber: 1, team1Id: 10, team2Id: 20 }];

    await populateMatchupPlayersAndSeasons(db, 1, matchupRows, 5);

    // insert should have been called at least once (for matchup_players)
    expect(mockDb.insert).toHaveBeenCalled();

    // The inserted values should include players from both teams
    const allInsertedRows = insertedValueSets.flat();
    const team1Inserted = allInsertedRows.filter((r) => r.teamId === 10);
    const team2Inserted = allInsertedRows.filter((r) => r.teamId === 20);
    expect(team1Inserted.length).toBe(2);
    expect(team2Inserted.length).toBe(2);

    // Starter positionIds should be preserved
    const starterRow10 = team1Inserted.find((r) => r.playerId === 1001);
    expect(starterRow10?.positionId).toBe(1);
    const benchRow10 = team1Inserted.find((r) => r.playerId === 1002);
    expect(benchRow10?.positionId).toBeNull();
  });
});

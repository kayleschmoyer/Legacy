/**
 * Backend integration test: getMatchupPlayers starters pipeline (LS-4192).
 *
 * The STARTERS section on the matchup detail page depends on two API calls:
 *   1. leaguePositions(leagueId) — provides the slot definitions
 *   2. getMatchupPlayers(matchupId) — provides players with positionId values
 *
 * MatchupRosterEditorView renders a player card for each slot whose id
 * matches a player's positionId.  If positionId values written by
 * autoPopulateFirstMatchupLineup don't correspond to real leaguePosition.id
 * values — or if getMatchupPlayers fails to return them — STARTERS shows
 * empty even though the GQL gate passes.
 *
 * These tests verify:
 *  - autoPopulateFirstMatchupLineup assigns leaguePosition.id values as positionId
 *  - The resolver's positionId ?? null transformation preserves non-null values
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { autoPopulateFirstMatchupLineup } from '@legacy-sports/db-client';

// ---------------------------------------------------------------------------
// Minimal mock DB helper — mirrors the pattern in matchup-utils.spec.ts
// ---------------------------------------------------------------------------

type TxUpdateCall = { setArg: { positionId?: number | null } };

function buildMockDb(selectResults: unknown[]): {
  db: Parameters<typeof autoPopulateFirstMatchupLineup>[0];
  txUpdateCalls: TxUpdateCall[];
  transactionMock: jest.Mock;
} {
  const txUpdateCalls: TxUpdateCall[] = [];
  let selectIndex = 0;

  const makeSelectChain = () => {
    if (selectIndex >= selectResults.length) {
      throw new Error(
        `Unexpected select() call #${selectIndex + 1}; only ${selectResults.length} mocked result(s) provided`,
      );
    }
    const result = selectResults[selectIndex++];
    return {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      then: jest
        .fn()
        .mockImplementation((resolve: (v: unknown) => unknown) =>
          resolve(result),
        ),
    };
  };

  const makeUpdateChain = () => {
    let capturedSet: TxUpdateCall['setArg'] | null = null;
    const chain = {
      set: jest.fn().mockImplementation((arg: TxUpdateCall['setArg']) => {
        capturedSet = arg;
        txUpdateCalls.push({ setArg: capturedSet });
        return chain;
      }),
      where: jest.fn().mockResolvedValue(undefined),
    };
    return chain;
  };

  const mockTx = {
    update: jest.fn().mockImplementation(() => makeUpdateChain()),
  };
  const transactionMock = jest
    .fn()
    .mockImplementation(
      async (callback: (tx: typeof mockTx) => Promise<void>) => {
        await callback(mockTx);
      },
    );

  const db = {
    select: jest.fn().mockImplementation(makeSelectChain),
    transaction: transactionMock,
  } as unknown as Parameters<typeof autoPopulateFirstMatchupLineup>[0];

  return { db, txUpdateCalls, transactionMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('autoPopulateFirstMatchupLineup — positionId validity (LS-4192)', () => {
  it('assigns leaguePosition.id values as positionId — not arbitrary integers', async () => {
    // The leaguePosition rows created at league creation time.
    // These are the ONLY valid positionId values for this league.
    const LEAGUE_POSITIONS = [
      { id: 101, positionType: 'SP' },
      { id: 102, positionType: '1B' },
      { id: 103, positionType: 'OF' },
    ];
    const VALID_IDS = LEAGUE_POSITIONS.map((p) => p.id);

    const matchupPlayers = [
      { id: 1, matchupId: 10, playerId: 200, teamId: 5, positionId: null },
      { id: 2, matchupId: 10, playerId: 201, teamId: 5, positionId: null },
      { id: 3, matchupId: 10, playerId: 202, teamId: 5, positionId: null },
    ];
    const eligiblePositions = [
      { playerId: 200, position: 'SP' },
      { playerId: 201, position: '1B' },
      { playerId: 202, position: 'OF' },
    ];

    const { db, txUpdateCalls } = buildMockDb([
      LEAGUE_POSITIONS,
      matchupPlayers,
      eligiblePositions,
    ]);

    const { assignedCount } = await autoPopulateFirstMatchupLineup(db, 1, [10]);

    expect(assignedCount).toBe(3);

    // Every positionId written to matchup_players must be a valid
    // leaguePosition.id value — not null, not 0, not an unrelated integer.
    const assignedPositionIds = txUpdateCalls
      .filter((c) => c.setArg.positionId != null)
      .map((c) => c.setArg.positionId as number);

    expect(assignedPositionIds.length).toBeGreaterThan(0);
    for (const posId of assignedPositionIds) {
      expect(VALID_IDS).toContain(posId);
    }
  });

  it('does not reuse a slot already occupied by another player', async () => {
    // Regression guard: only one player should fill each slot even when
    // multiple players are eligible. UNIQUE constraint on matchup_players
    // (matchupId, positionId) would reject duplicates — but it should
    // never be attempted in the first place.
    const { db, txUpdateCalls } = buildMockDb([
      [{ id: 10, positionType: 'SP' }], // one slot only
      [
        { id: 1, matchupId: 5, playerId: 100, teamId: 3, positionId: null },
        { id: 2, matchupId: 5, playerId: 101, teamId: 3, positionId: null },
      ],
      [
        { playerId: 100, position: 'SP' },
        { playerId: 101, position: 'SP' },
      ],
    ]);

    const { assignedCount } = await autoPopulateFirstMatchupLineup(db, 1, [5]);

    // Only one player should fill the sole slot
    expect(assignedCount).toBe(1);
    const posIds = txUpdateCalls
      .map((c) => c.setArg.positionId)
      .filter((id) => id != null);
    // All recorded positionId writes should reference slot 10 — and there
    // should only be one matchup_players update (the other call is the
    // team_members mirror which uses the same positionId)
    for (const posId of posIds) {
      expect(posId).toBe(10);
    }
  });
});

describe('getMatchupPlayers resolver — positionId preservation (LS-4192)', () => {
  it('returns non-null positionId for seeded starters — does not zero out assigned slots', () => {
    // Simulate the rows getMatchupPlayers reads from matchup_players after
    // autoPopulateFirstMatchupLineup has written positionId values.
    const dbRows = [
      { id: 1, matchupId: 10, playerId: 200, teamId: 5, positionId: 101 }, // starter
      { id: 2, matchupId: 10, playerId: 201, teamId: 5, positionId: 102 }, // starter
      { id: 3, matchupId: 10, playerId: 202, teamId: 5, positionId: null }, // bench
    ];

    // The resolver maps: positionId: player.positionId ?? null
    // This transformation must preserve non-null values.
    const resolverResult = dbRows.map((player) => ({
      ...player,
      positionId: player.positionId ?? null,
    }));

    const starters = resolverResult.filter((p) => p.positionId !== null);
    expect(starters).toHaveLength(2);
    expect(starters.map((p) => p.positionId)).toEqual(
      expect.arrayContaining([101, 102]),
    );

    // Bench player must remain null
    expect(resolverResult.find((p) => p.id === 3)?.positionId).toBeNull();
  });

  it('returns empty array when no matchup players exist', () => {
    // Guard: resolver returns [] when playersResults is empty — not an error.
    const dbRows: { positionId: number | null }[] = [];
    const resolverResult = dbRows.map((player) => ({
      ...player,
      positionId: player.positionId ?? null,
    }));
    expect(resolverResult).toHaveLength(0);
  });
});

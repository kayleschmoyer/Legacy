/**
 * Roster-slot-fill invariant for computeUnfilledSlotTypes (LS-9123).
 *
 * An auto-drafted team ended up with no player at 3B: the prior greedy
 * assignment could report a slot "unfilled"/starve a single-eligible player
 * even when a valid full assignment existed, because it let an earlier
 * multi-eligible player grab a shared slot without checking whether a later
 * player had no other option. These tests pin the invariant that every slot
 * type gets filled whenever a valid assignment of drafted players to slots
 * exists — regardless of draft order.
 */

import type { PublicDb } from '@legacy-sports/db-client';
import {
  computeUnfilledSlotCounts,
  computeUnfilledSlotTypes,
  getOpenSlotFilterTypes,
  getUnfilledPositionTypes,
  hasSpareRosterCapacity,
} from './helpers';

describe('computeUnfilledSlotTypes (LS-9123)', () => {
  it('fills every slot when a valid assignment exists, even if an early multi-eligible pick could starve a later single-eligible one', () => {
    // 3B, SS, LF each need one slot. Player 1 can play 3B or SS, player 2 can
    // play SS or LF, and player 3 can ONLY play 3B. A one-pass greedy that
    // lets player 1 claim 3B first (processed before player 3) leaves player
    // 3 with nowhere to go and 3B reported unfilled — even though the
    // assignment {3: 3B, 1: SS, 2: LF} covers every slot.
    const slotsNeeded = new Map([
      ['3B', 1],
      ['SS', 1],
      ['LF', 1],
    ]);
    const playerSlotMap = new Map([
      [1, new Set(['3B', 'SS'])],
      [2, new Set(['SS', 'LF'])],
      [3, new Set(['3B'])],
    ]);

    const unfilled = computeUnfilledSlotTypes(
      slotsNeeded,
      playerSlotMap,
      [1, 2, 3],
    );

    expect(unfilled).toEqual([]);
  });

  it('produces the same fully-covered result regardless of draft pick order', () => {
    const slotsNeeded = new Map([
      ['3B', 1],
      ['SS', 1],
      ['LF', 1],
    ]);
    const playerSlotMap = new Map([
      [1, new Set(['3B', 'SS'])],
      [2, new Set(['SS', 'LF'])],
      [3, new Set(['3B'])],
    ]);

    expect(
      computeUnfilledSlotTypes(slotsNeeded, playerSlotMap, [3, 1, 2]),
    ).toEqual([]);
    expect(
      computeUnfilledSlotTypes(slotsNeeded, playerSlotMap, [2, 3, 1]),
    ).toEqual([]);
  });

  it('still reports a slot unfilled when no valid assignment can cover it', () => {
    // Two 3B-needing... actually: SS needs a slot but no drafted player is
    // SS-eligible at all — no assignment can cover it.
    const slotsNeeded = new Map([
      ['3B', 1],
      ['SS', 1],
    ]);
    const playerSlotMap = new Map([
      [1, new Set(['3B'])],
      [2, new Set(['3B'])],
    ]);

    const unfilled = computeUnfilledSlotTypes(
      slotsNeeded,
      playerSlotMap,
      [1, 2],
    );

    expect(unfilled).toEqual(['SS']);
  });

  it('returns no unfilled slots when every requirement is satisfiable one-to-one', () => {
    const slotsNeeded = new Map([
      ['C', 1],
      ['1B', 1],
    ]);
    const playerSlotMap = new Map([
      [1, new Set(['C'])],
      [2, new Set(['1B'])],
    ]);

    expect(
      computeUnfilledSlotTypes(slotsNeeded, playerSlotMap, [1, 2]),
    ).toEqual([]);
  });
});

describe('computeUnfilledSlotCounts (LS-10636)', () => {
  it('reports how many slots of each uncovered type remain open', () => {
    const slotsNeeded = new Map([
      ['SS', 1],
      ['OF', 3],
    ]);
    const playerSlotMap = new Map([
      [1, new Set(['SS'])],
      [2, new Set(['OF'])],
    ]);

    const counts = computeUnfilledSlotCounts(
      slotsNeeded,
      playerSlotMap,
      [1, 2],
    );

    expect([...counts]).toEqual([['OF', 2]]);
  });
});

describe('hasSpareRosterCapacity (LS-10636)', () => {
  it('is true when more roster spots remain than starter slots to fill', () => {
    expect(
      hasSpareRosterCapacity({
        maxRosterSize: 25,
        pickCount: 1,
        unfilledSlotCount: 14,
      }),
    ).toBe(true);
  });

  it('is false when every remaining pick is forced into an open starter slot', () => {
    expect(
      hasSpareRosterCapacity({
        maxRosterSize: 25,
        pickCount: 11,
        unfilledSlotCount: 14,
      }),
    ).toBe(false);
  });
});

describe('getOpenSlotFilterTypes (LS-10636)', () => {
  /**
   * Fake tx: `execute` serves the seat's pick ids, the select chain serves
   * their eligible stat positions.
   */
  function makeTx(pickIds: number[], eligible: Record<number, string[]>) {
    const rows = pickIds.flatMap((playerId) =>
      (eligible[playerId] ?? []).map((position) => ({ playerId, position })),
    );
    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.from = jest.fn(() => chain);
    chain.where = jest.fn(() => Promise.resolve(rows));
    chain.execute = jest.fn(() =>
      Promise.resolve({ rows: pickIds.map((id) => ({ player_id: id })) }),
    );
    return chain as unknown as PublicDb;
  }

  // Starters: SS, C, SP. Roster of 5 leaves two bench spots.
  const rules = {
    sport: 'baseball' as const,
    rosterPositions: ['SS', 'C', 'SP'] as ('SS' | 'C' | 'SP')[],
    maxRosterSize: 5,
  };

  it('does not hide shortstops after one is drafted while bench spots are open', async () => {
    const tx = makeTx([1], { 1: ['SS'] });

    // SS is occupied, yet C and SP are still open AND two bench spots remain,
    // so nothing is filtered.
    expect(await getUnfilledPositionTypes(tx, 100, 900, rules)).toEqual([
      'C',
      'SP',
    ]);
    expect(await getOpenSlotFilterTypes(tx, 100, 900, rules)).toEqual([]);
  });

  it('narrows to the open starter slots once no spare spot is left', async () => {
    // Four picks (SS plus three bench-type fillers) leave one roster spot and
    // two open starter slots, so that spot must fill a starter slot.
    const tx = makeTx([1, 2, 3, 4], {
      1: ['SS'],
      2: ['1B'],
      3: ['1B'],
      4: ['1B'],
    });

    expect(await getOpenSlotFilterTypes(tx, 100, 900, rules)).toEqual([
      'C',
      'SP',
    ]);
  });
});

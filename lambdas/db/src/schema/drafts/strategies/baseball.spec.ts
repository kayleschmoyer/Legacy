/**
 * Baseball strategy parity test (LS-4665).
 *
 * Acceptance: baseball auto-pick scoring matches the pre-LS-4665
 * `scoreByPositionalScarcity` implementation in auto-pick-scorer.ts, except
 * that players matching no unfilled slot no longer compete (LS-10802). The
 * snapshots below pin the exact player id and reason string for small
 * fixtures so any silent drift in scoring math fails CI.
 */

import { ALLOWED_POSITIONS } from '@legacy-sports/utils';
import { baseballStrategy } from './baseball';
import type { PlayerDraftInfo } from '../candidate-pool';

function makeInfo(
  entries: Array<[number, number, string[]]>,
): Map<number, PlayerDraftInfo> {
  const map = new Map<number, PlayerDraftInfo>();
  for (const [id, fpg, positions] of entries) {
    map.set(id, { fpg, positions });
  }
  return map;
}

describe('baseballStrategy.scoreForUnfilledPositions', () => {
  test('picks the scarcity-boosted catcher over a higher-FPG outfielder', () => {
    // 10 outfielders + 1 catcher: C is 11× scarcer than OF, so the sqrt-based
    // scarcity boost outweighs the OF's higher raw FPG. The catcher wins.
    const info = makeInfo([
      [1, 30, ['C']],
      [2, 32, ['LF']],
      [3, 31, ['CF']],
      [4, 31, ['RF']],
      [5, 30, ['OF']],
      [6, 29, ['LF']],
      [7, 29, ['CF']],
      [8, 29, ['RF']],
      [9, 28, ['OF']],
      [10, 28, ['LF']],
      [11, 28, ['CF']],
    ]);

    const result = baseballStrategy.scoreForUnfilledPositions(info, [
      'C',
      'OF',
    ]);

    expect(result).toMatchInlineSnapshot(`
      {
        "playerId": 1,
        "reason": "Best available for C — 30.0 projected matchup pts (×3.3 positional scarcity)",
      }
    `);
  });

  test('returns no pick when no player fits an unfilled slot (LS-10802)', () => {
    // No SS in the pool. Non-matching players no longer compete at a 0.25×
    // bench score; the strategy returns nothing so selectAutoPickPlayer falls
    // through to its versatility-scored bench pick.
    const info = makeInfo([
      [10, 22, ['1B']],
      [11, 25, ['2B']],
      [12, 20, ['3B']],
    ]);

    const result = baseballStrategy.scoreForUnfilledPositions(info, ['SS']);

    expect(result).toEqual({ playerId: undefined, reason: '' });
  });

  test('prefers the higher-FPG player when scarcity is equal', () => {
    // Two equal-supply slots; among matching players the higher FPG wins.
    const info = makeInfo([
      [20, 15, ['1B']],
      [21, 18, ['1B']],
      [22, 12, ['1B']],
    ]);

    const result = baseballStrategy.scoreForUnfilledPositions(info, ['1B']);

    expect(result.playerId).toBe(21);
  });

  test('fills an open hitter slot even when pitchers out-project hitters 10× (LS-10802)', () => {
    // Only hitter slots are open. Pitchers carry 10× the hitters' fpg, so a
    // 0.25× bench score (100 × 0.25 = 25) used to beat every hitter's
    // scarcity-boosted score and the seat drafted bench pitchers all draft.
    const info = makeInfo([
      [30, 100, ['SP']],
      [31, 95, ['RP']],
      [32, 90, ['SP']],
      [33, 10, ['C']],
      [34, 9, ['1B']],
      [35, 8, ['LF']],
    ]);

    const result = baseballStrategy.scoreForUnfilledPositions(info, [
      'C',
      '1B',
      'OF',
    ]);

    expect([33, 34, 35]).toContain(result.playerId);
  });

  test('a full auto-picked roster fills every starter slot before any bench pick (LS-10802)', () => {
    // 20-round build against a pool where pitchers out-project hitters 10×.
    // Each round mirrors selectAutoPickPlayer: strategy first, bench pick
    // (here: highest fpg) only when the strategy returns nothing.
    const starterSlots = [
      'C',
      '1B',
      '2B',
      '3B',
      'SS',
      'OF',
      'OF',
      'OF',
      'DH',
      'SP',
      'SP',
      'SP',
      'SP',
      'SP',
      'RP',
      'RP',
    ];
    const rounds = 20;
    const hitterPositions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
    const entries: Array<[number, number, string[]]> = [];
    let nextId = 1;
    for (let i = 0; i < 40; i++) {
      entries.push([nextId++, 100 - i, [i % 3 === 0 ? 'RP' : 'SP']]);
    }
    for (let i = 0; i < 40; i++) {
      entries.push([nextId++, 10 - i * 0.1, [hitterPositions[i % 8]]]);
    }
    const pool = makeInfo(entries);

    const openSlots = [...starterSlots];
    const benchRounds: number[] = [];
    for (let round = 1; round <= rounds; round++) {
      const unfilled = [...new Set(openSlots)];
      let pickId = baseballStrategy.scoreForUnfilledPositions(
        pool,
        unfilled,
      ).playerId;
      if (pickId === undefined) {
        pickId = [...pool.entries()].sort((a, b) => b[1].fpg - a[1].fpg)[0][0];
      }
      const picked = pool.get(pickId);
      if (!picked) throw new Error(`picked unknown player ${pickId}`);
      pool.delete(pickId);

      const slotIndex = openSlots.findIndex((slot) =>
        (ALLOWED_POSITIONS[slot] ?? [slot]).some((sp) =>
          picked.positions.includes(sp),
        ),
      );
      if (slotIndex === -1) {
        benchRounds.push(round);
      } else {
        openSlots.splice(slotIndex, 1);
      }
    }

    expect(openSlots).toEqual([]);
    expect(benchRounds).toEqual([17, 18, 19, 20]);
  });

  test('sport tag is baseball', () => {
    expect(baseballStrategy.sport).toBe('baseball');
  });
});

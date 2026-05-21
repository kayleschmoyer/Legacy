/**
 * Baseball strategy parity test (LS-4665).
 *
 * Acceptance: baseball auto-pick output is bit-identical to the pre-LS-4665
 * `scoreByPositionalScarcity` implementation in auto-pick-scorer.ts. The
 * snapshot below pins the exact player id and reason string for a small
 * fixture so any silent drift in scoring math fails CI.
 */

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

  test('falls back to a 0.25× bench score when no player matches', () => {
    // No SS in the pool; every candidate gets the 0.25 penalty, so the
    // highest-FPG player wins and the reason is the bench string.
    const info = makeInfo([
      [10, 22, ['1B']],
      [11, 25, ['2B']],
      [12, 20, ['3B']],
    ]);

    const result = baseballStrategy.scoreForUnfilledPositions(info, ['SS']);

    expect(result).toMatchInlineSnapshot(`
      {
        "playerId": 11,
        "reason": "Best available (bench) — 25.0 projected matchup pts",
      }
    `);
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

  test('sport tag is baseball', () => {
    expect(baseballStrategy.sport).toBe('baseball');
  });
});

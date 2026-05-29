/**
 * Football strategy tests (LS-4665, LS-4763).
 *
 * Acceptance: a football league with a mock player pool auto-picks a complete,
 * sensible roster. We simulate the per-pick loop the way scheduled-mutations
 * does — invoke the strategy, remove the chosen player, drop the filled slot
 * from `unfilledPositionTypes`, repeat — and assert every starting slot ends
 * up filled by a position-eligible player.
 */

import { ALLOWED_POSITIONS_BY_SPORT } from '@legacy-sports/utils';
import {
  ALLOWED_POSITIONS_FOOTBALL,
  effectiveFootballFpg,
  footballStrategy,
} from './football';
import type { PlayerDraftInfo } from '../candidate-pool';

function buildMockFootballPool(): Map<number, PlayerDraftInfo> {
  const pool = new Map<number, PlayerDraftInfo>();
  const archetypes: Array<{ count: number; position: string }> = [
    { count: 6, position: 'QB' },
    { count: 12, position: 'RB' },
    { count: 18, position: 'WR' },
    { count: 8, position: 'TE' },
    { count: 4, position: 'K' },
    { count: 4, position: 'DEF' },
  ];

  let id = 100;
  for (const { count, position } of archetypes) {
    for (let i = 0; i < count; i++) {
      pool.set(id, { fpg: 0, positions: [position] });
      id++;
    }
  }
  return pool;
}

function simulateDraft(
  pool: Map<number, PlayerDraftInfo>,
  startingSlots: string[],
): Array<{ playerId: number; slot: string; positions: string[] }> {
  const remaining = new Map(pool);
  const unfilled = [...startingSlots];
  const picks: Array<{ playerId: number; slot: string; positions: string[] }> =
    [];

  while (unfilled.length > 0) {
    const result = footballStrategy.scoreForUnfilledPositions(
      remaining,
      unfilled,
    );
    if (result.playerId === undefined) {
      throw new Error(
        `Strategy returned no pick with unfilled=${JSON.stringify(unfilled)}`,
      );
    }
    const info = remaining.get(result.playerId);
    if (!info) throw new Error(`Picked player ${result.playerId} missing`);

    // Find the slot the player satisfies (matches the strategy's fill order).
    const slot = unfilled.find((s) => {
      const allowed = ALLOWED_POSITIONS_FOOTBALL[s] ?? [s];
      return allowed.some((sp) => info.positions.includes(sp));
    });
    if (!slot) {
      throw new Error(
        `No matching slot for player ${result.playerId} (positions=${info.positions.join(',')})`,
      );
    }

    picks.push({
      playerId: result.playerId,
      slot,
      positions: info.positions,
    });
    remaining.delete(result.playerId);
    unfilled.splice(unfilled.indexOf(slot), 1);
  }

  return picks;
}

describe('footballStrategy.scoreForUnfilledPositions', () => {
  test('sport tag is football', () => {
    expect(footballStrategy.sport).toBe('football');
  });

  test('drafts a complete starting lineup from a mock pool', () => {
    const startingSlots = [
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'WR',
      'TE',
      'K',
      'DEF',
      'FLEX',
    ];
    const picks = simulateDraft(buildMockFootballPool(), [...startingSlots]);

    expect(picks).toHaveLength(startingSlots.length);

    const slotCounts = picks.reduce<Record<string, number>>((acc, p) => {
      acc[p.slot] = (acc[p.slot] ?? 0) + 1;
      return acc;
    }, {});
    expect(slotCounts).toEqual({
      QB: 1,
      RB: 2,
      WR: 3,
      TE: 1,
      K: 1,
      DEF: 1,
      FLEX: 1,
    });

    // Every player is position-eligible for the slot they filled.
    for (const pick of picks) {
      const allowed = ALLOWED_POSITIONS_FOOTBALL[pick.slot] ?? [pick.slot];
      expect(allowed.some((sp) => pick.positions.includes(sp))).toBe(true);
    }
  });

  test('honors canonical fill priority (QB before RB before WR)', () => {
    const pool = buildMockFootballPool();
    const result = footballStrategy.scoreForUnfilledPositions(pool, [
      'WR',
      'RB',
      'QB',
    ]);
    const picked = result.playerId;
    expect(picked).toBeDefined();
    expect(picked !== undefined && pool.get(picked)?.positions).toEqual(['QB']);
    expect(result.reason).toMatch(/^Best available for QB —/);
  });

  test('FLEX accepts RB/WR/TE', () => {
    // Pool with only a TE — FLEX should still pick it.
    const pool: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 0, positions: ['TE'] }],
    ]);
    const result = footballStrategy.scoreForUnfilledPositions(pool, ['FLEX']);
    expect(result.playerId).toBe(1);
  });

  test('returns undefined when no candidate matches any unfilled slot', () => {
    // Pool only has a QB; team needs K only.
    const pool: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 0, positions: ['QB'] }],
    ]);
    const result = footballStrategy.scoreForUnfilledPositions(pool, ['K']);
    expect(result.playerId).toBeUndefined();
    expect(result.reason).toBe('');
  });

  test('uses real fpg over the mock baseline when stats are present', () => {
    const pool: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 35, positions: ['QB'] }], // real stats
      [2, { fpg: 0, positions: ['QB'] }], // mock
    ]);
    const result = footballStrategy.scoreForUnfilledPositions(pool, ['QB']);
    expect(result.playerId).toBe(1);
    const qb = pool.get(1);
    expect(qb).toBeDefined();
    if (qb) expect(effectiveFootballFpg(qb, 1)).toBe(35);
  });

  test('mock fpg is deterministic per player id', () => {
    const info: PlayerDraftInfo = { fpg: 0, positions: ['QB'] };
    expect(effectiveFootballFpg(info, 42)).toBe(effectiveFootballFpg(info, 42));
  });
});

describe('ALLOWED_POSITIONS_FOOTBALL derives from shared map (LS-4763)', () => {
  const shared = ALLOWED_POSITIONS_BY_SPORT['football'];

  it('all slots except DEF match the shared ALLOWED_POSITIONS_BY_SPORT.football', () => {
    for (const slot of Object.keys(shared)) {
      if (slot === 'DEF') continue;
      expect(ALLOWED_POSITIONS_FOOTBALL[slot]).toEqual(shared[slot]);
    }
  });

  it('DEF slot retains DST alias for data-feed compatibility', () => {
    expect(ALLOWED_POSITIONS_FOOTBALL['DEF']).toContain('DEF');
    expect(ALLOWED_POSITIONS_FOOTBALL['DEF']).toContain('DST');
  });

  it('FLEX slot accepts RB, WR, TE only (LS-4763 acceptance criteria)', () => {
    const flex = ALLOWED_POSITIONS_FOOTBALL['FLEX'] ?? [];
    expect(flex).toContain('RB');
    expect(flex).toContain('WR');
    expect(flex).toContain('TE');
    expect(flex).not.toContain('QB');
    expect(flex).not.toContain('K');
    expect(flex).not.toContain('DEF');
  });
});

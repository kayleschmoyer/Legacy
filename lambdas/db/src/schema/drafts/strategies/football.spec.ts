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
  MOCK_FPG_BY_POSITION,
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
    { count: 4, position: 'DST' },
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
      'DST',
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
      DST: 1,
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

  // ── LS-9476: never present the archetype baseline as a projection ──────
  // players.projected_fantasy_points is unset for every football player, so
  // the un-projected branch is what real drafts actually hit today.

  test('quotes no number when the pick has no served projection', () => {
    const pool: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 0, positions: ['QB'] }],
    ]);
    const result = footballStrategy.scoreForUnfilledPositions(pool, ['QB']);

    expect(result.playerId).toBe(1);
    expect(result.reason).toBe(
      'Best available for QB — ranked by position (no projection available)',
    );
    // The fabricated figure must not reach the user in any form: no decimal
    // number, and none of the archetype baselines, anywhere in the string.
    expect(result.reason).not.toMatch(/\d+\.\d/);
    expect(result.reason).not.toContain('projected matchup pts');
  });

  test('quotes the real figure when a projection was served', () => {
    const pool: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 27.5, positions: ['QB'] }],
    ]);
    const result = footballStrategy.scoreForUnfilledPositions(pool, ['QB']);

    expect(result.playerId).toBe(1);
    expect(result.reason).toBe(
      'Best available for QB — 27.5 projected matchup pts',
    );
  });

  test('wording follows the winning player, not the rest of the pool', () => {
    // A projected QB outranks an un-projected one, so the reason must quote
    // the number; the reverse pool must not borrow the projected player's
    // wording.
    const projectedWins: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 30, positions: ['QB'] }],
      [2, { fpg: 0, positions: ['QB'] }],
    ]);
    const projectedResult = footballStrategy.scoreForUnfilledPositions(
      projectedWins,
      ['QB'],
    );
    expect(projectedResult.playerId).toBe(1);
    expect(projectedResult.reason).toContain('30.0 projected matchup pts');

    // fpg 1 is a real projection but ranks BELOW the ~24 QB baseline, so the
    // un-projected player wins and the wording must switch with it.
    const baselineWins: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 1, positions: ['QB'] }],
      [2, { fpg: 0, positions: ['QB'] }],
    ]);
    const baselineResult = footballStrategy.scoreForUnfilledPositions(
      baselineWins,
      ['QB'],
    );
    expect(baselineResult.playerId).toBe(2);
    expect(baselineResult.reason).toBe(
      'Best available for QB — ranked by position (no projection available)',
    );
  });
});

describe('ALLOWED_POSITIONS_FOOTBALL derives from shared map (LS-4763)', () => {
  const shared = ALLOWED_POSITIONS_BY_SPORT['football'];

  it('every slot matches the shared ALLOWED_POSITIONS_BY_SPORT.football', () => {
    for (const slot of Object.keys(shared)) {
      expect(ALLOWED_POSITIONS_FOOTBALL[slot]).toEqual(shared[slot]);
    }
    expect(Object.keys(ALLOWED_POSITIONS_FOOTBALL).sort()).toEqual(
      Object.keys(shared).sort(),
    );
  });

  it('covers the premium SFLEX and KP slot types (LS-6337, LS-9107)', () => {
    expect(ALLOWED_POSITIONS_FOOTBALL['SFLEX']).toEqual([
      'QB',
      'RB',
      'WR',
      'TE',
    ]);
    expect(ALLOWED_POSITIONS_FOOTBALL['KP']).toEqual(['K']);
  });

  it('has no DEF key — the real roster slot type is DST, never DEF (LS-9475)', () => {
    expect(ALLOWED_POSITIONS_FOOTBALL['DEF']).toBeUndefined();
  });

  it('FLEX slot accepts RB, WR, TE only (LS-4763 acceptance criteria)', () => {
    const flex = ALLOWED_POSITIONS_FOOTBALL['FLEX'] ?? [];
    expect(flex).toContain('RB');
    expect(flex).toContain('WR');
    expect(flex).toContain('TE');
    expect(flex).not.toContain('QB');
    expect(flex).not.toContain('K');
    expect(flex).not.toContain('DST');
    expect(flex).not.toContain('DL');
    expect(flex).not.toContain('LB');
    expect(flex).not.toContain('DB');
  });
});

// ── Premium slots: auto-pick must actually fill SFLEX and KP ───────────────
// These slot types were missing from the strategy's former local map, so
// pickBestForSlot fell back to ['SFLEX'] / ['KP'] — a stat position no player
// has — and the slots were never filled.

describe('premium roster slots (SFLEX, KP)', () => {
  it('fills a lone SFLEX slot with an eligible player', () => {
    const pool: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 0, positions: ['QB'] }],
    ]);
    const result = footballStrategy.scoreForUnfilledPositions(pool, ['SFLEX']);
    expect(result.playerId).toBe(1);
    expect(result.reason).toMatch(/^Best available for SFLEX —/);
  });

  it('fills a lone KP slot with a kicker, and never with a non-kicker', () => {
    const pool: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 0, positions: ['QB'] }],
      [2, { fpg: 0, positions: ['K'] }],
    ]);
    const result = footballStrategy.scoreForUnfilledPositions(pool, ['KP']);
    expect(result.playerId).toBe(2);

    const noKicker: Map<number, PlayerDraftInfo> = new Map([
      [1, { fpg: 0, positions: ['QB'] }],
    ]);
    expect(
      footballStrategy.scoreForUnfilledPositions(noKicker, ['KP']).playerId,
    ).toBeUndefined();
  });

  it('drafts a complete Superflex + KP starting lineup', () => {
    const startingSlots = [
      'QB',
      'SFLEX',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'KP',
      'DST',
    ];
    const picks = simulateDraft(buildMockFootballPool(), [...startingSlots]);

    expect(picks).toHaveLength(startingSlots.length);
    const filled = picks.map((p) => p.slot).sort();
    expect(filled).toEqual([...startingSlots].sort());
    for (const pick of picks) {
      const allowed = ALLOWED_POSITIONS_FOOTBALL[pick.slot] ?? [pick.slot];
      expect(allowed.some((sp) => pick.positions.includes(sp))).toBe(true);
    }
  });

  it('fills SFLEX after FLEX (most-restrictive slot first)', () => {
    const pool = buildMockFootballPool();
    const result = footballStrategy.scoreForUnfilledPositions(pool, [
      'SFLEX',
      'FLEX',
    ]);
    expect(result.reason).toMatch(/^Best available for FLEX —/);
  });
});

// ── LS-9475: an IDP league can draft and rank DB/LB/DL players ─────────────

describe('IDP (individual defensive player) support', () => {
  it('drafts a complete IDP starting lineup, including DL/LB/DB slots', () => {
    const pool = buildMockFootballPool();
    // Replace the DST archetype with IDP defenders — a real 'idp'-format
    // league never has any DST-eligible candidates in its pool.
    for (const id of [...pool.keys()]) {
      if (pool.get(id)?.positions[0] === 'DST') pool.delete(id);
    }
    let id = 900;
    for (const position of ['DL', 'DL', 'LB', 'LB', 'DB', 'DB']) {
      pool.set(id, { fpg: 0, positions: [position] });
      id++;
    }

    const startingSlots = [
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'K',
      'DL',
      'LB',
      'DB',
      'FLEX',
    ];
    const picks = simulateDraft(pool, [...startingSlots]);

    expect(picks).toHaveLength(startingSlots.length);
    const filledSlots = new Set(picks.map((p) => p.slot));
    expect(filledSlots.has('DL')).toBe(true);
    expect(filledSlots.has('LB')).toBe(true);
    expect(filledSlots.has('DB')).toBe(true);

    // Ranked sensibly: every IDP pick's mock baseline is a real, distinct,
    // non-zero weight — not a flat tie (the bug LS-9483 tracks separately
    // for FPG-based ranking, but the archetype baseline itself must already
    // be non-degenerate across IDP positions).
    const idpPicks = picks.filter((p) => ['DL', 'LB', 'DB'].includes(p.slot));
    for (const pick of idpPicks) {
      const info = pool.get(pick.playerId);
      expect(info).toBeDefined();
      if (info)
        expect(effectiveFootballFpg(info, pick.playerId)).toBeGreaterThan(0);
    }
  });

  it('DL, LB, DB slots each accept only their own stat position', () => {
    expect(ALLOWED_POSITIONS_FOOTBALL['DL']).toEqual(['DL']);
    expect(ALLOWED_POSITIONS_FOOTBALL['LB']).toEqual(['LB']);
    expect(ALLOWED_POSITIONS_FOOTBALL['DB']).toEqual(['DB']);
  });
});

// ── LS-9475: vocabulary must match what the DB actually contains ───────────
// Ground truth from dev RDS (queried during LS-9472/LS-9475 investigation):
// `SELECT DISTINCT position FROM football_player_eligible_positions` returns
// exactly {QB, RB, WR, TE, K, DL, LB, DB} — no DEF or DST row exists because
// career_football_defense (backing the view's is_dst branch) is empty. A
// vocabulary entry for a position the view can never emit is dead weight; a
// missing entry for a position it does emit silently drops real players.
describe('vocabulary matches real football_player_eligible_positions data (LS-9475)', () => {
  const REAL_DB_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];

  it('every real DB position has a slot in ALLOWED_POSITIONS_FOOTBALL', () => {
    const allAllowedStatPositions = new Set(
      Object.values(ALLOWED_POSITIONS_FOOTBALL).flat(),
    );
    for (const pos of REAL_DB_POSITIONS) {
      expect(allAllowedStatPositions.has(pos)).toBe(true);
    }
  });

  it('every real DB position has a mock FPG baseline', () => {
    for (const pos of REAL_DB_POSITIONS) {
      expect(MOCK_FPG_BY_POSITION[pos]).toBeGreaterThan(0);
    }
  });
});

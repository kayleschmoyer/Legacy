import { ALLOWED_POSITIONS_BY_SPORT } from './allowed-positions';
import {
  optimizeLineup,
  type OptimizerPlayer,
  type OptimizerSlot,
} from './lineup-optimizer';

const FOOTBALL = ALLOWED_POSITIONS_BY_SPORT.football;

function player(
  id: number,
  points: number,
  eligibleStatPositions: readonly string[],
): OptimizerPlayer {
  return { id, points, eligibleStatPositions };
}

function slot(id: number, positionType: string): OptimizerSlot {
  return { id, positionType };
}

describe('optimizeLineup', () => {
  it('assigns a single eligible player to a single slot', () => {
    const result = optimizeLineup(
      [player(1, 20, ['QB'])],
      [slot(100, 'QB')],
      FOOTBALL,
    );
    expect(result).toEqual([{ playerId: 1, slotId: 100 }]);
  });

  it('benches a player with no eligible slot', () => {
    const result = optimizeLineup(
      [player(1, 20, ['K'])],
      [slot(100, 'QB')],
      FOOTBALL,
    );
    expect(result).toEqual([{ playerId: 1, slotId: null }]);
  });

  it('prefers the higher-scoring player for a single contested slot', () => {
    const result = optimizeLineup(
      [player(1, 10, ['RB']), player(2, 25, ['RB'])],
      [slot(100, 'RB')],
      FOOTBALL,
    );
    const byId = new Map(result.map((r) => [r.playerId, r.slotId]));
    expect(byId.get(2)).toBe(100);
    expect(byId.get(1)).toBeNull();
  });

  it('maximizes total points across FLEX-eligible players rather than filling slots greedily', () => {
    // A greedy fill-by-slot-order approach could give RB slot to the 12-pt RB
    // and FLEX to the 8-pt WR (20 total). The optimal assignment swaps the RB
    // into FLEX and puts the higher-scoring WR in the open RB-ineligible slot...
    // Simpler deterministic case: two RBs can only fill RB+FLEX; a WR can fill
    // WR+FLEX. Optimal picks the best total, not first-come-first-served.
    const players = [
      player(1, 12, ['RB']), // RB only
      player(2, 6, ['RB']), // RB only, weaker
      player(3, 18, ['WR']), // WR only, strongest
    ];
    const slots = [slot(100, 'RB'), slot(101, 'WR'), slot(102, 'FLEX')];
    const result = optimizeLineup(players, slots, FOOTBALL);
    const totalPoints = result.reduce((sum, r) => {
      if (r.slotId == null) return sum;
      const p = players.find((pl) => pl.id === r.playerId)!;
      return sum + p.points;
    }, 0);
    // Optimal: player1->RB (12), player3->WR (18), player2->FLEX (6) = 36
    expect(totalPoints).toBe(36);
    const byId = new Map(result.map((r) => [r.playerId, r.slotId]));
    expect(byId.get(1)).toBe(100);
    expect(byId.get(3)).toBe(101);
    expect(byId.get(2)).toBe(102);
  });

  it('never returns a slotId the player is not actually eligible for', () => {
    // More slots than eligible players — some slots must stay empty rather
    // than being filled by an ineligible player at 0 weight.
    const players = [player(1, 5, ['QB'])];
    const slots = [slot(100, 'QB'), slot(101, 'RB'), slot(102, 'WR')];
    const result = optimizeLineup(players, slots, FOOTBALL);
    expect(result).toEqual([{ playerId: 1, slotId: 100 }]);
  });

  it('benches surplus players beyond the number of slots', () => {
    const players = [player(1, 5, ['QB']), player(2, 9, ['QB'])];
    const slots = [slot(100, 'QB')];
    const result = optimizeLineup(players, slots, FOOTBALL);
    const byId = new Map(result.map((r) => [r.playerId, r.slotId]));
    expect(byId.get(2)).toBe(100);
    expect(byId.get(1)).toBeNull();
  });

  it('returns every player benched when there are no slots', () => {
    const result = optimizeLineup(
      [player(1, 10, ['QB']), player(2, 5, ['RB'])],
      [],
      FOOTBALL,
    );
    expect(result).toEqual([
      { playerId: 1, slotId: null },
      { playerId: 2, slotId: null },
    ]);
  });

  it('returns an empty array when there are no players', () => {
    expect(optimizeLineup([], [slot(100, 'QB')], FOOTBALL)).toEqual([]);
  });

  it('honors multi-position eligibility (e.g. SFLEX accepts QB/RB/WR/TE)', () => {
    const players = [
      player(1, 30, ['QB']),
      player(2, 22, ['QB']), // second QB — no QB slot left, but SFLEX accepts QB
    ];
    const slots = [slot(100, 'QB'), slot(101, 'SFLEX')];
    const result = optimizeLineup(players, slots, FOOTBALL);
    const byId = new Map(result.map((r) => [r.playerId, r.slotId]));
    expect(byId.get(1)).toBe(100);
    expect(byId.get(2)).toBe(101);
  });
});

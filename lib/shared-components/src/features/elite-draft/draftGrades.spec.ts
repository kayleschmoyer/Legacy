import { buildAdpRanks, computeTeamDraftGrade, gradeFor } from './draftGrades';
import type { DraftPickRecord, DraftPlayer } from './types';

function player(id: number, ppg: number | null): DraftPlayer {
  return {
    id,
    name: `Player ${id}`,
    position: 'OF',
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
    ppg,
  };
}

function pick(overallPick: number, teamId: number, playerId: number) {
  return {
    id: String(overallPick),
    draftId: 1,
    round: 1,
    pickNumber: overallPick,
    overallPick,
    pickedAt: new Date(0).toISOString(),
    teamId,
    playerId,
  } satisfies DraftPickRecord;
}

describe('gradeFor', () => {
  it.each([
    [0, 0, '—'],
    [15, 1, 'A+'],
    [8, 1, 'A'],
    [3, 1, 'B+'],
    [-2, 1, 'B'],
    [-8, 1, 'C'],
    [-9, 1, 'D'],
    [40, 4, 'A'], // averages over the pick count
  ])('gradeFor(%d, %d) = %s', (total, count, expected) => {
    expect(gradeFor(total, count)).toBe(expected);
  });
});

describe('buildAdpRanks', () => {
  it('ranks drafted players 1-based by projected points, missing stats last', () => {
    const lookup = new Map([
      [1, player(1, 10)],
      [2, player(2, 30)],
      [3, player(3, null)],
    ]);
    const ranks = buildAdpRanks(
      [pick(1, 1, 1), pick(2, 2, 2), pick(3, 1, 3), pick(4, 2, 99)],
      lookup,
    );
    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(1)).toBe(2);
    expect(ranks.size).toBe(4);
    expect(ranks.get(3)).toBeGreaterThan(2);
  });
});

describe('computeTeamDraftGrade', () => {
  // Pick order is the reverse of projection order, so the early picks are
  // reaches (negative value) and the late picks are steals (positive).
  const players = [player(1, 10), player(2, 20), player(3, 30), player(4, 40)];
  const lookup = new Map(players.map((p) => [p.id, p]));
  const history = [pick(1, 1, 1), pick(2, 2, 2), pick(3, 1, 3), pick(4, 2, 4)];

  it('computes value, projected points and best value for a team', () => {
    const picks = history.filter((p) => p.teamId === 2);
    const result = computeTeamDraftGrade(
      history,
      picks,
      [players[1], players[3]],
      lookup,
    );
    // ranks: p4=1, p3=2, p2=3, p1=4 → values: pick2-3=-1, pick4-1=+3
    expect(result.totalValue).toBe(2);
    expect(result.projPts).toBe(60);
    expect(result.bestValue?.player.id).toBe(4);
    expect(result.bestValue?.value).toBe(3);
    expect(result.grade).toBe('B');
  });

  it('returns a neutral grade for a team with no picks', () => {
    const result = computeTeamDraftGrade(history, [], [], lookup);
    expect(result).toMatchObject({
      grade: '—',
      totalValue: 0,
      projPts: 0,
      bestValue: null,
    });
  });
});

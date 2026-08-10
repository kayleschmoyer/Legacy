/**
 * Unit tests for `planRosterPositionUpdate` (LS-9099) — the pure
 * insert/reassign/delete planner behind the `updateRosterPositions`
 * mutation. Kept DB-free so the "never orphan an already-rostered player"
 * guarantee can be exercised directly.
 */
import { planRosterPositionUpdate } from './roster-position-planner';

describe('planRosterPositionUpdate', () => {
  it('plans inserts when a position type grows', () => {
    const plan = planRosterPositionUpdate({
      currentPositions: [
        { id: 1, positionType: 'QB' },
        { id: 2, positionType: 'RB' },
      ],
      occupiedRows: [],
      newCountByType: new Map([
        ['QB', 1],
        ['RB', 3],
      ]),
    });

    expect(plan.inserts).toEqual([{ positionType: 'RB', count: 2 }]);
    expect(plan.deletes).toEqual([]);
    expect(plan.reassignments).toEqual([]);
  });

  it('plans deletes for an unoccupied shrink with no reassignment needed', () => {
    const plan = planRosterPositionUpdate({
      currentPositions: [
        { id: 1, positionType: 'RB' },
        { id: 2, positionType: 'RB' },
        { id: 3, positionType: 'RB' },
      ],
      occupiedRows: [],
      newCountByType: new Map([['RB', 1]]),
    });

    expect(plan.inserts).toEqual([]);
    expect(plan.reassignments).toEqual([]);
    expect(plan.deletes.sort()).toEqual([2, 3]);
  });

  it('throws when shrinking below a team’s already-rostered count in that position', () => {
    // Team 10 has 2 players rostered at RB; requesting RB:1 must be rejected.
    expect(() =>
      planRosterPositionUpdate({
        currentPositions: [
          { id: 1, positionType: 'RB' },
          { id: 2, positionType: 'RB' },
        ],
        occupiedRows: [
          { teamMemberId: 100, teamId: 10, positionId: 1, positionType: 'RB' },
          { teamMemberId: 101, teamId: 10, positionId: 2, positionType: 'RB' },
        ],
        newCountByType: new Map([['RB', 1]]),
      }),
    ).toThrow(/Cannot reduce "RB" to 1 slot\(s\)/);
  });

  it('throws when shrinking a type to 0 while any team still has a player rostered there', () => {
    expect(() =>
      planRosterPositionUpdate({
        currentPositions: [{ id: 1, positionType: 'K' }],
        occupiedRows: [
          { teamMemberId: 200, teamId: 5, positionId: 1, positionType: 'K' },
        ],
        newCountByType: new Map(), // K omitted entirely => implicit 0
      }),
    ).toThrow(/Cannot reduce "K" to 0 slot\(s\)/);
  });

  it('allows a shrink that stays at or above every team’s occupied count', () => {
    // Team A has 1 RB rostered, team B has 2 — shrinking to 2 is fine.
    const plan = planRosterPositionUpdate({
      currentPositions: [
        { id: 1, positionType: 'RB' },
        { id: 2, positionType: 'RB' },
        { id: 3, positionType: 'RB' },
        { id: 4, positionType: 'RB' },
      ],
      occupiedRows: [
        { teamMemberId: 1, teamId: 1, positionId: 1, positionType: 'RB' },
        { teamMemberId: 2, teamId: 2, positionId: 2, positionType: 'RB' },
        { teamMemberId: 3, teamId: 2, positionId: 3, positionType: 'RB' },
      ],
      newCountByType: new Map([['RB', 2]]),
    });

    expect(plan.deletes).toHaveLength(2);
    // Keep ids are [1, 2] (ascending order). Team 2 already occupies keep
    // id 2 (teamMemberId 2), so its displaced second player (teamMemberId 3,
    // dropped from id 3) must land on the other keep id, 1.
    expect(plan.reassignments).toEqual([{ teamMemberId: 3, positionId: 1 }]);
  });

  it('reassigns displaced roster spots onto surviving rows without collisions within a team', () => {
    // 4 RB rows (ids 1-4). Team 1 occupies row 4 only; team 2 occupies rows
    // 2 and 3. Shrinking RB to 2 keeps rows [1, 2] and drops [3, 4] — team
    // 1's player (on row 4) and team 2's second player (on row 3) both need
    // reassignment, and must land on different rows from each other's team.
    const plan = planRosterPositionUpdate({
      currentPositions: [
        { id: 1, positionType: 'RB' },
        { id: 2, positionType: 'RB' },
        { id: 3, positionType: 'RB' },
        { id: 4, positionType: 'RB' },
      ],
      occupiedRows: [
        { teamMemberId: 10, teamId: 1, positionId: 4, positionType: 'RB' },
        { teamMemberId: 20, teamId: 2, positionId: 2, positionType: 'RB' },
        { teamMemberId: 21, teamId: 2, positionId: 3, positionType: 'RB' },
      ],
      newCountByType: new Map([['RB', 2]]),
    });

    expect(plan.deletes.sort()).toEqual([3, 4]);

    const reassignedTeam1 = plan.reassignments.find(
      (r) => r.teamMemberId === 10,
    );
    const reassignedTeam2 = plan.reassignments.find(
      (r) => r.teamMemberId === 21,
    );

    // Team 1's displaced player must land on a keep row (1 or 2) — not on
    // row 2, which team 2 already occupies via teamMemberId 20 (a different
    // team occupying the same shared row is fine; a *team* only needs to
    // avoid colliding with its own other assignments).
    expect([1, 2]).toContain(reassignedTeam1?.positionId);
    expect([1, 2]).toContain(reassignedTeam2?.positionId);
    // Team 2 already occupies row 2 (teamMemberId 20), so its displaced
    // player (teamMemberId 21) must not also land on row 2.
    expect(reassignedTeam2?.positionId).not.toBe(2);
  });

  it('is a no-op when requested counts match current counts', () => {
    const plan = planRosterPositionUpdate({
      currentPositions: [{ id: 1, positionType: 'QB' }],
      occupiedRows: [],
      newCountByType: new Map([['QB', 1]]),
    });

    expect(plan).toEqual({ inserts: [], reassignments: [], deletes: [] });
  });
});

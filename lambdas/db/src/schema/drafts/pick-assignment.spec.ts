/**
 * Pure unit tests for resolvePickAssignment — the draft order calculation
 * getCurrentDraftPickInfo uses (LS-8674 keeper round-penalty forfeited-pick
 * skipping, snake + linear order).
 */
import { resolvePickAssignment } from './helpers';

const TEAMS = [{ teamId: 1 }, { teamId: 2 }, { teamId: 3 }];

describe('resolvePickAssignment', () => {
  describe('no forfeitures — matches the original arithmetic', () => {
    it.each([
      // [overallPick, isSnake, expected]
      [1, false, { teamId: 1, round: 1, pickNumber: 1 }],
      [2, false, { teamId: 2, round: 1, pickNumber: 2 }],
      [4, false, { teamId: 1, round: 2, pickNumber: 1 }], // linear repeats order every round
      [4, true, { teamId: 3, round: 2, pickNumber: 1 }], // snake reverses even rounds
      [6, true, { teamId: 1, round: 2, pickNumber: 3 }],
      [7, true, { teamId: 1, round: 3, pickNumber: 1 }], // round 3 reverts to forward order
    ])('overallPick=%p isSnake=%p -> %j', (overallPick, isSnake, expected) => {
      expect(
        resolvePickAssignment({
          overallPick,
          seats: TEAMS,
          isSnake,
          forfeited: new Set(),
        }),
      ).toEqual(expected);
    });
  });

  describe('with a forfeited round-penalty pick', () => {
    it('skips the forfeiting team in a linear round', () => {
      // Team 2 forfeits round 1 — round 1 has only teams 1 and 3.
      const forfeited = new Set(['2:1']);

      expect(
        resolvePickAssignment({
          overallPick: 1,
          seats: TEAMS,
          isSnake: false,
          forfeited,
        }),
      ).toEqual({ teamId: 1, round: 1, pickNumber: 1 });

      expect(
        resolvePickAssignment({
          overallPick: 2,
          seats: TEAMS,
          isSnake: false,
          forfeited,
        }),
      ).toEqual({ teamId: 3, round: 1, pickNumber: 2 });

      // Round 2 is unaffected and starts right after round 1's 2 picks.
      expect(
        resolvePickAssignment({
          overallPick: 3,
          seats: TEAMS,
          isSnake: false,
          forfeited,
        }),
      ).toEqual({ teamId: 1, round: 2, pickNumber: 1 });
    });

    it('skips the forfeiting team on a reversed (even) snake round', () => {
      // Team 3 forfeits round 2 — the reversed order [3,2,1] loses its first slot.
      const forfeited = new Set(['3:2']);

      // Round 1: unaffected, 3 picks (1,2,3).
      expect(
        resolvePickAssignment({
          overallPick: 3,
          seats: TEAMS,
          isSnake: true,
          forfeited,
        }),
      ).toEqual({ teamId: 3, round: 1, pickNumber: 3 });

      // Round 2 (reversed order 3,2,1) skips team 3 -> starts with team 2.
      expect(
        resolvePickAssignment({
          overallPick: 4,
          seats: TEAMS,
          isSnake: true,
          forfeited,
        }),
      ).toEqual({ teamId: 2, round: 2, pickNumber: 1 });

      expect(
        resolvePickAssignment({
          overallPick: 5,
          seats: TEAMS,
          isSnake: true,
          forfeited,
        }),
      ).toEqual({ teamId: 1, round: 2, pickNumber: 2 });

      // Round 3 (forward order) is unaffected and starts right after
      // round 2's 2 (not 3) picks.
      expect(
        resolvePickAssignment({
          overallPick: 6,
          seats: TEAMS,
          isSnake: true,
          forfeited,
        }),
      ).toEqual({ teamId: 1, round: 3, pickNumber: 1 });
    });

    it('every team forfeiting different rounds keeps the draft moving with no gaps', () => {
      const forfeited = new Set(['1:1', '2:2', '3:3']);
      const picks = [];
      for (let overallPick = 1; overallPick <= 6; overallPick++) {
        picks.push(
          resolvePickAssignment({
            overallPick,
            seats: TEAMS,
            isSnake: false,
            forfeited,
          }),
        );
      }
      // Round 1 (team 1 out): teams 2,3. Round 2 (team 2 out): teams 1,3.
      // Round 3 (team 3 out): teams 1,2. Round 4: teams 1,2,3.
      expect(picks.map((p) => p?.teamId)).toEqual([2, 3, 1, 3, 1, 2]);
      expect(picks.map((p) => p?.round)).toEqual([1, 1, 2, 2, 3, 3]);
    });
  });
});

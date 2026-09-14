/**
 * Season-rollover roster/draft policy — unit tests (LS-8386).
 *
 * Covers `resolveRolloverContinuity`, the pure decision behind renewLeague's
 * roster copy and the new league's draft status. Dynasty is the only mode that
 * both carries rosters forward AND still holds a draft, so these cases pin the
 * two flags against every (continuity × keepRosters) combination rather than
 * only the dynasty happy path.
 */
import { resolveRolloverContinuity } from './mutations';

describe('resolveRolloverContinuity (LS-8386)', () => {
  describe('dynasty', () => {
    it('carries rosters forward AND holds a draft when keepRosters is true', () => {
      expect(resolveRolloverContinuity('dynasty', true)).toEqual({
        carryRosters: true,
        holdsDraft: true,
      });
    });

    it('still carries rosters forward when keepRosters is false', () => {
      // Full roster persistence is the definition of dynasty, so the
      // commissioner's keepRosters choice cannot switch it off — a dynasty
      // league that reset its rosters would not be a dynasty league.
      expect(resolveRolloverContinuity('dynasty', false)).toEqual({
        carryRosters: true,
        holdsDraft: true,
      });
    });
  });

  describe('keeper', () => {
    it('honours keepRosters: true — rosters carry, no draft is held', () => {
      // The carried roster is what designateKeeper reads; draft-init then
      // wipes it down to the locked keepers (LS-8674).
      expect(resolveRolloverContinuity('keeper', true)).toEqual({
        carryRosters: true,
        holdsDraft: false,
      });
    });

    it('honours keepRosters: false — empty rosters, draft is held', () => {
      expect(resolveRolloverContinuity('keeper', false)).toEqual({
        carryRosters: false,
        holdsDraft: true,
      });
    });
  });

  describe('redraft', () => {
    it('honours keepRosters: true', () => {
      expect(resolveRolloverContinuity('redraft', true)).toEqual({
        carryRosters: true,
        holdsDraft: false,
      });
    });

    it('honours keepRosters: false', () => {
      expect(resolveRolloverContinuity('redraft', false)).toEqual({
        carryRosters: false,
        holdsDraft: true,
      });
    });
  });

  describe('null / undefined continuity (pre-LS-8671 leagues)', () => {
    // Leagues created before the roster_continuity column existed read back
    // null; they must behave exactly like redraft, not like dynasty.
    it.each([
      [null, true, { carryRosters: true, holdsDraft: false }],
      [null, false, { carryRosters: false, holdsDraft: true }],
      [undefined, true, { carryRosters: true, holdsDraft: false }],
      [undefined, false, { carryRosters: false, holdsDraft: true }],
    ])('continuity=%p keepRosters=%p', (continuity, keepRosters, expected) => {
      expect(resolveRolloverContinuity(continuity, keepRosters)).toEqual(
        expected,
      );
    });
  });
});
